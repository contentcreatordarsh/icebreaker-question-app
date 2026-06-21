/**
 * Lightweight, anonymous visitor analytics.
 *
 * Powers the /admin "Visitor Funnel" + "Devices" panels: how many people land
 * on the home page, how many start a live session, host one, or try a question,
 * plus how long they stay and what device/OS they're on.
 *
 * Design constraints:
 *  - Fire-and-forget. Uses navigator.sendBeacon so it never blocks the UI and
 *    survives the page being closed/navigated away.
 *  - Privacy-preserving. No identifiers, no PII — only a funnel-step name and a
 *    coarse device/OS bucket. The Worker allow-lists every value before storing.
 *  - Must never throw. Analytics is best-effort and is wrapped accordingly.
 */

export type FunnelEvent = 'home' | 'play' | 'host' | 'question';

/** Coarse, spoof-tolerant device classification from the UA string. */
function detectDevice(): { os: string; form: string } {
  const ua = navigator.userAgent || '';
  const isIpadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  let os: string;
  if (/iphone|ipad|ipod/i.test(ua) || isIpadOS) os = 'ios';
  else if (/android/i.test(ua)) os = 'android';
  else if (/windows/i.test(ua)) os = 'windows';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macos';
  else if (/linux/i.test(ua)) os = 'linux';
  else os = 'other';

  const isTablet = /ipad/i.test(ua) || isIpadOS || (/android/i.test(ua) && !/mobile/i.test(ua));
  const isMobile = /iphone|ipod|android.*mobile|mobile/i.test(ua);
  const form = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

  return { os, form };
}

/** Send a JSON beacon without blocking. Falls back to keepalive fetch. */
function post(body: Record<string, unknown>): void {
  try {
    const json = JSON.stringify(body);
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/track', new Blob([json], { type: 'application/json' }));
    } else {
      void fetch('/api/track', {
        method: 'POST',
        body: json,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => { /* ignore */ });
    }
  } catch {
    /* analytics must never throw */
  }
}

// Dedupe per page load: a component remount must not double-count a step.
const sent = new Set<FunnelEvent>();

/** Record a funnel step (counted at most once per page load). */
export function track(event: FunnelEvent): void {
  if (sent.has(event)) return;
  sent.add(event);
  // Device is only meaningful (and only counted server-side) on the entry event.
  post(event === 'home' ? { event, ...detectDevice() } : { event });
}

let dwellArmed = false;

/**
 * Start measuring time-on-site. Sends a single "dwell" beacon the first time the
 * page is hidden (the most reliable "leaving" signal on mobile) or unloaded.
 * Call once, near app start.
 */
export function initDwellTracking(): void {
  if (dwellArmed) return;
  dwellArmed = true;

  const start = Date.now();
  let flushed = false;
  const flush = () => {
    if (flushed) return;
    const ms = Date.now() - start;
    if (ms < 1000) return; // ignore instant bounces / accidental hits
    flushed = true;
    post({ event: 'dwell', dwellMs: ms });
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}
