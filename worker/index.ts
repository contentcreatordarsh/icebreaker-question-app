import { jwtVerify, createRemoteJWKSet } from 'jose';
import * as Sentry from '@sentry/cloudflare';

// Re-export Durable Object class so wrangler can discover it from the entrypoint.
export { GameSession } from './game-session';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Env {
  // Firebase service account (for Firestore REST writes — bypasses security rules)
  FIREBASE_SERVICE_ACCOUNT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;        // PEM string, full RSA private key
  FIREBASE_PROJECT_ID: string;
  FIREBASE_DATABASE_ID: string;
  // Cloudflare bindings
  APP_KV: KVNamespace;
  AI: Ai;
  ASSETS: Fetcher;
  // Durable Objects — live game sessions
  GAME_SESSIONS: DurableObjectNamespace;
  // Email — optional; app works without them (emails silently skipped)
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;   // e.g. "Dinner Table Cards <noreply@yourdomain.com>"
  // Error monitoring (optional — no-op when unset). Set via `wrangler secret put SENTRY_DSN`.
  SENTRY_DSN?: string;
  // (ADMIN_SECRET removed — admin routes now require a Firebase ID token from an admin email)
}

// Module-level token cache — survives across requests in the same Worker isolate.
// pendingRefresh coalesces concurrent token refreshes into one API call.
let cachedFirestoreToken: { token: string; expiresAt: number } | null = null;
let pendingRefresh: Promise<string> | null = null;

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
async function verifyIdToken(
  request: Request,
  env: Env,
): Promise<{ uid: string; email: string | null; emailVerified: boolean } | null> {
  const authHeader = request.headers.get('Authorization') ?? '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  try {
    const { payload } = await jwtVerify(match[1], FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
      // Pin the signing algorithm: Firebase ID tokens are always RS256. Explicitly
      // restricting it blocks algorithm-confusion attacks (e.g. forged "alg":"none"
      // or HS256 tokens signed with the public key).
      algorithms: ['RS256'],
    });
    if (!payload.sub) return null;
    return {
      uid: payload.sub,
      email: (payload.email as string) ?? null,
      emailVerified: payload.email_verified === true,
    };
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
 * Gate for owner-only endpoints. Returns the verified admin identity, or a ready
 * Response (401/403) to return directly. Requires, in order: a valid Firebase ID
 * token (verifyIdToken), a *verified* email, and membership in ADMIN_EMAILS. This
 * is the single source of truth for admin authorization — every /api/admin/*
 * handler funnels through it so the checks can never drift apart.
 */
type AdminAuth = { uid: string; email: string | null; emailVerified: boolean };

