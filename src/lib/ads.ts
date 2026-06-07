/**
 * Google AdSense configuration.
 *
 * Consent is handled by Google's certified CMP (set up in AdSense → Privacy &
 * messaging), which loads via the AdSense tag in index.html's <head> and shows
 * its own consent message to EEA/UK/Swiss visitors. We therefore do NOT run our
 * own consent banner or gate ad rendering on local consent — AdSense serves
 * non-personalised ads to non-consenters automatically.
 *
 * The publisher + slot IDs are public (they appear in the page source), so they
 * default to the live values and can still be overridden by build-time env vars.
 */

const ADSENSE_CLIENT =
  (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined)?.trim() || 'ca-pub-2390553551531836';

/** Home-page display unit ("Home – responsive"). */
export const ADSENSE_SLOT_HOME =
  (import.meta.env.VITE_ADSENSE_SLOT_HOME as string | undefined)?.trim() || '5938980122';

export const adsenseClient = ADSENSE_CLIENT;

/** True when a valid AdSense publisher ID is configured. */
export function adsConfigured(): boolean {
  return /^ca-pub-\d{10,}$/.test(ADSENSE_CLIENT);
}
