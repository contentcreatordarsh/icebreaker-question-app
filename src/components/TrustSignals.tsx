import { useEffect, useState, useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { Users, MessageSquare, Zap } from 'lucide-react';

interface StatItem {
  icon: typeof Users;
  value: number;
  suffix: string;
  label: string;
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

/**
 * Trust signals with animated counters — fetches live stats from API.
 * Shows on the landing page to build credibility.
 */
export default function TrustSignals() {
  const [stats, setStats] = useState<{ sessions: number; players: number; questions: number } | null>(null);

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(data => setStats(data as typeof stats))
      .catch(() => {
        // Fallback stats if API fails
        setStats({ sessions: 50, players: 200, questions: 600 });
      });
  }, []);

  if (!stats) return null;

  const items: StatItem[] = [
    { icon: Zap, value: stats.sessions, suffix: '+', label: 'Sessions hosted' },
    { icon: Users, value: stats.players, suffix: '+', label: 'Players joined' },
    { icon: MessageSquare, value: stats.questions, suffix: '+', label: 'Questions asked' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.5 }}
      className="flex flex-wrap items-center justify-center gap-8 py-8"
    >
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2.5">
          <item.icon size={16} className="text-[#5A5A40] opacity-60" />
          <div>
            <p className="text-lg font-semibold text-[#1A1A1A]">
              <AnimatedCounter target={item.value} />
              {item.suffix}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-[#1A1A1A]/40">
              {item.label}
            </p>
          </div>
        </div>
      ))}
    </motion.div>
  );
}
