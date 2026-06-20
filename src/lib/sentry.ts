import * as Sentry from '@sentry/react';

// DSN is provided at build time (VITE_SENTRY_DSN). When unset (local/dev or
// before the owner wires Sentry), everything below is a graceful no-op.
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Errors only for now — no performance tracing / replay overhead.
    tracesSampleRate: 0,
  });
}

/** Report a caught error to Sentry (no-op when no DSN is configured). */
export function captureError(error: unknown, extra?: Record<string, unknown>): void {
  if (dsn) Sentry.captureException(error, extra ? { extra } : undefined);
}

export const sentryEnabled = !!dsn;
