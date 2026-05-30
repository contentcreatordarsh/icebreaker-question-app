import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, X, RefreshCw } from 'lucide-react';

interface PaymentSuccessBannerProps {
  onDismiss: () => void;
  isPremiumConfirmed: boolean;
}

export default function PaymentSuccessBanner({ onDismiss, isPremiumConfirmed }: PaymentSuccessBannerProps) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (isPremiumConfirmed) return;
    // After 32s of waiting, offer a manual refresh
    const t = setTimeout(() => setTimedOut(true), 32000);
    return () => clearTimeout(t);
  }, [isPremiumConfirmed]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full bg-brand text-white px-6 py-4 flex items-center justify-between gap-4"
    >
      <div className="flex items-center gap-3 flex-1 flex-wrap">
        <Sparkles size={16} className="shrink-0 text-accent" />
        <span className="caps-tracking text-sm">
          {isPremiumConfirmed
            ? 'Welcome to Premium — your archive is now unlocked.'
            : timedOut
              ? 'Payment received. Taking a moment — try refreshing.'
              : 'Payment received — activating your account…'}
        </span>
        {timedOut && !isPremiumConfirmed && (
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 caps-tracking text-[10px] bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-sm transition-colors"
          >
            <RefreshCw size={11} /> Refresh
          </button>
        )}
      </div>
      <button onClick={onDismiss} className="opacity-60 hover:opacity-100 transition-opacity shrink-0" aria-label="Dismiss">
        <X size={14} />
      </button>
    </motion.div>
  );
}
