import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Shuffle, LogIn, X } from 'lucide-react';

interface OnboardingToastProps {
  isSignedIn: boolean;
}

const TOASTS = [
  {
    id: 'heart',
    icon: Heart,
    text: 'Tap the heart on any question to save it to your favorites.',
    delay: 4000,
  },
  {
    id: 'shuffle',
    icon: Shuffle,
    text: 'Use "New Question" to shuffle, or "Surprise Me" for an AI-crafted one.',
    delay: 10000,
  },
  {
    id: 'signin',
    icon: LogIn,
    text: 'Sign in to keep your favorites and track your streak across devices.',
    delay: 18000,
    signedOutOnly: true,
  },
];

export default function OnboardingToast({ isSignedIn }: OnboardingToastProps) {
  const [visible, setVisible] = useState<string | null>(null);
  // useRef so the dismiss check inside setTimeout closures always sees the latest value
  const dismissedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (localStorage.getItem('onboardingComplete')) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    TOASTS.forEach(toast => {
      if (toast.signedOutOnly && isSignedIn) return;

      const t = setTimeout(() => {
        // Skip if already dismissed by the user
        if (dismissedRef.current.has(toast.id)) return;
        setVisible(toast.id);

        // Auto-dismiss after 5 s
        const autoT = setTimeout(() => {
          setVisible(prev => (prev === toast.id ? null : prev));
        }, 5000);
        timers.push(autoT);
      }, toast.delay);

      timers.push(t);
    });

    // Mark complete after all toasts have had a chance to show
    const doneTimer = setTimeout(() => {
      localStorage.setItem('onboardingComplete', '1');
    }, 25000);
    timers.push(doneTimer);

    return () => timers.forEach(clearTimeout);
  // Only re-run if sign-in state changes (e.g. user signs in mid-session)
  }, [isSignedIn]);

  const dismiss = (id: string) => {
    dismissedRef.current.add(id);
    setVisible(null);
  };

  const currentToast = TOASTS.find(t => t.id === visible);

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
          <p className="text-[11px] caps-tracking leading-relaxed opacity-70 flex-1">
            {currentToast.text}
          </p>
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
