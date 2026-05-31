import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

// Register the Workbox service worker via vite-plugin-pwa's auto-update module.
// This handles skipWaiting, claims clients, and auto-reloads when a new SW activates —
// so new routes (like /play/:code) become available immediately after deploy.
registerSW({ immediate: true });

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
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
