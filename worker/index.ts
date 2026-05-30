import Stripe from 'stripe';
import { jwtVerify, createRemoteJWKSet } from 'jose';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Env {
  // Stripe
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  // Stripe price IDs — set in wrangler.toml [vars] (not secrets; they're public)
  STRIPE_MONTHLY_PRICE_ID: string;
  STRIPE_YEARLY_PRICE_ID: string;
  // Firebase service account (for Firestore REST writes — bypasses security rules)
  FIREBASE_SERVICE_ACCOUNT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;        // PEM string, full RSA private key
  FIREBASE_PROJECT_ID: string;
  FIREBASE_DATABASE_ID: string;
  // Cloudflare bindings
  APP_KV: KVNamespace;
  AI: Ai;
  ASSETS: Fetcher;
  // Email — optional; app works without them (emails silently skipped)
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;   // e.g. "Dinner Table Cards <noreply@yourdomain.com>"
  // (ADMIN_SECRET removed — admin routes now require a Firebase ID token from an admin email)
}

// Module-level token cache — survives across requests in the same Worker isolate
let cachedFirestoreToken: { token: string; expiresAt: number } | null = null;

// Firebase ID-token verification: Google's public JWKS for securetoken.
// createRemoteJWKSet caches keys and refreshes them as needed.
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

// ── Allowed app origins — single source of truth for redirect URL validation ──

const APP_ORIGIN = 'https://dinnertablecards.xyz';

/** Origins that redirect URLs supplied by clients are allowed to start with. */
const ALLOWED_ORIGINS = [
  APP_ORIGIN,
  // Legacy workers.dev URL — keep during DNS transition so in-flight sessions aren't broken.
  'https://icebreaker-question-app.falling-hall-ac41.workers.dev',
  'http://localhost:5173',
  'http://localhost:4173',
];

/**
 * Verify a Firebase ID token from the Authorization: Bearer header.
 * Returns { uid, email } on success, or null if missing/invalid.
 */
async function verifyIdToken(request: Request, env: Env): Promise<{ uid: string; email: string | null } | null> {
  const authHeader = request.headers.get('Authorization') ?? '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  try {
    const { payload } = await jwtVerify(match[1], FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
    });
    if (!payload.sub) return null;
    return { uid: payload.sub, email: (payload.email as string) ?? null };
  } catch (err) {
    console.error('ID token verification failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Helper to return a 401 JSON response. */
function unauthorized(): Response {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * Attach standard security headers to every response — API JSON and static assets alike.
 * Prevents clickjacking, MIME-sniffing, forces HTTPS, and limits browser feature exposure.
 */
function addSecurityHeaders(response: Response): Response {
  const r = new Response(response.body, response);
  r.headers.set('X-Frame-Options', 'DENY');
  r.headers.set('X-Content-Type-Options', 'nosniff');
  r.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  r.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  r.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  r.headers.set('X-XSS-Protection', '1; mode=block');
  // Content-Security-Policy — deny-all baseline with explicit allowances for:
  //   • Bundled Vite JS + Tailwind CSS served from same origin
  //   • React inline style={{...}} props (requires 'unsafe-inline' for styles only)
  //   • Firebase Firestore, Auth (securetoken, identitytoolkit, accounts.google.com)
  //   • Google user avatars (lh3.googleusercontent.com)
  //   • Firebase Auth popup/iframe (project firebaseapp.com + accounts.google.com)
  // NOTE: if Cloudflare Web Analytics is enabled, also add
  //   https://static.cloudflareinsights.com to script-src and connect-src.
  r.headers.set(
    'Content-Security-Policy',
    "default-src 'none'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self' https://firestore.googleapis.com https://securetoken.googleapis.com " +
      "https://identitytoolkit.googleapis.com https://accounts.google.com https://oauth2.googleapis.com; " +
    "img-src 'self' https://lh3.googleusercontent.com data:; " +
    "frame-src https://gen-lang-client-0170753836.firebaseapp.com https://accounts.google.com; " +
    "frame-ancestors 'none'; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "font-src 'self'; " +
    "worker-src 'none'",
  );
  return r;
}

// ── Email (Resend) ─────────────────────────────────────────────────────────────

/**
 * Send a transactional email via Resend. Gracefully no-ops if RESEND_API_KEY is not set.
 * Uses RESEND_FROM env var (default: Resend's onboarding address for testing).
 * For production, add a verified domain in Resend and set RESEND_FROM in wrangler.toml.
 */
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  env: Env,
): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  const from = env.RESEND_FROM ?? 'Dinner Table Cards <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) console.error('Resend error:', await res.text());
  } catch (err) {
    console.error('sendEmail failed:', err);
  }
}

const APP_URL = 'https://dinnertablecards.xyz';

