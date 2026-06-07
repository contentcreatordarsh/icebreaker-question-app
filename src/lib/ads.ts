/**
 * Ad support (Google AdSense) + cookie consent.
 *
 * Design: ads are OFF by default and stay invisible until BOTH are true:
 *   1. a publisher ID is configured (VITE_ADSENSE_CLIENT), and
 *   2. the visitor has granted consent.
 *
 * If no publisher ID is set, the consent banner never appears and no ad scripts
 * load — the app is byte-for-byte the same as before. This lets us ship the
 * scaffolding now and "turn on" ads later just by setting the env vars.
 */

const ADSENSE_CLIENT = (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined)?.trim() || '';
export const ADSENSE_SLOT_HOME = (import.meta.env.VITE_ADSENSE_SLOT_HOME as string | undefined)?.trim() || '';

const CONSENT_KEY = 'dtc-ad-consent';
/** Fired (on window) whenever consent changes so AdSlots can re-render. */
export const CONSENT_EVENT = 'dtc-consent-change';

export const adsenseClient = ADSENSE_CLIENT;

/** True once a valid AdSense publisher ID is configured. */
export function adsConfigured(): boolean {
  return /^ca-pub-\d{10,}$/.test(ADSENSE_CLIENT);
}

export function getConsent(): 'granted' | 'denied' | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(value: 'granted' | 'denied'): void {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* storage unavailable — consent simply won't persist */
  }
  if (value === 'granted') loadAdSense();
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/** Ads should render only when configured AND consented. */
export function adsEnabled(): boolean {
  return adsConfigured() && getConsent() === 'granted';
}

/** Whether to show the consent banner (configured, but no decision yet). */
export function shouldAskConsent(): boolean {
  return adsConfigured() && getConsent() === null;
}

let scriptLoaded = false;
/** Inject the AdSense loader script once (only after consent). */
export function loadAdSense(): void {
  if (scriptLoaded || !adsConfigured()) return;
  scriptLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  s.crossOrigin = 'anonymous';
  document.head.appendChild(s);
}

// On load, if consent was already granted in a previous visit, load the script.
if (typeof window !== 'undefined' && adsEnabled()) loadAdSense();