async function requireAdmin(request: Request, env: Env): Promise<AdminAuth | Response> {
  const auth = await verifyIdToken(request, env);
  if (!auth) return unauthorized();
  const email = auth.email ?? '';
  if (!auth.emailVerified || !ADMIN_EMAILS.includes(email)) {
    // Log denied attempts for observability (allowed attempts are uninteresting noise).
    console.warn(`[admin] denied: uid=${auth.uid} email=${email || '(none)'} verified=${auth.emailVerified}`);
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  return auth;
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
  // Content-Security-Policy — 'self' baseline with explicit allowances for:
  //   • Bundled Vite JS + Tailwind CSS served from same origin
  //   • React inline style={{...}} props (requires 'unsafe-inline' for styles only)
  //   • Firebase Firestore, Auth (securetoken, identitytoolkit, accounts.google.com)
  //   • Google user avatars (lh3.googleusercontent.com)
  //   • Firebase Auth popup/iframe (project firebaseapp.com + accounts.google.com)
  //   • PWA manifest (manifest-src 'self')
  // Cloudflare Web Analytics is allowed in CSP (beacon script + connect for reporting).
  r.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; " +
    // apis.google.com hosts the gapi script (api.js) Firebase Auth uses to set
    // up its cross-frame messaging relay for getRedirectResult.
    "script-src 'self' https://apis.google.com https://static.cloudflareinsights.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self' wss: https://firestore.googleapis.com https://securetoken.googleapis.com " +
      "https://identitytoolkit.googleapis.com https://accounts.google.com https://oauth2.googleapis.com " +
      "https://apis.google.com https://www.googleapis.com " +
      "https://cloudflareinsights.com https://*.sentry.io; " +
    "img-src 'self' https://lh3.googleusercontent.com data:; " +
    // Firebase Auth loads its helper iframe from the authDomain (now our own
    // origin, 'self', i.e. /__/auth/iframe) plus a gapi relay iframe from
    // apis.google.com. Without 'self' + apis.google.com here, getRedirectResult
    // fails with auth/internal-error. firebaseapp.com kept for completeness.
    "frame-src 'self' https://apis.google.com https://gen-lang-client-0170753836.firebaseapp.com https://accounts.google.com; " +
    "frame-ancestors 'none'; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "font-src 'self'; " +
    "manifest-src 'self'; " +
    "worker-src 'self'",
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
const EMAIL_FOOTER = `<p style="font-size: 11px; color: #1A1A1A; opacity: 0.3; margin-top: 40px;">© ${new Date().getFullYear()} Cultivating Meaningful Dialogue · <a href="${APP_URL}/account" style="color:#1A1A1A;">Your account</a></p>`;

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

  if (url.pathname === '/api/generate-question' && request.method === 'POST') {
    return handleGenerateQuestion(request, env);
  }
  if (url.pathname === '/api/referral' && request.method === 'POST') {
    return handleReferral(request, env);
  }
  if (url.pathname === '/api/profile' && request.method === 'POST') {
    return handleProfile(request, env);
  }
  if (url.pathname === '/api/consume' && request.method === 'POST') {
    return handleConsume(request, env);
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

  // ── Live Session (Kahoot-style game) endpoints ─────────────────────────────
  if (url.pathname === '/api/session/create' && request.method === 'POST') {
    return handleSessionCreate(request, env);
  }
  if (url.pathname === '/api/session/lookup' && request.method === 'GET') {
    return handleSessionLookup(request, env);
  }
  if (url.pathname === '/api/session/ws' && request.method === 'GET') {
    return handleSessionWebSocket(request, env);
  }

  // ── Feedback endpoint (no auth required) ────────────────────────────────────
  if (url.pathname === '/api/feedback' && request.method === 'POST') {
    return handleFeedback(request, env);
  }
  // Feedback-for-free-questions unlock (auth required — grants bonus questions)
  if (url.pathname === '/api/feedback-unlock' && request.method === 'POST') {
    return handleFeedbackUnlock(request, env);
  }

  // ── Public stats endpoint ──────────────────────────────────────────────────
  if (url.pathname === '/api/stats' && request.method === 'GET') {
    return handleStats(env);
  }

  // ── Per-question share page (dynamic Open Graph) ───────────────────────────
  // Facebook/LinkedIn ignore pre-filled share text and build their preview from
  // the shared URL's OG tags. Sharing /q?t=<question> serves a page whose OG
  // title IS the question, so those previews finally show it. Humans see a
  // branded card with a CTA into the app.
  if (url.pathname === '/q' && request.method === 'GET') {
    return handleQuestionShare(url);
  }

  // ── Session history endpoint (auth required) ────────────────────────────────
  if (url.pathname === '/api/sessions/history' && request.method === 'GET') {
    return handleSessionHistory(request, env);
  }

  // ── Question vote endpoint (no auth required, rate-limited) ─────────────────
  if (url.pathname === '/api/question-vote' && request.method === 'POST') {
    return handleQuestionVote(request, env);
  }

  // ── Admin endpoints (require Firebase auth + admin email) ──────────────────
  if (url.pathname === '/api/admin/dashboard-stats' && request.method === 'GET') {
    return handleAdminDashboardStats(request, env);
  }
  if (url.pathname === '/api/admin/feedback-list' && request.method === 'GET') {
    return handleAdminFeedbackList(request, env);
  }

  // ── Dynamic Open Graph for live-game share surfaces ────────────────────────
  // Room invites (/play/<code>) and the recap card (/play?q=&p=) must link to the
  // real SPA route so clicking joins/plays — so instead of a separate /q-style
  // page, we rewrite the SPA index.html's OG/Twitter meta on the fly. Humans get
  // the full app; crawlers (FB, LinkedIn, WhatsApp, iMessage, Slack) get a rich,
  // session-specific preview — consistent with /q.
  const playMatch = url.pathname.match(/^\/play(?:\/([A-Za-z0-9]{4,8}))?\/?$/);
  if (playMatch && request.method === 'GET') {
    const resp = await env.ASSETS.fetch(request);
    if ((resp.headers.get('content-type') || '').includes('text/html')) {
      const code = (playMatch[1] || '').toUpperCase();
      const q = parseInt(url.searchParams.get('q') || '', 10);
      const p = parseInt(url.searchParams.get('p') || '', 10);
      let title: string, description: string;
      if (code) {
        title = 'Join my Dinner Table Cards game';
        description = `Room ${code} · tap to join the live conversation game — no app, no sign-up.`;
      } else if (q > 0 && p > 0) {
        title = 'We just played Dinner Table Cards!';
        description = `${q} question${q === 1 ? '' : 's'} · ${p} player${p === 1 ? '' : 's'}. Start your own free live conversation game.`;
      } else {
        title = 'Play Dinner Table Cards — live conversation game';
        description = 'Host a live, Kahoot-style conversation game. Everyone answers, everyone connects. Free — no app, no sign-up.';
      }
      return injectOpenGraph(resp, { title, description, url: `https://dinnertablecards.xyz${url.pathname}${url.search}` });
    }
    return resp;
  }

  return env.ASSETS.fetch(request);
}

const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── Firebase reserved config endpoint ───────────────────────────────────
    // Firebase's auth handler (/__/auth/handler.js) fetches the project config
    // from [authDomain]/__/firebase/init.json to obtain the apiKey/projectId it
    // needs to exchange the OAuth code. Because authDomain is our own domain
    // (dinnertablecards.xyz) and Firebase Hosting was never deployed for this
    // project, that path would otherwise fall through to the SPA and return
    // HTML — breaking the handler with auth/internal-error and silently
    // aborting every signInWithRedirect. We serve the (public, client-side)
    // config here so the handler can complete the sign-in.
    if (url.pathname === '/__/firebase/init.json') {
      return new Response(
        JSON.stringify({
          apiKey: 'AIzaSyDiVSR5GThxIJBGxnwwvb_UtytkFmlkrAI',
          authDomain: 'dinnertablecards.xyz',
          projectId: 'gen-lang-client-0170753836',
          storageBucket: 'gen-lang-client-0170753836.firebasestorage.app',
          messagingSenderId: '962093257082',
          appId: '1:962093257082:web:4d9096bdaeefdf9501c6c3',
        }),
        {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        },
      );
    }

    // ── Firebase auth handler proxy ─────────────────────────────────────────
    // Firebase's signInWithRedirect uses [authDomain]/__/auth/ as the OAuth
    // callback route. Since authDomain is dinnertablecards.xyz, we proxy
    // these requests to Firebase's real auth infrastructure at firebaseapp.com.
    //
    // IMPORTANT: This proxy must bypass addSecurityHeaders — our strict CSP
    // (script-src 'self') would block Firebase's auth handler scripts, and
    // X-Frame-Options: DENY would break the auth iframe on return.
    if (url.pathname.startsWith('/__/auth/')) {
      const firebaseUrl =
        `https://gen-lang-client-0170753836.firebaseapp.com${url.pathname}${url.search}`;
      // Strip the Host header so Firebase sees its own hostname, not ours.
      // All other headers (cookies, Accept, etc.) are forwarded as-is.
      const proxyHeaders = new Headers(request.headers);
      proxyHeaders.delete('host');
      return fetch(new Request(firebaseUrl, {
        method:   request.method,
        headers:  proxyHeaders,
        body:     request.body,
        redirect: 'manual', // forward 302s to the browser; don't follow server-side
      }));
    }

    /** Every other response gets security headers applied. */
    const response = await routeRequest(request, env);
    return addSecurityHeaders(response);
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    await resetMonthlyUsage(env);
  },
} satisfies ExportedHandler<Env>;

// Wrap with Sentry so any unhandled exception in fetch/scheduled is reported.
// No-op when SENTRY_DSN is unset (graceful before the owner wires it up).
export default Sentry.withSentry(
  (env: Env) => ({ dsn: env.SENTRY_DSN, tracesSampleRate: 0 }),
  handler,
);

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

  // Coalesce concurrent refreshes into one API call
  if (pendingRefresh) return pendingRefresh;

  pendingRefresh = performTokenRefresh(env).finally(() => {
    pendingRefresh = null;
  });
  return pendingRefresh;
}