/** Shared email footer / button styles */
const EMAIL_BUTTON = `display:inline-block; background:#5A5A40; color:#F5F2ED; font-size:11px; letter-spacing:0.3em; text-transform:uppercase; padding:14px 28px; text-decoration:none;`;
const EMAIL_FOOTER = `<p style="font-size: 11px; color: #1A1A1A; opacity: 0.3; margin-top: 40px;">© ${new Date().getFullYear()} Cultivating Meaningful Dialogue · <a href="${APP_URL}/account" style="color:#1A1A1A;">Manage subscription</a></p>`;

function welcomeEmailHtml(_email: string): string {
  return `
  <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; background: #F5F2ED; color: #1A1A1A;">
    <p style="font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; opacity: 0.4; margin: 0 0 24px;">Dinner Table Cards · Welcome</p>
    <h1 style="font-size: 32px; font-style: italic; font-weight: 400; margin: 0 0 16px; line-height: 1.2;">You've set a place at the table.</h1>
    <p style="font-size: 15px; line-height: 1.8; opacity: 0.7; margin: 0 0 24px;">
      Thank you for joining. Each day brings a new question designed to spark real conversation — the kind that makes a meal memorable.
    </p>
    <p style="font-size: 15px; line-height: 1.8; opacity: 0.7; margin: 0 0 32px;">
      Your free plan includes 25 questions to get you started. When you're ready for more, upgrade any time from the app.
    </p>
    <a href="${APP_URL}" style="${EMAIL_BUTTON}">Open the app →</a>
    ${EMAIL_FOOTER}
  </div>`;
}

function premiumEmailHtml(plan: string): string {
  return `
  <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; background: #F5F2ED; color: #1A1A1A;">
    <p style="font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; opacity: 0.4; margin: 0 0 24px;">Dinner Table Cards · Premium</p>
    <h1 style="font-size: 32px; font-style: italic; font-weight: 400; margin: 0 0 16px; line-height: 1.2;">Welcome to the full archive.</h1>
    <p style="font-size: 15px; line-height: 1.8; opacity: 0.7; margin: 0 0 24px;">
      Your ${plan} plan is now active. Every category is unlocked — including Philosophy, Date Night, and Creative Sparks — and you have access to hundreds of questions per month.
    </p>
    <p style="font-size: 15px; line-height: 1.8; opacity: 0.7; margin: 0 0 32px;">
      Manage or cancel your subscription at any time from your account page.
    </p>
    <a href="${APP_URL}" style="${EMAIL_BUTTON}">Start exploring →</a>
    ${EMAIL_FOOTER}
  </div>`;
}

function streakMilestoneEmailHtml(streak: number, topCategory: string): string {
  const emojis: Record<number, string> = { 3: '🌱', 7: '🔥', 14: '⚡', 30: '🏆' };
  const labels: Record<number, string> = {
    3:  'Three days of better conversations.',
    7:  'One week of meaningful dialogue.',
    14: 'Two weeks — you\'re building a real habit.',
    30: 'Thirty days. You\'ve changed how you connect.',
  };
  return `
  <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; background: #F5F2ED; color: #1A1A1A;">
    <p style="font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; opacity: 0.4; margin: 0 0 24px;">Dinner Table Cards · Streak</p>
    <p style="font-size: 40px; margin: 0 0 12px;">${emojis[streak] ?? '🔥'}</p>
    <h1 style="font-size: 28px; font-style: italic; font-weight: 400; margin: 0 0 16px; line-height: 1.2;">${labels[streak] ?? `${streak} days in a row.`}</h1>
    <p style="font-size: 15px; line-height: 1.8; opacity: 0.7; margin: 0 0 12px;">
      You've used Dinner Table Cards <strong>${streak} days in a row</strong>.
      Your most-used category: <em>${topCategory}</em>.
    </p>
    <p style="font-size: 15px; line-height: 1.8; opacity: 0.7; margin: 0 0 32px;">
      Keep the conversation going — today's question is waiting.
    </p>
    <a href="${APP_URL}" style="${EMAIL_BUTTON}">Open today's question →</a>
    ${EMAIL_FOOTER}
  </div>`;
}

// ── Router ────────────────────────────────────────────────────────────────────

/**
 * Inner routing logic — returns a raw Response.
 * The exported fetch handler wraps every response with addSecurityHeaders().
 */
