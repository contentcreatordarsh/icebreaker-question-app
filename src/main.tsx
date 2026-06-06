import { StrictMode, lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import OfflineIndicator from './components/OfflineIndicator.tsx';
import { auth, getRedirectResult } from './lib/firebase';
import './lib/sentry'; // initialise error monitoring early (no-op without a DSN)
import './index.css';

// Register the Workbox service worker via vite-plugin-pwa's auto-update module.
// This handles skipWaiting, claims clients, and auto-reloads when a new SW activates —
// so new routes (like /play/:code) become available immediately after deploy.
registerSW({ immediate: true });

// ── Finalise Google sign-in redirects on EVERY route ────────────────────────
// Firebase v9+ requires getRedirectResult() to run on the page the OAuth
// redirect lands on, otherwise signInWithRedirect never completes and
// onAuthStateChanged stays null. signInWithGoogle() can be triggered from any
// page (e.g. "Host a New Session" on /play), so the redirect can land anywhere
// — not just "/". Calling it once here at app bootstrap covers all routes.
// The result itself is unused; we rely on onAuthStateChanged via useAuthState.
getRedirectResult(auth).catch((err) => {
  if (
    err?.code !== 'auth/popup-closed-by-user' &&
    err?.code !== 'auth/cancelled-popup-request'
  ) {
    console.error('Redirect sign-in error:', err?.code, err?.message);
  }
});

// Lazy-load secondary pages — they're not needed on first paint and
// together make up ~15-20% of the bundle. Suspense fallback is a blank
// page in the brand background colour so the flash is seamless.
const Privacy     = lazy(() => import('./pages/Privacy.tsx'));
const Terms       = lazy(() => import('./pages/Terms.tsx'));
const Account     = lazy(() => import('./pages/Account.tsx'));
const NotFound    = lazy(() => import('./pages/NotFound.tsx'));
const Play        = lazy(() => import('./pages/Play.tsx'));
const PlaySession = lazy(() => import('./pages/PlaySession.tsx'));
const HostSession = lazy(() => import('./pages/HostSession.tsx'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.tsx'));
const SessionHistory = lazy(() => import('./pages/SessionHistory.tsx'));

/**
 * Per-route page name. Used both to set <title> (SEO + browser tab + a11y) and
 * to announce navigation to screen readers via an aria-live region.
 */
const ROUTE_TITLES: Record<string, string> = {
  '/': 'Dinner Table Cards',
  '/privacy': 'Privacy Policy',
  '/terms': 'Terms of Service',
  '/account': 'Account',
  '/play': 'Join a Live Session',
  '/admin': 'Admin Dashboard',
  '/sessions': 'Session History',
};

const SITE_NAME = 'Dinner Table Cards';

function routeTitle(pathname: string): string {
  return (
    ROUTE_TITLES[pathname] ??
    (pathname.startsWith('/play/')
      ? 'Live Session'
      : pathname.startsWith('/host/')
        ? 'Host Session'
        : SITE_NAME)
  );
}

/**
 * Drives the document <title> per SPA route (so each route has a meaningful,
 * shareable, screen-reader-friendly title instead of a single static one) and
 * announces navigation to assistive tech via an aria-live region.
 *
 * In-game phase titles (e.g. "Question 2") are layered on top of this by the
 * useDocumentTitle hook inside the live-session pages.
 */
function RouteAnnouncer() {
  const { pathname } = useLocation();
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const title = routeTitle(pathname);
    document.title = pathname === '/' ? `${SITE_NAME} — Conversation Starters for Meaningful Moments` : `${title} · ${SITE_NAME}`;
    setAnnouncement(`Navigated to ${title}`);
  }, [pathname]);

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {announcement}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <OfflineIndicator />
      <BrowserRouter>
        <RouteAnnouncer />
        <Suspense fallback={<div className="min-h-screen bg-[#F5F5F0]" />}>
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/account" element={<Account />} />
            <Route path="/play" element={<Play />} />
            <Route path="/play/:code" element={<PlaySession />} />
            <Route path="/host/:code" element={<HostSession />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/sessions" element={<SessionHistory />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