/** Internal: actually refresh the Firestore access token via service account JWT. */
async function performTokenRefresh(env: Env): Promise<string> {
  const now = Date.now();
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

// ── Profile (server-authoritative) ───────────────────────────────────────────

/**
 * GET-or-create the user's profile. The service account bypasses Firestore
 * security rules, so this works even when the client SDK can't read/write the
 * named database directly.
 */
async function handleProfile(request: Request, env: Env): Promise<Response> {
  const auth = await verifyIdToken(request, env);
  if (!auth) return unauthorized();
  const uid = auth.uid;

  let user = await getFirestoreUser(uid, env);
  if (!user) {
    // First time — create a default free profile server-side.
    const now = new Date().toISOString();
    const defaults: Record<string, unknown> = {
      uid,
      email: auth.email || '',
      isPremium: false,
      subscriptionPlan: 'free',
      subscriptionStatus: 'none',
      lifetimePurchase: false,
      usageCount: 0,
      referralCount: 0,
      bonusQuestions: 0,
      lastActiveDate: '',
      currentStreak: 0,
      longestStreak: 0,
      createdAt: now,
    };
    try {
      await updateFirestoreUser(uid, defaults, env);
      user = await getFirestoreUser(uid, env);
    } catch (err) {
      console.error('[profile] creation failed:', err);
      return Response.json({ error: 'Profile creation failed' }, { status: 500 });
    }
  }

  return Response.json({ profile: user ?? null });
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

  let user = await getFirestoreUser(uid, env);
  if (!user) {
    // Auto-create profile server-side so free users don't depend on client Firestore writes.
    console.log(`[consume] auto-creating profile for uid=${uid}`);
    await updateFirestoreUser(uid, {
      uid,
      email: auth.email || '',
      isPremium: false,
      subscriptionPlan: 'free',
      subscriptionStatus: 'none',
      lifetimePurchase: false,
      usageCount: 0,
      referralCount: 0,
      bonusQuestions: 0,
      lastActiveDate: '',
      currentStreak: 0,
      longestStreak: 0,
    }, env);
    user = await getFirestoreUser(uid, env);
    if (!user) {
      return Response.json({ error: 'Profile creation failed' }, { status: 500 });
    }
  }

  const plan = (user.subscriptionPlan as string) || 'free';
  const bonus = (user.bonusQuestions as number) || 0;
  const usageCount = (user.usageCount as number) || 0;
  const limit = (PLAN_LIMITS[plan] ?? PLAN_LIMITS.free) + bonus;

  console.log(`[consume] uid=${uid} plan=${plan} usage=${usageCount}/${limit}`);

  if (usageCount >= limit) {
    return Response.json({ allowed: false, reason: 'limit', usageCount, limit }, { status: 402 });
  }

  // Increment usage + streak (logic ported from firestoreUtils.incrementUsage).
  const today = new Date().toISOString().split('T')[0];
  const lastActive = (user.lastActiveDate as string) || '';

  const newUsageCount = usageCount + 1;

  try {
    if (lastActive === today) {
      // Same day — just bump the counter, no streak change.
      await updateFirestoreUser(uid, { usageCount: newUsageCount }, env);
    } else {
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = yesterdayDate.toISOString().split('T')[0];
      const prevStreak = (user.currentStreak as number) || 0;
      const currentStreak = lastActive === yesterday ? prevStreak + 1 : 1;
      const longestStreak = Math.max((user.longestStreak as number) || 0, currentStreak);

      // New day — update counter + streak in a single write.
      await updateFirestoreUser(uid, {
        usageCount: newUsageCount,
        currentStreak,
        longestStreak,
        lastActiveDate: today,
      }, env);
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

  return Response.json({ allowed: true, usageCount: newUsageCount, limit });
}

// ── Account Deletion ──────────────────────────────────────────────────────────

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
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

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
          // Credit the referrer: bump their referralCount + bonusQuestions.
          const referrer = await getFirestoreUser(referrerUid, env);
          const prevRefCount = (referrer?.referralCount as number) || 0;
          const prevBonus    = (referrer?.bonusQuestions as number) || 0;
          await updateFirestoreUser(referrerUid, {
            referralCount:  prevRefCount + 1,
            bonusQuestions: prevBonus + REFERRAL_BONUS,
          }, env);
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

// ── Live Session (Kahoot-style game) ────────────────────────────────────────

/** Safe alphabet for room codes — excludes visually ambiguous chars (I, O, 0, 1). */
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 4;
const ROOM_CODE_TTL = 4 * 60 * 60; // 4 hours in seconds

/**
 * Generate a random room code. 4 chars from a 32-char alphabet = ~1M combinations.
 * Collisions are checked against KV before returning.
 */
function generateRoomCode(length: number = ROOM_CODE_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => ROOM_CODE_CHARS[b % ROOM_CODE_CHARS.length]).join('');
}

/**
 * Get the ISO week string for a date, e.g. "2026-W22".
 * Used for weekly session limit enforcement.
 */
function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Live sessions a free (non-premium) user may host per ISO week. Generous cap
 *  to encourage usage while still preventing abuse (each session spins up a
 *  Durable Object). Bump or set very high for effectively unlimited. */
const FREE_WEEKLY_SESSION_LIMIT = 10;

/**
 * POST /api/session/create — Create a new live session.
 * Requires Firebase auth. Enforces freemium limit (free users: FREE_WEEKLY_SESSION_LIMIT/week).
 * Returns { roomCode, hostToken }.
 */
async function handleSessionCreate(request: Request, env: Env): Promise<Response> {
  const auth = await verifyIdToken(request, env);
  if (!auth) return unauthorized();
  const uid = auth.uid;

  // Check freemium limit: free users get FREE_WEEKLY_SESSION_LIMIT sessions per ISO week
  const user = await getFirestoreUser(uid, env);
  const isPremium = (user?.isPremium as boolean) || false;

  if (!isPremium) {
    const week = getISOWeek(new Date());
    const limitKey = `session-limit:${uid}:${week}`;
    const count = parseInt((await env.APP_KV.get(limitKey)) ?? '0', 10);
    if (count >= FREE_WEEKLY_SESSION_LIMIT) {
      return Response.json(
        { error: `You've hit this week's limit of ${FREE_WEEKLY_SESSION_LIMIT} live sessions. It resets next week.` },
        { status: 402 },
      );
    }
    // Increment the counter (TTL = 7 days to auto-expire old weeks)
    await env.APP_KV.put(limitKey, String(count + 1), { expirationTtl: 7 * 24 * 60 * 60 });
  }

  // Generate a unique room code (retry on collision).
  // Try 10 times with standard 4-char codes, then fall back to 5-char codes.
  let roomCode = '';
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateRoomCode(ROOM_CODE_LENGTH);
    const existing = await env.APP_KV.get(`room:${candidate}`);
    if (!existing) {
      roomCode = candidate;
      break;
    }
  }
  if (!roomCode) {
    // Fallback: try 5-character codes (32^5 = ~33M combinations)
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateRoomCode(ROOM_CODE_LENGTH + 1);
      const existing = await env.APP_KV.get(`room:${candidate}`);
      if (!existing) {
        roomCode = candidate;
        break;
      }
    }
  }
  if (!roomCode) {
    return Response.json({ error: 'Could not generate room code — please try again.' }, { status: 500 });
  }

  // Generate host token for reconnection (32-byte random hex)
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const hostToken = Array.from(tokenBytes, b => b.toString(16).padStart(2, '0')).join('');

  // Create the Durable Object instance
  const doId = env.GAME_SESSIONS.newUniqueId();
  const stub = env.GAME_SESSIONS.get(doId);

  // Initialize the DO with room code and host token
  const initUrl = new URL('https://do-internal/initialize');
  await stub.fetch(new Request(initUrl.toString(), {
    method: 'POST',
    body: JSON.stringify({ roomCode, hostToken }),
  }));

  // Store room code → DO ID mapping in KV
  await env.APP_KV.put(`room:${roomCode}`, doId.toString(), { expirationTtl: ROOM_CODE_TTL });

  console.log(`[session] created room=${roomCode} host=${uid}`);

  // Store session history in Firestore (non-blocking)
  storeSessionHistory(env, uid, roomCode).catch(err => {
    console.error('Failed to store session history:', err);
  });

  // Increment global stats counters. Must be AWAITED — a fire-and-forget KV write
  // in the Worker fetch handler gets cancelled when the response returns (unlike
  // the DO, which stays alive). KV ops are fast; the small latency is worth a
  // correct counter.
  await Promise.all([
    incrementStat(env, 'stats:sessions_total'),
    incrementStat(env, `daily:sessions:${new Date().toISOString().slice(0, 10)}`),
  ]).catch(() => { /* non-critical */ });

  return Response.json({ roomCode, hostToken });
}