async function routeRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/api/health') {
    return Response.json({ status: 'ok' });
  }

  // ── Firebase auth handler proxy ───────────────────────────────────────────
  // Firebase's signInWithRedirect uses [authDomain]/__/auth/ as the OAuth
  // callback route. Since authDomain is now dinnertablecards.xyz, we proxy
  // these requests transparently to Firebase's real auth infrastructure so
  // the Google sign-in screen shows "dinnertablecards.xyz" instead of the
  // raw Firebase project ID.
  if (url.pathname.startsWith('/__/auth/')) {
    const firebaseAuthUrl =
      `https://gen-lang-client-0170753836.firebaseapp.com${url.pathname}${url.search}`;
    const proxyReq = new Request(firebaseAuthUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'manual', // let the browser follow redirects so OAuth flow works
    });
    return fetch(proxyReq);
  }
  if (url.pathname === '/api/create-checkout-session' && request.method === 'POST') {
    return handleCheckout(request, env);
  }
  if (url.pathname === '/api/stripe-webhook' && request.method === 'POST') {
    return handleStripeWebhook(request, env);
  }
  if (url.pathname === '/api/generate-question' && request.method === 'POST') {
    return handleGenerateQuestion(request, env);
  }
  if (url.pathname === '/api/referral' && request.method === 'POST') {
    return handleReferral(request, env);
  }
  if (url.pathname === '/api/consume' && request.method === 'POST') {
    return handleConsume(request, env);
  }
  if (url.pathname === '/api/billing-portal' && request.method === 'POST') {
    return handleBillingPortal(request, env);
  }
  if (url.pathname === '/api/delete-account' && request.method === 'POST') {
    return handleDeleteAccount(request, env);
  }
  if (url.pathname === '/api/admin/reset-usage' && request.method === 'POST') {
    return handleAdminResetUsage(request, env);
  }
  // /api/admin/reset-by-email was removed — it used weaker X-Admin-Secret auth and
  // allowed resetting arbitrary user accounts. Use /api/admin/reset-usage instead
  // (requires a valid Firebase ID token from an admin-listed email).

  return env.ASSETS.fetch(request);
}

export default {
  /** Every response — API JSON and static assets — gets security headers applied. */
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await routeRequest(request, env);
    return addSecurityHeaders(response);
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    await resetMonthlyUsage(env);
  },
} satisfies ExportedHandler<Env>;

// ── Stripe Checkout ───────────────────────────────────────────────────────────

async function handleCheckout(request: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) {
    return Response.json({ error: 'Stripe is not configured' }, { status: 500 });
  }

  // Authenticate: the buyer is whoever the verified token says — never trust a body UID.
  const auth = await verifyIdToken(request, env);
  if (!auth) return unauthorized();

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  try {
    const body = await request.json() as {
      priceId: string;
      successUrl: string;
      cancelUrl: string;
      mode: 'subscription' | 'payment';
    };

    // Guard against missing env vars — misconfiguration, not user error.
    if (!env.STRIPE_MONTHLY_PRICE_ID || !env.STRIPE_YEARLY_PRICE_ID) {
      console.error('Stripe price ID env vars are not configured');
      return Response.json({ error: 'Checkout is not configured.' }, { status: 500 });
    }

    // Reject any price ID not explicitly issued by this app — prevents a user
    // substituting a cheaper/different price from the same Stripe account.
    const ALLOWED_PRICE_IDS = [env.STRIPE_MONTHLY_PRICE_ID, env.STRIPE_YEARLY_PRICE_ID];
    if (!body.priceId || !ALLOWED_PRICE_IDS.includes(body.priceId)) {
      return Response.json({ error: 'Invalid price ID.' }, { status: 400 });
    }

    // Validate redirect URLs against the app's own origins to prevent open redirects.
    const successUrl = ALLOWED_ORIGINS.some(o => (body.successUrl ?? '').startsWith(o))
      ? body.successUrl
      : APP_ORIGIN + '?payment=success';
    const cancelUrl = ALLOWED_ORIGINS.some(o => (body.cancelUrl ?? '').startsWith(o))
      ? body.cancelUrl
      : APP_ORIGIN + '?payment=cancel';

    const firebaseUid = auth.uid;
    const customerEmail = auth.email ?? undefined;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: body.priceId, quantity: 1 }],
      mode: body.mode ?? 'subscription',
      customer_email: customerEmail,
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Store Firebase UID + priceId so webhook can map payment → user and plan
      // without needing to expand line_items (which requires an extra API call)
      metadata: { firebaseUid, priceId: body.priceId },
    });

    // Pre-cache email → UID mapping in KV as a fallback for the webhook
    if (customerEmail) {
      await env.APP_KV.put(`email:${customerEmail}`, firebaseUid, { expirationTtl: 60 * 60 * 24 * 30 });
    }

    return Response.json({ id: session.id, url: session.url });
  } catch (err: unknown) {
    console.error('Stripe Checkout Error:', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Checkout failed — please try again.' }, { status: 500 });
  }
}

// ── Stripe Webhook ────────────────────────────────────────────────────────────

