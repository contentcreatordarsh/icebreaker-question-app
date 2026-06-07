import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { shouldAskConsent, setConsent } from '../lib/ads';

/**
 * Lightweight cookie-consent banner. Only appears when ads are configured but the
 * visitor hasn't decided yet (so it's invisible until ads are switched on).
 * Declining keeps the app fully usable — it just won't show personalised ads.
 */
export default function ConsentBanner() {
  const [visible, setVisible] = useState(shouldAskConsent());

  if (!visible) return null;

  const decide = (value: 'granted' | 'denied') => {
    setConsent(value);
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          role="dialog"
          aria-label="Cookie consent"
          className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-4 sm:px-6 sm:pb-6"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-xl border border-brand/15 bg-paper/95 p-5 shadow-2xl backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] leading-relaxed text-brand/70">
              We show ads to keep Dinner Table Cards free. With your OK, our ad partner may use
              cookies to make them more relevant. You can decline — the app works either way.{' '}
              <Link to="/privacy" className="underline hover:text-brand">Learn more</Link>.
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => decide('denied')}
                className="rounded-full border border-brand/20 px-4 py-2 text-[11px] uppercase tracking-wider text-brand/60 transition-colors hover:bg-brand/5"
              >
                Decline
              </button>
              <button
                onClick={() => decide('granted')}
                className="rounded-full bg-brand px-5 py-2 text-[11px] uppercase tracking-wider text-paper transition-all hover:bg-opacity-90 active:scale-[0.98]"
              >
                Accept
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
