import { useEffect, useRef, useState } from 'react';
import { adsEnabled, adsenseClient, CONSENT_EVENT } from '../lib/ads';
import { cn } from '../lib/utils';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

interface AdSlotProps {
  /** AdSense ad-unit slot ID (data-ad-slot). Falsy → renders nothing. */
  slot: string;
  className?: string;
  /** Optional small "Advertisement" label above the unit. */
  label?: boolean;
}

/**
 * A single responsive AdSense unit. Renders NOTHING unless ads are both
 * configured (publisher ID set) and consented to — so it's invisible until ads
 * are switched on. Re-renders when consent changes.
 */
export default function AdSlot({ slot, className, label = true }: AdSlotProps) {
  const insRef = useRef<HTMLModElement>(null);
  const [enabled, setEnabled] = useState(adsEnabled());

  useEffect(() => {
    const onChange = () => setEnabled(adsEnabled());
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (!enabled || !slot) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* adsbygoogle not ready yet — it retries on next render */
    }
  }, [enabled, slot]);

  if (!enabled || !slot) return null;

  return (
    <div className={cn('mx-auto w-full max-w-3xl px-4 text-center', className)}>
      {label && (
        <p className="mb-1 text-[9px] uppercase tracking-[0.3em] text-brand/25">Advertisement</p>
      )}
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={adsenseClient}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