async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY) {
    return Response.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  // IMPORTANT: read raw body as text BEFORE any JSON parsing — Stripe SDK needs raw string
  const rawBody = await request.text();
  // Support both classic webhooks (stripe-signature) and new Event Destinations (webhook-signature)
  const signature = request.headers.get('stripe-signature') ?? request.headers.get('webhook-signature');
  if (!signature) return Response.json({ error: 'Missing signature' }, { status: 400 });

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Signature error';
    console.error('Webhook signature verification failed:', message);
    return Response.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const uid = session.metadata?.firebaseUid
          ?? await env.APP_KV.get(`email:${session.customer_email}`);

        if (!uid) {
          console.error('No Firebase UID found for session', session.id);
          break;
        }

        // Cache stripeCustomerId → uid for subscription lifecycle events
        if (session.customer) {
          await env.APP_KV.put(`customer:${session.customer}`, uid, { expirationTtl: 60 * 60 * 24 * 365 });
        }

        const planMap: Record<string, string> = {
          [env.STRIPE_MONTHLY_PRICE_ID]: 'monthly',
          [env.STRIPE_YEARLY_PRICE_ID]:  'yearly',
        };

        // Determine plan: prefer priceId stored in metadata (set at checkout creation),
        // fall back to line_items if available (requires expansion), then default to monthly
        const priceId = session.metadata?.priceId
          ?? session.line_items?.data?.[0]?.price?.id
          ?? '';
        const subscriptionPlan = planMap[priceId] ?? 'monthly';

        await updateFirestoreUser(uid, {
          isPremium: true,
          subscriptionPlan,
          subscriptionStatus: 'active',
          ...(session.customer && { stripeCustomerId: String(session.customer) }),
        }, env);

        // Send payment confirmation email
        const customerEmail = session.customer_email;
        if (customerEmail) {
          sendEmail(
            customerEmail,
            `You're now Premium — Dinner Table Cards`,
            premiumEmailHtml(subscriptionPlan),
            env,
          ).catch(() => {});
        }

        console.log(`✅ Upgraded user ${uid} to ${subscriptionPlan}`);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const uid = await env.APP_KV.get(`customer:${sub.customer}`);
        if (!uid) break;

        const statusMap: Record<string, string> = {
          active: 'active',
          past_due: 'past_due',
          canceled: 'canceled',
          unpaid: 'canceled',
        };

        await updateFirestoreUser(uid, {
          subscriptionStatus: statusMap[sub.status] ?? 'none',
          isPremium: sub.status === 'active',
        }, env);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const uid = await env.APP_KV.get(`customer:${sub.customer}`);
        if (!uid) break;

        await updateFirestoreUser(uid, {
          isPremium: false,
          subscriptionPlan: 'free',
          subscriptionStatus: 'canceled',
        }, env);

        console.log(`⬇️ Downgraded user ${uid} to free`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const uid = await env.APP_KV.get(`customer:${invoice.customer}`);
        if (!uid) break;
        await updateFirestoreUser(uid, { subscriptionStatus: 'past_due' }, env);
        break;
      }
    }
  } catch (err: unknown) {
    // Return 500 so Stripe retries — our handlers are idempotent (re-setting
    // isPremium/plan is harmless), so a retry recovers from transient failures
    // instead of silently leaving a paid user without premium.
    console.error('Webhook handler error:', err);
    return Response.json({ received: false }, { status: 500 });
  }

  return Response.json({ received: true });
}

// ── Firestore REST helpers ────────────────────────────────────────────────────

/**
 * Get a short-lived Google OAuth2 access token using a service account JWT.
 * Uses Web Crypto API (crypto.subtle) — works in Cloudflare Workers.
 * Token is cached in module scope and refreshed 60s before expiry.
 */
async function getFirestoreToken(env: Env): Promise<string> {
  const now = Date.now();
  if (cachedFirestoreToken && now < cachedFirestoreToken.expiresAt - 60_000) {
    return cachedFirestoreToken.token;
  }

  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;

  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const payload = btoa(JSON.stringify({
    iss: env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp,
  })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const signingInput = `${header}.${payload}`;

  // Import the service account RSA private key
  const pemBody = env.FIREBASE_PRIVATE_KEY
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '')
    .trim();
  const keyBuffer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const jwt = `${signingInput}.${signature}`;

  // Exchange JWT for Google access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Failed to get Firestore token: ${body}`);
  }

  const { access_token } = await tokenRes.json() as { access_token: string };
  cachedFirestoreToken = { token: access_token, expiresAt: exp * 1000 };
  return access_token;
}

/**
 * GET a user document from Firestore via REST API (service account token).
 * Returns a plain JS object of the user's fields, or null if the doc doesn't exist.
 */