/**
 * GET /api/session/lookup?code=XXXX — Check if a room exists.
 * No auth required (guests need to verify the code before connecting).
 */
async function handleSessionLookup(request: Request, env: Env): Promise<Response> {
  // Rate limit: 10 lookups per IP per minute (prevents room code brute-force)
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const minute = new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  const rlKey = `rl:lookup:${ip}:${minute}`;
  const rlCount = parseInt((await env.APP_KV.get(rlKey)) ?? '0', 10);
  if (rlCount >= 10) {
    return Response.json({ error: 'Too many lookups. Try again in a minute.' }, { status: 429 });
  }
  await env.APP_KV.put(rlKey, String(rlCount + 1), { expirationTtl: 120 });

  const url = new URL(request.url);
  const code = (url.searchParams.get('code') || '').toUpperCase().trim();

  if (!code || code.length < ROOM_CODE_LENGTH || code.length > ROOM_CODE_LENGTH + 1) {
    return Response.json({ exists: false });
  }

  const doIdStr = await env.APP_KV.get(`room:${code}`);
  if (!doIdStr) {
    return Response.json({ exists: false });
  }

  // Optionally fetch live status from the DO
  try {
    const doId = env.GAME_SESSIONS.idFromString(doIdStr);
    const stub = env.GAME_SESSIONS.get(doId);
    const statusRes = await stub.fetch(new Request('https://do-internal/status'));
    const status = await statusRes.json() as { exists: boolean; status: string; playerCount: number };
    return Response.json(status);
  } catch {
    return Response.json({ exists: false });
  }
}

/**
 * GET /api/session/ws?code=XXXX — WebSocket upgrade.
 * No Firebase auth required (guests connect without accounts).
 * Forwards the upgrade request directly to the Durable Object.
 */
async function handleSessionWebSocket(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = (url.searchParams.get('code') || '').toUpperCase().trim();

  if (!code || code.length < ROOM_CODE_LENGTH || code.length > ROOM_CODE_LENGTH + 1) {
    return Response.json({ error: 'Invalid room code' }, { status: 400 });
  }

  const doIdStr = await env.APP_KV.get(`room:${code}`);
  if (!doIdStr) {
    return Response.json({ error: 'Room not found' }, { status: 404 });
  }

  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const doId = env.GAME_SESSIONS.idFromString(doIdStr);
  const stub = env.GAME_SESSIONS.get(doId);

  // Capture the player's country from Cloudflare's edge geo (only available at
  // the HTTP layer, not inside the DO's WebSocket message handlers). Pass it to
  // the DO via the URL so it can be counted per real player join.
  const cf = (request as unknown as { cf?: { country?: string } }).cf;
  const country = (cf?.country || request.headers.get('cf-ipcountry') || '').toUpperCase();
  const fwdUrl = new URL(request.url);
  if (/^[A-Z]{2}$/.test(country)) fwdUrl.searchParams.set('c', country);

  // Forward the WebSocket upgrade request to the DO (preserving upgrade headers).
  return stub.fetch(new Request(fwdUrl.toString(), request));
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

// ── Feedback endpoint ────────────────────────────────────────────────────────

/**
 * POST /api/feedback — Submit feedback (no auth required).
 * Body: { text, rating?, sessionCode?, questionText?, email? }
 * Stores in Firestore, sends email notification to owner via Resend.
 * Rate limited: 5 per IP per hour.
 */
async function handleFeedback(request: Request, env: Env): Promise<Response> {
  // Rate limit by IP
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const rlKey = `rl:feedback:${ip}:${hour}`;
  const rlCount = parseInt((await env.APP_KV.get(rlKey)) ?? '0', 10);
  if (rlCount >= 5) {
    return Response.json({ error: 'Too many feedback submissions. Try again later.' }, { status: 429 });
  }
  await env.APP_KV.put(rlKey, String(rlCount + 1), { expirationTtl: 3600 });

  let body: { text?: string; rating?: number; sessionCode?: string; questionText?: string; email?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const text = (body.text || '').trim().slice(0, 1000);
  if (!text) {
    return Response.json({ error: 'Feedback text is required' }, { status: 400 });
  }

  const rating = typeof body.rating === 'number' ? Math.min(5, Math.max(1, body.rating)) : null;
  const sessionCode = (body.sessionCode || '').trim().slice(0, 10) || null;
  const questionText = (body.questionText || '').trim().slice(0, 500) || null;
  const email = (body.email || '').trim().slice(0, 100) || null;

  // Store in Firestore
  try {
    const token = await getFirestoreToken(env);
    const docId = crypto.randomUUID();
    const dbPath = `projects/${env.FIREBASE_PROJECT_ID}/databases/${env.FIREBASE_DATABASE_ID}/documents/feedback/${docId}`;
    const firestoreUrl = `https://firestore.googleapis.com/v1/${dbPath}`;

    const fields: Record<string, unknown> = {
      text: { stringValue: text },
      createdAt: { timestampValue: new Date().toISOString() },
      ip: { stringValue: ip },
    };
    if (rating) fields.rating = { integerValue: String(rating) };
    if (sessionCode) fields.sessionCode = { stringValue: sessionCode };
    if (questionText) fields.questionText = { stringValue: questionText };
    if (email) fields.email = { stringValue: email };

    await fetch(firestoreUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
  } catch (err) {
    console.error('Failed to store feedback in Firestore:', err);
    // Don't fail the request — we'll still try to send the email
  }

  // Send email notification to owner via Resend
  if (env.RESEND_API_KEY) {
    try {
      const subject = `[DTC Feedback] ${rating ? '★'.repeat(rating) : 'New'} — ${text.slice(0, 50)}`;
      const htmlBody = `
        <h2>New Feedback Received</h2>
        <p><strong>Rating:</strong> ${rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : 'Not rated'}</p>
        <p><strong>Message:</strong></p>
        <blockquote style="border-left:3px solid #5A5A40;padding-left:12px;color:#333;">${text}</blockquote>
        ${sessionCode ? `<p><strong>Session:</strong> ${sessionCode}</p>` : ''}
        ${questionText ? `<p><strong>Question:</strong> ${questionText}</p>` : ''}
        ${email ? `<p><strong>Reply to:</strong> <a href="mailto:${email}">${email}</a></p>` : ''}
        <p style="color:#999;font-size:12px;">IP: ${ip} | ${new Date().toISOString()}</p>
      `;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.RESEND_FROM || 'Dinner Table Cards <noreply@dinnertablecards.xyz>',
          to: 'contentcreatordarsh@gmail.com',
          subject,
          html: htmlBody,
        }),
      });
    } catch (err) {
      console.error('Failed to send feedback email:', err);
    }
  }

  return Response.json({ ok: true });
}

