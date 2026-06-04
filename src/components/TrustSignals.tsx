import { useEffect, useState, useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { Users, MessageSquare, Zap, Clock } from 'lucide-react';

interface Stats {
  sessions: number;
  players: number;
  questions: number;
  avgPlaySeconds: number | null;
}

function AnimatedCounter({ target, duration = 1500 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration, isInView]);

  return <span ref={ref}>{count.toLocaleString()}</span>;
}

/** Format avg play seconds into a count-up value + unit. */
function avgPlay(secs: number): { value: number; unit: string } {
  return secs >= 60 ? { value: Math.round(secs / 60), unit: 'm' } : { value: secs, unit: 's' };
}

interface StatItem {
  icon: typeof Users;
  value: number;
  display: 'count' | 'duration';
  suffix: string;
  label: string;
}

/**
 * Live trust signals — real, un-seeded counters from /api/stats with a "live"
 * pulse, count-up animation, and avg playing time. Renders nothing until data
 * loads (no invented numbers).
 */
export default function TrustSignals() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/stats', { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setStats(d as Stats))
      .catch(() => {
        // On failure, render nothing rather than invent numbers (stats stays null).
      });
    return () => controller.abort();
  }, []);

  if (!stats) return null;

  const items: StatItem[] = [
    { icon: Zap, value: stats.sessions, display: 'count', suffix: '+', label: 'Sessions hosted' },
    { icon: Users, value: stats.players, display: 'count', suffix: '+', label: 'Players joined' },
    { icon: MessageSquare, value: stats.questions, display: 'count', suffix: '+', label: 'Questions asked' },
  ];

  if (stats.avgPlaySeconds && stats.avgPlaySeconds > 0) {
    const a = avgPlay(stats.avgPlaySeconds);
    items.push({ icon: Clock, value: a.value, display: 'duration', suffix: a.unit, label: 'Avg. play time' });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.5 }}
      className="flex flex-col items-center gap-4 py-8"
    >
      {/* Live indicator */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[10px] uppercase tracking-[0.3em] text-[#1A1A1A]/40">Live</span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-5">
        {items.map((item) => (
          <div
            key={item.label}
            className="group flex items-center gap-2.5 transition-transform duration-300 hover:-translate-y-0.5"
          >
            <item.icon
              size={16}
              className="text-[#5A5A40] opacity-50 transition-opacity group-hover:opacity-100"
            />
            <div>
              <p className="text-lg font-semibold text-[#1A1A1A] tabular-nums">
                <AnimatedCounter target={item.value} />
                {item.suffix}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-[#1A1A1A]/55">{item.label}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