async function getFirestoreUser(uid: string, env: Env): Promise<Record<string, unknown> | null> {
  const token = await getFirestoreToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/${env.FIREBASE_DATABASE_ID}/documents/users/${uid}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET failed (${res.status}): ${await res.text()}`);
  const doc = await res.json() as { fields?: Record<string, Record<string, unknown>> };
  return parseFirestoreFields(doc.fields ?? {});
}

/** Convert Firestore REST value format back to plain JS values. */
function parseFirestoreFields(fields: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if ('stringValue' in value) result[key] = value.stringValue;
    else if ('booleanValue' in value) result[key] = value.booleanValue;
    else if ('integerValue' in value) result[key] = Number(value.integerValue);
    else if ('doubleValue' in value) result[key] = value.doubleValue;
    else if ('timestampValue' in value) result[key] = value.timestampValue;
    else if ('nullValue' in value) result[key] = null;
  }
  return result;
}

/**
 * PATCH a user document in Firestore via REST API.
 * Uses a service account token — bypasses Firestore security rules.
 * Only updates the specified fields (updateMask), leaving others untouched.
 */
async function updateFirestoreUser(
  uid: string,
  fields: Record<string, unknown>,
  env: Env,
): Promise<void> {
  const token = await getFirestoreToken(env);
  const fieldPaths = Object.keys(fields);
  const maskParams = fieldPaths.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/${env.FIREBASE_DATABASE_ID}/documents/users/${uid}?${maskParams}`;

  const body = JSON.stringify({ fields: toFirestoreFields(fields) });

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Firestore PATCH failed (${res.status}): ${errBody}`);
  }
}

/** Convert a plain JS object to Firestore REST value format */
function toFirestoreFields(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value instanceof Date)           result[key] = { timestampValue: value.toISOString() };
    else if (typeof value === 'string')  result[key] = { stringValue: value };
    else if (typeof value === 'boolean') result[key] = { booleanValue: value };
    else if (typeof value === 'number')  result[key] = { integerValue: String(value) };
    else if (value === null)             result[key] = { nullValue: null };
    // Arrays and nested objects are not needed for current use-cases; skip silently
  }
  return result;
}

// ── Monthly Usage Reset (Cron: 0 0 1 * *) ────────────────────────────────────

async function resetMonthlyUsage(env: Env): Promise<void> {
  const token = await getFirestoreToken(env);
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/${env.FIREBASE_DATABASE_ID}`;

  // Page through all active paid users in chunks of PAGE_SIZE.
  // Query: subscriptionStatus == 'active' AND subscriptionPlan IN ['monthly','yearly']
  // Ordered by __name__ so startAfter cursor works correctly.
  const PAGE_SIZE = 300;
  let cursor: string | null = null;
  let totalReset = 0;
  let page = 0;

  do {
    const structuredQuery: Record<string, unknown> = {
      from: [{ collectionId: 'users' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'subscriptionStatus' },
                op: 'EQUAL',
                value: { stringValue: 'active' },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'subscriptionPlan' },
                op: 'IN',
                value: {
                  arrayValue: {
                    values: [{ stringValue: 'monthly' }, { stringValue: 'yearly' }],
                  },
                },
              },
            },
          ],
        },
      },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
      limit: PAGE_SIZE,
    };

    if (cursor) {
      (structuredQuery as Record<string, unknown>).startAfter = {
        values: [{ referenceValue: cursor }],
      };
    }

    const queryRes = await fetch(`${baseUrl}/documents:runQuery`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery }),
    });

    if (!queryRes.ok) {
      console.error(`Monthly reset query failed (page ${page}):`, await queryRes.text());
      return;
    }

    const results = await queryRes.json() as Array<{
      document?: { name: string; fields: Record<string, unknown> };
    }>;
    const docs = results.filter(r => r.document);

    if (docs.length === 0) break;

    // Write usageCount=0 for this page (batchWrite accepts up to 500 at once)
    const writes = docs.map(r => ({
      update: {
        name: r.document!.name,
        fields: { usageCount: { integerValue: '0' } },
      },
      updateMask: { fieldPaths: ['usageCount'] },
    }));

    const batchRes = await fetch(`${baseUrl}/documents:batchWrite`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes }),
    });

    if (!batchRes.ok) {
      console.error(`Batch reset failed (page ${page}):`, await batchRes.text());
    } else {
      totalReset += writes.length;
      console.log(`✅ Reset ${writes.length} users (page ${page + 1}; total ${totalReset})`);
    }

    // Advance cursor to the last document in this page
    cursor = docs[docs.length - 1].document!.name;
    page++;

    // If we got fewer docs than PAGE_SIZE, we've exhausted the collection
    if (docs.length < PAGE_SIZE) break;
  } while (true);

  console.log(`✅ Monthly reset complete — ${totalReset} users total`);
}

// ── Usage Enforcement (server-authoritative) ──────────────────────────────────

// Mirror of src/constants.ts PLANS limits. Server is the source of truth.
const PLAN_LIMITS: Record<string, number> = { free: 25, monthly: 100, yearly: 500 };

