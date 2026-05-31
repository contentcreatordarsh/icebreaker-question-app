import { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';

interface TimerProps {
  timerEndsAt: string | null;
  className?: string;
}

/**
 * Countdown timer that uses an absolute timestamp to avoid clock drift.
 * Shows MM:SS format. Pulses red when under 30 seconds.
 */
export default function Timer({ timerEndsAt, className }: TimerProps) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!timerEndsAt) {
      setSecondsLeft(null);
      return;
    }

    function tick() {
      const remaining = Math.max(0, Math.ceil((new Date(timerEndsAt!).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timerEndsAt]);

  if (secondsLeft === null) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isUrgent = secondsLeft <= 30;
  const isExpired = secondsLeft === 0;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-4 py-2 font-mono text-lg tracking-wider transition-colors',
        isExpired
          ? 'bg-red-100 text-red-700'
          : isUrgent
            ? 'bg-red-50 text-red-600 animate-pulse'
            : 'bg-[#F5F2ED] text-[#1A1A1A]/70',
        className,
      )}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
      <span>
        {isExpired ? "Time's up!" : `${minutes}:${String(seconds).padStart(2, '0')}`}
      </span>
    </div>
  );
}
