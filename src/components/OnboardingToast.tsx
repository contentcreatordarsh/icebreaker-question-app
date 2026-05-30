import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Shuffle, LogIn, X, Gift, Copy, Check } from 'lucide-react';

interface OnboardingToastProps {
  isSignedIn: boolean;
  referralLink?: string;
}

const BASE_TOASTS = [
  {
    id: 'heart',
    icon: Heart,
    text: 'Tap the heart on any question to save it to your favorites.',
    delay: 4000,
    signedOutOnly: false,
    isReferral: false,
  },
  {
    id: 'shuffle',
    icon: Shuffle,
    text: 'Use "New Question" to shuffle, or "Surprise Me" for an AI-crafted one.',
    delay: 10000,
    signedOutOnly: false,
    isReferral: false,
  },
  {
    id: 'signin',
    icon: LogIn,
    text: 'Sign in to keep your favorites and track your streak across devices.',
    delay: 18000,
    signedOutOnly: true,
    isReferral: false,
  },
  {
    id: 'referral',
    icon: Gift,
    text: 'Invite a friend → you both earn 50 bonus questions free.',
    delay: 8000,
    signedOutOnly: false,
    signedInOnly: true,
    isReferral: true,
  },
] as const;

export default function OnboardingToast({ isSignedIn, referralLink }: OnboardingToastProps) {
  const [visible, setVisible] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // useRef so the dismiss check inside setTimeout closures always sees the latest value
  const dismissedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (localStorage.getItem('onboardingComplete')) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    BASE_TOASTS.forEach(toast => {
      if (toast.signedOutOnly && isSignedIn) return;
      if ('signedInOnly' in toast && toast.signedInOnly && !isSignedIn) return;
      // Only show the referral toast if we have a referral link
      if (toast.isReferral && !referralLink) return;

      const t = setTimeout(() => {
        // Skip if already dismissed by the user
        if (dismissedRef.current.has(toast.id)) return;
        setVisible(toast.id);

        // Auto-dismiss after 7 s (referral gets a bit longer)
        const autoT = setTimeout(() => {
          setVisible(prev => (prev === toast.id ? null : prev));
        }, toast.isReferral ? 9000 : 5000);
        timers.push(autoT);
      }, toast.delay);

      timers.push(t);
    });

    // Mark complete after all toasts have had a chance to show
    const doneTimer = setTimeout(() => {
      localStorage.setItem('onboardingComplete', '1');
    }, 28000);
    timers.push(doneTimer);

    return () => timers.forEach(clearTimeout);
  // Re-run when sign-in state or referral link changes
  }, [isSignedIn, referralLink]);

  const dismiss = (id: string) => {
    dismissedRef.current.add(id);
    setVisible(null);
  };

  const copyReferral = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  const currentToast = BASE_TOASTS.find(t => t.id === visible);

  return (
    <AnimatePresence>
      {currentToast && (
        <motion.div
          key={currentToast.id}
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-8 right-6 z-40 max-w-xs bg-white border border-brand/15 shadow-xl rounded-sm px-5 py-4 flex items-start gap-3"
        >
          <currentToast.icon size={14} className="mt-0.5 shrink-0 opacity-50" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] caps-tracking leading-relaxed opacity-70">
              {currentToast.text}
            </p>
            {currentToast.isReferral && referralLink && (
              <button
                onClick={copyReferral}
                className="mt-2 flex items-center gap-1.5 text-[10px] caps-tracking bg-brand/5 border border-brand/15 px-3 py-1.5 hover:bg-brand/10 transition-colors rounded-sm"
              >
                {copied ? <><Check size={10} /> Copied!</> : <><Copy size={10} /> Copy invite link</>}
              </button>
            )}
          </div>
          <button
            onClick={() => dismiss(currentToast.id)}
            className="shrink-0 opacity-30 hover:opacity-70 transition-opacity mt-0.5"
            aria-label="Dismiss"
          >
            <X size={12} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