/**
 * Authoritative "consume one question" endpoint. Checks the user's remaining
 * quota server-side, then increments usageCount + streak via the service account
 * (so the client can never mint free usage by writing Firestore directly).
 * Returns 402 when the limit is reached.
 */
async function handleConsume(request: Request, env: Env): Promise<Response> {
  const auth = await verifyIdToken(request, env);
  if (!auth) return unauthorized();
  const uid = auth.uid;

  const user = await getFirestoreUser(uid, env);
  if (!user) {
    // No profile yet — the client creates it on first sign-in. Treat as no usage.
    return Response.json({ error: 'No profile' }, { status: 404 });
  }

  const plan = (user.subscriptionPlan as string) || 'free';
  const bonus = (user.bonusQuestions as number) || 0;
  const usageCount = (user.usageCount as number) || 0;
  const limit = (PLAN_LIMITS[plan] ?? PLAN_LIMITS.free) + bonus;

  if (usageCount >= limit) {
    return Response.json({ allowed: false, reason: 'limit', usageCount, limit }, { status: 402 });
  }

  // Increment usage + streak (logic ported from firestoreUtils.incrementUsage).
  const today = new Date().toISOString().split('T')[0];
  const lastActive = (user.lastActiveDate as string) || '';

  try {
    if (lastActive === today) {
      await incrementFirestoreUser(uid, { usageCount: 1 }, env);
    } else {
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = yesterdayDate.toISOString().split('T')[0];
      const prevStreak = (user.currentStreak as number) || 0;
      const currentStreak = lastActive === yesterday ? prevStreak + 1 : 1;
      const longestStreak = Math.max((user.longestStreak as number) || 0, currentStreak);

      await incrementFirestoreUser(uid, { usageCount: 1 }, env);
      await updateFirestoreUser(uid, { currentStreak, longestStreak, lastActiveDate: today }, env);
    }
  } catch (err) {
    console.error('Consume increment failed:', err);
    return Response.json({ error: 'Increment failed' }, { status: 500 });
  }

  // Determine the new streak for email logic — reuses `today` and `lastActive` declared above
  const yesterdayForMilestone = new Date();
  yesterdayForMilestone.setDate(yesterdayForMilestone.getDate() - 1);
  const yesterdayStr = yesterdayForMilestone.toISOString().split('T')[0];
  const prevStreakVal = (user.currentStreak as number) || 0;
  const newStreak = lastActive === today
    ? prevStreakVal  // same day — streak unchanged
    : lastActive === yesterdayStr
      ? prevStreakVal + 1
      : 1;

  // Send welcome email the very first time a user consumes a question.
  if (usageCount === 0 && auth.email) {
    sendEmail(
      auth.email,
      'Welcome to Dinner Table Cards 🍽️',
      welcomeEmailHtml(auth.email),
      env,
    ).catch(() => {});
  }

  // Send streak milestone emails at 3, 7, 14, 30 days.
  // Only fire when the streak crosses the milestone for the first time today.
  const STREAK_MILESTONES = [3, 7, 14, 30];
  if (auth.email && lastActive !== today && STREAK_MILESTONES.includes(newStreak)) {
    // Deduplicate: use KV to ensure we only send once per milestone per user
    const milestoneKey = `streak-email:${uid}:${newStreak}`;
    const already = await env.APP_KV.get(milestoneKey);
    if (!already) {
      await env.APP_KV.put(milestoneKey, '1', { expirationTtl: 60 * 60 * 24 * 365 });
      sendEmail(
        auth.email,
        `${newStreak} days in a row 🔥 — Dinner Table Cards`,
        streakMilestoneEmailHtml(newStreak, 'Deep Talk'),
        env,
      ).catch(() => {});
    }
  }

  return Response.json({ allowed: true, usageCount: usageCount + 1, limit });
}

// ── Billing Portal & Account Deletion ─────────────────────────────────────────

/** Create a Stripe billing portal session so the user can manage/cancel their sub. */
async function handleBillingPortal(request: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) {
    return Response.json({ error: 'Stripe not configured' }, { status: 500 });
  }
  const auth = await verifyIdToken(request, env);
  if (!auth) return unauthorized();

  const user = await getFirestoreUser(auth.uid, env);
  const customerId = user?.stripeCustomerId as string | undefined;
  if (!customerId) {
    return Response.json({ error: 'No subscription found' }, { status: 400 });
  }

  let body: { returnUrl?: string };
  try { body = await request.json(); } catch { body = {}; }

  // Validate returnUrl to prevent open redirects — uses shared ALLOWED_ORIGINS constant.
  const safeReturnUrl = body.returnUrl &&
    ALLOWED_ORIGINS.some(o => (body.returnUrl ?? '').startsWith(o))
    ? body.returnUrl
    : APP_ORIGIN + '/account';

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: safeReturnUrl,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    console.error('Billing portal error:', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Could not open billing portal — please try again.' }, { status: 500 });
  }
}