/**
 * POST /api/feedback-unlock — Signed-in users who hit their free limit can
 * submit feedback in exchange for a one-time batch of free (bonus) questions.
 * Stores the feedback, emails the owner, and credits the user's profile.
 * Body: { text, rating? }
 */
const FEEDBACK_UNLOCK_BONUS = 25; // free questions granted per feedback (repeatable)
const FEEDBACK_UNLOCK_COOLDOWN_SEC = 6; // anti double-submit window between grants

async function handleFeedbackUnlock(request: Request, env: Env): Promise<Response> {
  const auth = await verifyIdToken(request, env);
  if (!auth) return unauthorized();

  let body: { text?: string; rating?: number };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const text = (body.text || '').trim().slice(0, 1000);
  if (text.length < 3) {
    return Response.json({ error: 'Please share a little more feedback.' }, { status: 400 });
  }
  const rating = typeof body.rating === 'number' ? Math.min(5, Math.max(1, body.rating)) : null;

  // Repeatable unlock: every piece of feedback grants another batch of questions
  // ("more feedback, more questions"). A short per-user cooldown blocks accidental
  // double-submits / button-mashing the same feedback, without adding real friction.
  const cooldownKey = `rl:fbunlock:${auth.uid}`;
  const onCooldown = !!(await env.APP_KV.get(cooldownKey).catch(() => null));

  let currentBonus = 0;
  try {
    const profile = await getFirestoreUser(auth.uid, env);
    currentBonus = typeof profile?.bonusQuestions === 'number' ? profile.bonusQuestions as number : 0;
  } catch (err) {
    console.error('feedback-unlock: profile read failed', err);
  }

  let granted = 0;
  let newBonus = currentBonus;
  if (!onCooldown) {
    granted = FEEDBACK_UNLOCK_BONUS;
    newBonus = currentBonus + granted;
    try {
      await updateFirestoreUser(auth.uid, { bonusQuestions: newBonus }, env);
      await env.APP_KV.put(cooldownKey, '1', { expirationTtl: FEEDBACK_UNLOCK_COOLDOWN_SEC }).catch(() => {});
    } catch (err) {
      console.error('feedback-unlock: grant failed', err);
      return Response.json({ error: 'Could not apply your free questions — please try again.' }, { status: 500 });
    }
  }

  // Store the feedback (best-effort) so it shows up in the admin dashboard.
  try {
    const token = await getFirestoreToken(env);
    const docId = crypto.randomUUID();
    const dbPath = `projects/${env.FIREBASE_PROJECT_ID}/databases/${env.FIREBASE_DATABASE_ID}/documents/feedback/${docId}`;
    const fields: Record<string, unknown> = {
      text: { stringValue: text },
      createdAt: { timestampValue: new Date().toISOString() },
      source: { stringValue: 'limit-unlock' },
      uid: { stringValue: auth.uid },
    };
    if (rating) fields.rating = { integerValue: String(rating) };
    if (auth.email) fields.email = { stringValue: auth.email };
    await fetch(`https://firestore.googleapis.com/v1/${dbPath}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
  } catch (err) {
    console.error('feedback-unlock: store failed', err);
  }

  // Email the owner (best-effort).
  if (env.RESEND_API_KEY) {
    try {
      const subject = `[DTC Feedback] ${rating ? '★'.repeat(rating) : 'New'} (limit unlock) — ${text.slice(0, 50)}`;
      const htmlBody = `
        <h2>New Feedback (free-questions unlock)</h2>
        <p><strong>Rating:</strong> ${rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : 'Not rated'}</p>
        <p><strong>Message:</strong></p>
        <blockquote style="border-left:3px solid #5A5A40;padding-left:12px;color:#333;">${text}</blockquote>
        ${auth.email ? `<p><strong>From:</strong> <a href="mailto:${auth.email}">${auth.email}</a></p>` : ''}
        <p><strong>Granted:</strong> ${granted} free questions ${onCooldown ? '(cooldown — none added)' : ''}</p>
        <p style="color:#999;font-size:12px;">uid: ${auth.uid} | ${new Date().toISOString()}</p>
      `;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.RESEND_FROM || 'Dinner Table Cards <noreply@dinnertablecards.xyz>',
          to: 'contentcreatordarsh@gmail.com',
          subject,
          html: htmlBody,
        }),
      });
    } catch (err) {
      console.error('feedback-unlock: email failed', err);
    }
  }

  return Response.json({ ok: true, granted, bonusQuestions: newBonus, onCooldown });
}

// ── Stats endpoint ───────────────────────────────────────────────────────────

/**
 * GET /api/stats — Public stats for trust signals on the landing page.
 * Returns aggregate counters from KV.
 */
async function handleStats(env: Env): Promise<Response> {
  const [sessions, players, questions, playSeconds, playCount] = await Promise.all([
    env.APP_KV.get('stats:sessions_total'),
    env.APP_KV.get('stats:players_total'),
    env.APP_KV.get('stats:questions_total'),
    env.APP_KV.get('stats:play_seconds_total'),
    env.APP_KV.get('stats:play_count'),
  ]);

  // Average playing time across real, completed sessions (null until we have data).
  const pSecs = parseInt(playSeconds ?? '0', 10);
  const pCount = parseInt(playCount ?? '0', 10);
  const avgPlaySeconds = pCount > 0 ? Math.round(pSecs / pCount) : null;

  // Aggregate per-country join counts: prefix-scan KV, then batch-read values.
  // Eventually consistent + slightly costly, so the 60s cache below covers it.
  let countries: { code: string; count: number }[] = [];
  try {
    const list = await env.APP_KV.list({ prefix: 'stats:country:' });
    const PREFIX = 'stats:country:';
    const entries = await Promise.all(
      list.keys.map(async (k) => ({
        code: k.name.slice(PREFIX.length),
        count: parseInt((await env.APP_KV.get(k.name)) ?? '0', 10),
      })),
    );
    countries = entries
      .filter(e => /^[A-Z]{2}$/.test(e.code) && e.count > 0)
      .sort((a, b) => b.count - a.count);
  } catch { /* non-critical — return totals without country breakdown */ }

  return Response.json({
    // Real, un-seeded counts — auto-increment as people actually use the app.
    sessions: parseInt(sessions ?? '0', 10),
    players: parseInt(players ?? '0', 10),
    questions: parseInt(questions ?? '0', 10),
    avgPlaySeconds,
    countries,
    topCountry: countries[0]?.code ?? null,
  }, {
    headers: { 'Cache-Control': 'public, max-age=60' }, // cache 1 min
  });
}

/** Escape a string for safe interpolation into HTML text / double-quoted attributes. */
function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * GET /q?t=<question>[&c=<category>] — Per-question share landing with dynamic
 * Open Graph / Twitter Card meta so Facebook, LinkedIn, iMessage, Slack, etc.
 * (which ignore pre-filled share text) render the actual question in their link
 * preview. Humans get a branded card with a CTA into the app.
 */
function handleQuestionShare(url: URL): Response {
  const raw = (url.searchParams.get('t') || '').slice(0, 300).trim();
  const category = (url.searchParams.get('c') || '').slice(0, 40).trim();
  const APP = 'https://dinnertablecards.xyz';

  // Fallback to the generic landing if no question was supplied.
  const question = raw || 'What question will spark your best conversation tonight?';
  const q = escapeHtmlAttr(question);
  const cat = category && /^[\w &'-]+$/.test(category) ? escapeHtmlAttr(category) : '';
  const shareUrl = `${APP}/q?t=${encodeURIComponent(question)}${cat ? `&c=${encodeURIComponent(category)}` : ''}`;
  const desc = 'A free conversation starter from Dinner Table Cards — 600+ curated questions for dinners, dates & teams.';

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${q} · Dinner Table Cards</title>
<meta name="description" content="${escapeHtmlAttr(desc)}">
<link rel="canonical" href="${escapeHtmlAttr(shareUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Dinner Table Cards">
<meta property="og:url" content="${escapeHtmlAttr(shareUrl)}">
<meta property="og:title" content="${q}">
<meta property="og:description" content="${escapeHtmlAttr(desc)}">
<meta property="og:image" content="${APP}/og-image.svg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${q}">
<meta name="twitter:description" content="${escapeHtmlAttr(desc)}">
<meta name="twitter:image" content="${APP}/og-image.svg">
<style>
  :root{color-scheme:light}
  *{margin:0;box-sizing:border-box}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F5F2ED;color:#1A1A1A;font-family:Georgia,'Times New Roman',serif;padding:2rem;text-align:center}
  .wrap{max-width:34rem}
  .kicker{font-size:.7rem;letter-spacing:.4em;text-transform:uppercase;color:rgba(26,26,26,.4);font-family:system-ui,sans-serif;margin-bottom:1.5rem}
  .cat{font-size:.65rem;letter-spacing:.25em;text-transform:uppercase;color:#5A5A40;font-family:system-ui,sans-serif;margin-bottom:1rem}
  h1{font-style:italic;font-weight:400;font-size:2rem;line-height:1.35;margin-bottom:2.25rem}
  @media(min-width:640px){h1{font-size:2.5rem}}
  .cta{display:inline-block;background:#5A5A40;color:#F5F2ED;text-decoration:none;font-family:system-ui,sans-serif;font-size:.7rem;letter-spacing:.25em;text-transform:uppercase;padding:.9rem 2rem;border-radius:999px;transition:background .2s}
  .cta:hover{background:#4A4A34}
  .foot{margin-top:2rem;font-family:system-ui,sans-serif;font-size:.7rem;color:rgba(26,26,26,.35)}
</style>
</head><body>
  <main class="wrap">
    <p class="kicker">Dinner&nbsp;Table&nbsp;Cards</p>
    ${cat ? `<p class="cat">${cat}</p>` : ''}
    <h1>&ldquo;${q}&rdquo;</h1>
    <a class="cta" href="${APP}/">Get your own free question →</a>
    <p class="foot">600+ curated conversation starters · dinnertablecards.xyz</p>
  </main>
</body></html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

/**
 * Rewrites the SPA index.html's social meta on the fly so a given route gets a
 * route-specific Open Graph / Twitter Card preview. HTMLRewriter encodes the
 * values it sets (attribute + text), so no manual escaping is required.
 */
function injectOpenGraph(
  response: Response,
  meta: { title: string; description: string; url: string },
): Response {
  const setMeta = {
    element(el: Element) {
      const key = el.getAttribute('property') ?? el.getAttribute('name');
      if (key === 'og:title' || key === 'twitter:title') el.setAttribute('content', meta.title);
      else if (key === 'og:description' || key === 'twitter:description' || key === 'description') {
        el.setAttribute('content', meta.description);
      } else if (key === 'og:url') el.setAttribute('content', meta.url);
    },
  };
  const setTitle = {
    element(el: Element) {
      el.setInnerContent(`${meta.title} · Dinner Table Cards`);
    },
  };
  return new HTMLRewriter().on('meta', setMeta).on('title', setTitle).transform(response);
}

/**
 * Increment a KV counter.
 * NOTE: KV does not support atomic CAS — concurrent requests can lose increments.
 * Acceptable for approximate analytics counters; rate-limit checks use conservative
 * thresholds to compensate (see individual rate-limit callsites).
 */
async function incrementStat(env: Env, key: string): Promise<void> {
  const current = parseInt((await env.APP_KV.get(key)) ?? '0', 10);
  await env.APP_KV.put(key, String(current + 1));
}

// ── Admin Dashboard endpoints ─────────────────────────────────────────────────

/** Read every value under a KV prefix (parsed as int), sorted desc by count. */
async function kvPrefixCounts(env: Env, prefix: string): Promise<{ key: string; count: number }[]> {
  const list = await env.APP_KV.list({ prefix });
  const entries = await Promise.all(
    list.keys.map(async (k) => ({
      key: k.name.slice(prefix.length),
      count: parseInt((await env.APP_KV.get(k.name)) ?? '0', 10),
    })),
  );
  return entries.filter((e) => e.count > 0).sort((a, b) => b.count - a.count);
}

/**
 * GET /api/admin/dashboard-stats — Admin-only. Rich analytics payload:
 * lifetime counters, derived engagement ratios, 14-day trend, geography,
 * category popularity, crowd question-vote leaderboards (the signal for tuning
 * prompts), feedback rating distribution, and registered-user / usage stats.
 */
async function handleAdminDashboardStats(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const int = (v: string | null) => parseInt(v ?? '0', 10);

  // ── Lifetime KV counters ──────────────────────────────────────────────────
  const [sessions, players, questions, playSeconds, playCount] = await Promise.all([
    env.APP_KV.get('stats:sessions_total'),
    env.APP_KV.get('stats:players_total'),
    env.APP_KV.get('stats:questions_total'),
    env.APP_KV.get('stats:play_seconds_total'),
    env.APP_KV.get('stats:play_count'),
  ]);
  const sN = int(sessions), pN = int(players), qN = int(questions);
  const pSecs = int(playSeconds), pCnt = int(playCount);

  // ── 14-day daily trend ────────────────────────────────────────────────────
  const dailyKeys: string[] = [];
  for (let i = 13; i >= 0; i--) dailyKeys.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  const daily = await Promise.all(
    dailyKeys.map(async (key) => {
      const [ds, dp, dq] = await Promise.all([
        env.APP_KV.get(`daily:sessions:${key}`),
        env.APP_KV.get(`daily:players:${key}`),
        env.APP_KV.get(`daily:questions:${key}`),
      ]);
      return { date: key, sessions: int(ds), players: int(dp), questions: int(dq) };
    }),
  );

  // ── Geography + category popularity (prefix scans) ────────────────────────
  let countries: { code: string; count: number }[] = [];
  let categories: { name: string; count: number }[] = [];
  try {
    countries = (await kvPrefixCounts(env, 'stats:country:'))
      .filter((e) => /^[A-Z]{2}$/.test(e.key))
      .map((e) => ({ code: e.key, count: e.count }));
  } catch { /* non-critical */ }
  try {
    categories = (await kvPrefixCounts(env, 'stats:category:')).map((e) => ({ name: e.key, count: e.count }));
  } catch { /* non-critical */ }

  // ── Crowd question votes (qvote:* in KV) — the prompt-tuning signal ────────
  const questionVotes = {
    totalUp: 0,
    totalDown: 0,
    totalRated: 0,
    topLiked: [] as { text: string; up: number; down: number }[],
    topDisliked: [] as { text: string; up: number; down: number }[],
  };
  try {
    const list = await env.APP_KV.list({ prefix: 'qvote:' });
    const rows = (
      await Promise.all(
        list.keys.map(async (k) => {
          const raw = await env.APP_KV.get(k.name);
          if (!raw) return null;
          try {
            const v = JSON.parse(raw) as { up?: number; down?: number; text?: string };
            return { text: v.text ?? '', up: v.up ?? 0, down: v.down ?? 0 };
          } catch {
            return null;
          }
        }),
      )
    ).filter((r): r is { text: string; up: number; down: number } => !!r && (r.up > 0 || r.down > 0));
    questionVotes.totalRated = rows.length;
    questionVotes.totalUp = rows.reduce((a, r) => a + r.up, 0);
    questionVotes.totalDown = rows.reduce((a, r) => a + r.down, 0);
    questionVotes.topLiked = [...rows]
      .filter((r) => r.up > 0)
      .sort((a, b) => b.up - b.down - (a.up - a.down) || b.up - a.up)
      .slice(0, 10);
    questionVotes.topDisliked = [...rows]
      .filter((r) => r.down > 0)
      .sort((a, b) => b.down - b.up - (a.down - a.up) || b.down - a.down)
      .slice(0, 10);
  } catch (err) {
    console.error('qvote aggregation failed:', err);
  }

  // ── Firestore: feedback rating distribution + registered-user/usage stats ──
  const feedback = { total: 0, ratedCount: 0, avgRating: null as number | null, distribution: [0, 0, 0, 0, 0] };
  const users = { total: 0, sampled: 0, active: 0, premium: 0, hitFreeLimit: 0, avgUsage: 0, freeLimit: PLAN_LIMITS.free };
  try {
    const token = await getFirestoreToken(env);
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/${env.FIREBASE_DATABASE_ID}/documents`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    // Counts (cheap aggregation queries).
    const [fbCountRes, userCountRes, fbDocsRes, userDocsRes] = await Promise.all([
      fetch(`${baseUrl}:runAggregationQuery`, {
        method: 'POST', headers,
        body: JSON.stringify({ structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: 'feedback' }] }, aggregations: [{ alias: 'c', count: {} }] } }),
      }),
      fetch(`${baseUrl}:runAggregationQuery`, {
        method: 'POST', headers,
        body: JSON.stringify({ structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: 'users' }] }, aggregations: [{ alias: 'c', count: {} }] } }),
      }),
      // Rating distribution (feedback is low-volume; sample up to 1000).
      fetch(`${baseUrl}:runQuery`, {
        method: 'POST', headers,
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'feedback' }], select: { fields: [{ fieldPath: 'rating' }] }, limit: 1000 } }),
      }),
      // Usage sample (cap reads at 500).
      fetch(`${baseUrl}:runQuery`, {
        method: 'POST', headers,
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }], select: { fields: [{ fieldPath: 'usageCount' }, { fieldPath: 'isPremium' }] }, limit: 500 } }),
      }),
    ]);

    if (fbCountRes.ok) {
      const r = await fbCountRes.json() as Array<{ result?: { aggregateFields?: { c?: { integerValue?: string } } } }>;
      feedback.total = int(r?.[0]?.result?.aggregateFields?.c?.integerValue ?? '0');
    }
    if (userCountRes.ok) {
      const r = await userCountRes.json() as Array<{ result?: { aggregateFields?: { c?: { integerValue?: string } } } }>;
      users.total = int(r?.[0]?.result?.aggregateFields?.c?.integerValue ?? '0');
    }
    if (fbDocsRes.ok) {
      const docs = await fbDocsRes.json() as Array<{ document?: { fields?: { rating?: { integerValue?: string } } } }>;
      for (const d of docs) {
        const rt = d.document?.fields?.rating?.integerValue;
        if (rt) {
          const n = parseInt(rt, 10);
          if (n >= 1 && n <= 5) { feedback.distribution[n - 1]++; feedback.ratedCount++; }
        }
      }
      if (feedback.ratedCount > 0) {
        const sum = feedback.distribution.reduce((a, c, i) => a + c * (i + 1), 0);
        feedback.avgRating = Math.round((sum / feedback.ratedCount) * 10) / 10;
      }
    }
    if (userDocsRes.ok) {
      const docs = await userDocsRes.json() as Array<{ document?: { fields?: { usageCount?: { integerValue?: string }; isPremium?: { booleanValue?: boolean } } } }>;
      let usageSum = 0;
      for (const d of docs) {
        const f = d.document?.fields;
        if (!f) continue;
        users.sampled++;
        const u = int(f.usageCount?.integerValue ?? '0');
        usageSum += u;
        if (u > 0) users.active++;
        if (f.isPremium?.booleanValue) users.premium++;
        if (u >= PLAN_LIMITS.free) users.hitFreeLimit++;
      }
      users.avgUsage = users.sampled > 0 ? Math.round((usageSum / users.sampled) * 10) / 10 : 0;
    }
  } catch (err) {
    console.error('Firestore analytics failed:', err);
  }

  // ── Derived engagement ratios ─────────────────────────────────────────────
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const engagement = {
    avgPlaySeconds: pCnt > 0 ? Math.round(pSecs / pCnt) : null,
    avgPlayersPerSession: sN > 0 ? round1(pN / sN) : null,
    avgQuestionsPerSession: sN > 0 ? round1(qN / sN) : null,
    completionRate: sN > 0 ? Math.round((pCnt / sN) * 100) : null, // % of sessions that finished a round
  };

  return Response.json({
    generatedAt: new Date().toISOString(),
    totals: {
      sessions: sN,
      players: pN,
      questions: qN,
      feedback: feedback.total,
      registeredUsers: users.total,
      completedSessions: pCnt,
    },
    engagement,
    daily,
    countries,
    categories,
    questionVotes,
    feedback,
    users,
  });
}

