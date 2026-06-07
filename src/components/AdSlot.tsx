import { useEffect, useRef, useState } from 'react';
import { adsConfigured, adsenseClient } from '../lib/ads';
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
}

/**
 * A single responsive AdSense display unit.
 *
 * Renders the <ins> so AdSense can fill it, but keeps the wrapper (label +
 * spacing) hidden until an ad actually fills (data-ad-status="filled"). That
 * means: nothing visible before the site is approved or when no ad is available
 * — no empty "Advertisement" boxes — and minimal layout shift (the slot sits
 * below the main content).
 */
export default function AdSlot({ slot, className }: AdSlotProps) {
  const insRef = useRef<HTMLModElement>(null);
  const [status, setStatus] = useState<'pending' | 'filled' | 'unfilled'>('pending');

  useEffect(() => {
    if (!adsConfigured() || !slot) return;
    const ins = insRef.current;
    if (!ins) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* adsbygoogle not ready — AdSense retries automatically */
    }
    // Watch AdSense's fill signal so we only reveal the label/spacing once filled.
    const obs = new MutationObserver(() => {
      const s = ins.getAttribute('data-ad-status');
      if (s === 'filled') setStatus('filled');
      else if (s === 'unfilled') setStatus('unfilled');
    });
    obs.observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
    return () => obs.disconnect();
  }, [slot]);

  if (!adsConfigured() || !slot) return null;

  // The <ins> must keep full width so AdSense can measure + fill it. We only add
  // the label + vertical spacing once an ad fills; unfilled responsive units
  // collapse to 0 height, so the slot is invisible until a real ad shows.
  const filled = status === 'filled';
  return (
    <div className={cn('mx-auto w-full max-w-3xl px-4 text-center', filled && 'my-8', className)}>
      {filled && (
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