/**
 * Delete the caller's own Firestore data (user doc + favorites/history subcollections)
 * via the service account. The client separately deletes the Firebase Auth user.
 */
async function handleDeleteAccount(request: Request, env: Env): Promise<Response> {
  const auth = await verifyIdToken(request, env);
  if (!auth) return unauthorized();
  const uid = auth.uid;

  try {
    const token = await getFirestoreToken(env);
    const base = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/${env.FIREBASE_DATABASE_ID}/documents`;

    // Delete ALL subcollection docs across multiple pages (prevents data leakage for
    // power users who have > 300 favorites or history items).
    for (const sub of ['favorites', 'history']) {
      let nextPageToken: string | undefined;
      do {
        const listUrl = `${base}/users/${uid}/${sub}?pageSize=300` +
          (nextPageToken ? `&pageToken=${encodeURIComponent(nextPageToken)}` : '');
        const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (!listRes.ok) break;

        const data = await listRes.json() as { documents?: Array<{ name: string }>; nextPageToken?: string };
        const docs = data.documents ?? [];

        // Batch-delete this page of documents.
        await Promise.all(
          docs.map(d =>
            fetch(`https://firestore.googleapis.com/v1/${d.name}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            }),
          ),
        );

        nextPageToken = data.nextPageToken;
      } while (nextPageToken);
    }

    await fetch(`${base}/users/${uid}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error('Delete account error:', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Account deletion failed — please try again.' }, { status: 500 });
  }
}

// ── Admin Utilities ───────────────────────────────────────────────────────────

const ADMIN_EMAILS = ['darshan.p.hegde@gmail.com'];

/**
 * Admin-only: reset usageCount to 0 for the requesting user (or an optional uid).
 * Useful after testing to unblock yourself without touching the Firebase Console.
 */
async function handleAdminResetUsage(request: Request, env: Env): Promise<Response> {
  const auth = await verifyIdToken(request, env);
  if (!auth) return unauthorized();

  if (!ADMIN_EMAILS.includes(auth.email ?? '')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { uid?: string } = {};
  try { body = await request.json(); } catch { /* empty body ok */ }

  const targetUid = body.uid ?? auth.uid;

  try {
    await updateFirestoreUser(targetUid, { usageCount: 0 }, env);
    console.log(`✅ Admin reset usageCount for ${targetUid}`);
    return Response.json({ ok: true, uid: targetUid });
  } catch (err) {
    console.error('Admin reset error:', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Reset failed.' }, { status: 500 });
  }
}

// ── Referral System ──────────────────────────────────────────────────────────

const REFERRAL_BONUS = 50; // bonus questions awarded to the referrer per signup

/**
 * Handles referral registration + attribution in one call (invoked once per new user).
 * Authenticated: the uid is taken from the verified ID token, never the body.
 * Body: { code, referredByCode? }
 *  1. Registers KV `ref:<code>` → uid so this user's link can be attributed later.
 *  2. If referredByCode maps to a *different* user AND this user hasn't already been
 *     attributed (referredBy unset), atomically credits that referrer (+1 count, +50 bonus).
 *     The referredBy guard makes the endpoint replay-safe — bonuses can't be farmed.
 */
async function handleReferral(request: Request, env: Env): Promise<Response> {
  const auth = await verifyIdToken(request, env);
  if (!auth) return unauthorized();
  const uid = auth.uid;

  let body: { code?: string; referredByCode?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { code, referredByCode } = body;
  // Validate the code shape (the client derives it from the UID; keep it tight).
  if (!code || !/^[A-Z0-9]{4,16}$/.test(code)) {
    return Response.json({ error: 'Invalid code' }, { status: 400 });
  }

  // Rate limit: max 5 referral calls per user per day to prevent farming/replay.
  const DAILY_REFERRAL_LIMIT = 5;
  const today = new Date().toISOString().split('T')[0];
  const refRateKey = `rl:ref:${uid}:${today}`;
  const refCount = parseInt((await env.APP_KV.get(refRateKey)) ?? '0', 10);
  if (refCount >= DAILY_REFERRAL_LIMIT) {
    return Response.json({ error: 'Rate limit exceeded — try again tomorrow.' }, { status: 429 });
  }
  await env.APP_KV.put(refRateKey, String(refCount + 1), { expirationTtl: 86400 });

  // 1. Register this user's own referral code (idempotent).
  await env.APP_KV.put(`ref:${code}`, uid);

  // 2. Attribute the inbound referral, if any.
  let credited = false;
  if (referredByCode && referredByCode !== code && /^[A-Z0-9]{4,16}$/.test(referredByCode)) {
    const referrerUid = await env.APP_KV.get(`ref:${referredByCode}`);
    if (referrerUid && referrerUid !== uid) {
      try {
        // Replay guard: only credit if this user hasn't been attributed before.
        const existing = await getFirestoreUser(uid, env);
        if (existing && !existing.referredBy) {
          // Record attribution first so a retry can't double-credit.
          await updateFirestoreUser(uid, { referredBy: referrerUid }, env);
          await incrementFirestoreUser(
            referrerUid,
            { referralCount: 1, bonusQuestions: REFERRAL_BONUS },
            env,
          );
          credited = true;
          console.log(`✅ Referral: ${referrerUid} credited +${REFERRAL_BONUS} for new user ${uid}`);
        }
      } catch (err) {
        console.error('Referral credit failed:', err);
      }
    }
  }

  return Response.json({ ok: true, credited });
}

/** Atomically increment numeric fields on a user doc via Firestore commit transforms. */
async function incrementFirestoreUser(
  uid: string,
  increments: Record<string, number>,
  env: Env,
): Promise<void> {
  const token = await getFirestoreToken(env);
  const docName = `projects/${env.FIREBASE_PROJECT_ID}/databases/${env.FIREBASE_DATABASE_ID}/documents/users/${uid}`;
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/${env.FIREBASE_DATABASE_ID}/documents:commit`;

  const fieldTransforms = Object.entries(increments).map(([fieldPath, amount]) => ({
    fieldPath,
    increment: { integerValue: String(amount) },
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [{ transform: { document: docName, fieldTransforms } }] }),
  });

  if (!res.ok) {
    throw new Error(`Firestore increment failed (${res.status}): ${await res.text()}`);
  }
}