/**
 * GET /api/admin/feedback-list — Admin-only. Returns latest feedback entries.
 * Query param: ?limit=20 (default 20, max 50)
 */
async function handleAdminFeedbackList(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '20', 10));

  try {
    const token = await getFirestoreToken(env);
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/${env.FIREBASE_DATABASE_ID}/documents`;

    const queryRes = await fetch(`${baseUrl}:runQuery`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'feedback' }],
          orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
          limit: limit,
        },
      }),
    });

    if (!queryRes.ok) {
      return Response.json({ error: 'Failed to query feedback' }, { status: 500 });
    }

    const rawDocs = await queryRes.json() as Array<{ document?: { name?: string; fields?: Record<string, { stringValue?: string; integerValue?: string; timestampValue?: string }> } }>;

    const items = rawDocs
      .filter(d => d.document)
      .map(d => {
        const f = d.document!.fields || {};
        return {
          id: d.document!.name?.split('/').pop() ?? '',
          text: f.text?.stringValue ?? '',
          rating: f.rating?.integerValue ? parseInt(f.rating.integerValue, 10) : null,
          sessionCode: f.sessionCode?.stringValue ?? null,
          questionText: f.questionText?.stringValue ?? null,
          email: f.email?.stringValue ?? null,
          createdAt: f.createdAt?.timestampValue ?? null,
          ip: f.ip?.stringValue ?? null,
        };
      });

    return Response.json({ items });
  } catch (err) {
    console.error('Admin feedback list error:', err);
    return Response.json({ error: 'Failed to fetch feedback' }, { status: 500 });
  }
}

// ── Question Vote endpoint ────────────────────────────────────────────────────

/**
 * POST /api/question-vote — Rate a question up or down.
 * Body: { questionText: string, vote: 'up' | 'down' }
 * Stores vote tallies in KV for simplicity. Rate limited: 20/IP/hour.
 */
async function handleQuestionVote(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const hour = new Date().toISOString().slice(0, 13);
  const rlKey = `rl:qvote:${ip}:${hour}`;
  const rlCount = parseInt((await env.APP_KV.get(rlKey)) ?? '0', 10);
  if (rlCount >= 20) {
    return Response.json({ error: 'Too many votes. Try again later.' }, { status: 429 });
  }
  await env.APP_KV.put(rlKey, String(rlCount + 1), { expirationTtl: 3600 });

  let body: { questionText?: string; vote?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const questionText = (body.questionText || '').trim().slice(0, 500);
  const vote = body.vote;
  if (!questionText || (vote !== 'up' && vote !== 'down')) {
    return Response.json({ error: 'questionText and vote (up|down) required' }, { status: 400 });
  }

  // Use a hash of the question text as the KV key
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(questionText));
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  const kvKey = `qvote:${hashHex}`;

  // Read existing votes
  const existing = await env.APP_KV.get(kvKey);
  let votes = { up: 0, down: 0, text: questionText };
  if (existing) {
    try { votes = JSON.parse(existing); } catch { /* reset */ }
  }

  if (vote === 'up') votes.up++;
  else votes.down++;

  await env.APP_KV.put(kvKey, JSON.stringify(votes));

  return Response.json({ ok: true, up: votes.up, down: votes.down });
}

// ── Session History ───────────────────────────────────────────────────────────

/**
 * Store a session record in Firestore for the host's history.
 * Called on session creation. Uses roomCode as doc ID.
 */
async function storeSessionHistory(env: Env, hostUid: string, roomCode: string): Promise<void> {
  const token = await getFirestoreToken(env);
  const dbPath = `projects/${env.FIREBASE_PROJECT_ID}/databases/${env.FIREBASE_DATABASE_ID}/documents/sessionHistory/${roomCode}`;
  const firestoreUrl = `https://firestore.googleapis.com/v1/${dbPath}`;

  const fields: Record<string, unknown> = {
    hostUid: { stringValue: hostUid },
    roomCode: { stringValue: roomCode },
    playerCount: { integerValue: '0' },
    questionsPlayed: { integerValue: '0' },
    createdAt: { timestampValue: new Date().toISOString() },
    status: { stringValue: 'active' },
  };

  await fetch(firestoreUrl, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

/**
 * GET /api/sessions/history — List past sessions for the authenticated user.
 * Returns most recent 20 sessions.
 */
async function handleSessionHistory(request: Request, env: Env): Promise<Response> {
  const auth = await verifyIdToken(request, env);
  if (!auth) return unauthorized();

  try {
    const token = await getFirestoreToken(env);
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/${env.FIREBASE_DATABASE_ID}/documents`;

    const queryRes = await fetch(`${baseUrl}:runQuery`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'sessionHistory' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'hostUid' },
              op: 'EQUAL',
              value: { stringValue: auth.uid },
            },
          },
          orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
          limit: 20,
        },
      }),
    });

    if (!queryRes.ok) {
      return Response.json({ error: 'Failed to query sessions' }, { status: 500 });
    }

    const rawDocs = await queryRes.json() as Array<{ document?: { fields?: Record<string, { stringValue?: string; integerValue?: string; timestampValue?: string }> } }>;

    const sessions = rawDocs
      .filter(d => d.document)
      .map(d => {
        const f = d.document!.fields || {};
        return {
          roomCode: f.roomCode?.stringValue ?? '',
          playerCount: parseInt(f.playerCount?.integerValue ?? '0', 10),
          questionsPlayed: parseInt(f.questionsPlayed?.integerValue ?? '0', 10),
          createdAt: f.createdAt?.timestampValue ?? null,
          status: f.status?.stringValue ?? 'active',
        };
      });

    // Enrich with KV summary data (has final player/question counts after session end)
    const enriched = await Promise.all(
      sessions.map(async (s) => {
        try {
          const kvSummary = await env.APP_KV.get(`session-summary:${s.roomCode}`);
          if (kvSummary) {
            const summary = JSON.parse(kvSummary) as { playerCount?: number; questionsPlayed?: number; endedAt?: string };
            return {
              ...s,
              playerCount: summary.playerCount ?? s.playerCount,
              questionsPlayed: summary.questionsPlayed ?? s.questionsPlayed,
              status: 'ended',
            };
          }
        } catch { /* ignore parse errors */ }
        return s;
      }),
    );

    return Response.json({ sessions: enriched });
  } catch (err) {
    console.error('Session history error:', err);
    return Response.json({ error: 'Failed to fetch session history' }, { status: 500 });
  }
}