// ── Workers AI — "Surprise Me" question generation ────────────────────────────

async function handleGenerateQuestion(request: Request, env: Env): Promise<Response> {
  if (!env.AI) {
    return Response.json({ error: 'AI binding not configured' }, { status: 500 });
  }

  // Require auth so anonymous callers can't drain Workers AI inference credits.
  const auth = await verifyIdToken(request, env);
  if (!auth) return unauthorized();

  // Rate limit: 10 AI generations per user per calendar day (KV sliding window).
  const DAILY_AI_LIMIT = 10;
  const today = new Date().toISOString().split('T')[0];
  const rateKey = `rl:gen:${auth.uid}:${today}`;
  const rlCount = parseInt((await env.APP_KV.get(rateKey)) ?? '0', 10);
  if (rlCount >= DAILY_AI_LIMIT) {
    return Response.json(
      { error: `Daily AI limit reached (${DAILY_AI_LIMIT}/day). Try again tomorrow.`, limit: DAILY_AI_LIMIT },
      { status: 429 },
    );
  }
  await env.APP_KV.put(rateKey, String(rlCount + 1), { expirationTtl: 86400 });

  // Allowlists mirror src/types.ts — validated server-side to prevent prompt injection.
  const VALID_CATEGORIES = new Set([
    'Icebreaker', 'Deep Talk', 'Funny', 'Team Building',
    'Date Night', 'Philosophy', 'Creative Sparks',
  ]);
  const VALID_DIFFICULTIES = new Set(['Light', 'Deep', 'Random']);

  let category: string, difficulty: string;
  try {
    const body = await request.json() as { category?: unknown; difficulty?: unknown };
    category  = typeof body.category  === 'string' ? body.category  : '';
    difficulty = typeof body.difficulty === 'string' ? body.difficulty : '';
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Reject anything outside the known allowlists to block prompt injection.
  if (!VALID_CATEGORIES.has(category) || !VALID_DIFFICULTIES.has(difficulty)) {
    return Response.json({ error: 'Invalid category or difficulty' }, { status: 400 });
  }

  try {
    const effectiveDifficulty = difficulty === 'Random'
      ? (Math.random() > 0.5 ? 'Light' : 'Deep')
      : difficulty;
    const depthGuide = effectiveDifficulty === 'Deep'
      ? 'thought-provoking and introspective'
      : 'light, fun, and easy to answer';

    // Category and difficulty come from a server-side allowlist — safe to interpolate.
    const messages: RoleScopedChatInput[] = [
      {
        role: 'system',
        content: 'You generate dinner-table conversation starters. Respond with ONLY a JSON object: {"text":"<the question>"}. No markdown, no explanation, no extra keys.',
      },
      {
        role: 'user',
        content: `Write one ${depthGuide} conversation starter for the "${category}" category. It should feel fresh and original. Return only: {"text":"..."}`,
      },
    ];

    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages,
      max_tokens: 120,
    }) as { response: string };

    const raw = result.response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(raw) as { text: string };
    if (!parsed.text || typeof parsed.text !== 'string') throw new Error('Empty question from model');

    return Response.json({ text: parsed.text });
  } catch (err: unknown) {
    console.error('Workers AI Error:', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Question generation failed — please try again.' }, { status: 500 });
  }
}
