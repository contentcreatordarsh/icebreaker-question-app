import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { codeToFlag, codeToName } from '../lib/flags';

interface CountryStat { code: string; count: number; }
interface Stats {
  sessions: number;
  players: number;
  questions: number;
  countries: CountryStat[];
  topCountry: string | null;
}

function useStats(): Stats | null {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/stats', { signal: controller.signal })
      .then(r => r.json())
      .then(d => setStats(d as Stats))
      .catch(() => { /* leave null — render nothing rather than invent data */ });
    return () => controller.abort();
  }, []);
  return stats;
}

/**
 * Live "players around the world" display, driven by real Cloudflare edge-geo
 * counts from /api/stats.
 *  - variant="strip"   → compact hero line: "Played in N countries" + top flags
 *  - variant="section" → full editorial section with the #1 country + a ranked list
 */
export default function WorldStats({ variant }: { variant: 'strip' | 'section' }) {
  const stats = useStats();
  const countries = stats?.countries ?? [];

  // ── Compact hero strip ──────────────────────────────────────────────────────
  if (variant === 'strip') {
    if (countries.length === 0) return null;
    const topFlags = countries.slice(0, 8);
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.5 }}
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2"
      >
        <span className="caps-tracking text-[10px] opacity-50">
          Played in {countries.length} {countries.length === 1 ? 'country' : 'countries'}
        </span>
        <span className="flex items-center gap-1 text-lg leading-none" aria-hidden>
          {topFlags.map(c => (
            <span key={c.code} title={codeToName(c.code)}>{codeToFlag(c.code)}</span>
          ))}
        </span>
      </motion.div>
    );
  }

  // ── Full "around the world" section ──────────────────────────────────────────
  const max = countries[0]?.count ?? 1;
  const top = countries.slice(0, 12);

  return (
    <section className="py-14 md:py-16 border-b border-brand/10">
      <span className="caps-tracking opacity-40 block mb-2">Live · around the world</span>
      <h2 className="font-serif text-2xl md:text-3xl italic text-brand mb-3">
        {stats?.topCountry
          ? <>Loved most in {codeToFlag(stats.topCountry)} {codeToName(stats.topCountry)}</>
          : 'Conversations happening around the world'}
      </h2>
      <p className="text-sm opacity-50 mb-8 max-w-lg">
        Real players are joining live sessions from
        {countries.length > 0 ? ` ${countries.length} ${countries.length === 1 ? 'country' : 'countries'} and counting` : ' all over the world'}.
        Every flag below is a real person who pulled up a seat at the table.
      </p>

      {countries.length === 0 ? (
        <p className="font-serif text-lg italic text-brand/50">
          🌍 Be the first to host — your country goes here.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-3 max-w-2xl">
          {top.map((c, i) => (
            <motion.div
              key={c.code}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: Math.min(i * 0.04, 0.4) }}
              className={i === 0 ? 'rounded-md bg-accent/5 -mx-2 px-2 py-1' : ''}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl leading-none" aria-hidden>{codeToFlag(c.code)}</span>
                <span className={`text-sm flex-1 ${i === 0 ? 'text-brand font-medium' : 'text-brand/70'}`}>
                  {codeToName(c.code)}
                  {i === 0 && <span className="ml-2 text-[9px] caps-tracking text-accent align-middle">#1</span>}
                </span>
                <span className="text-xs caps-tracking opacity-40 tabular-nums">{c.count}</span>
              </div>
              <div className="mt-1 ml-9 h-[3px] rounded-full bg-brand/10 overflow-hidden">
                <div
                  className={`h-full rounded-full ${i === 0 ? 'bg-accent' : 'bg-brand/40'}`}
                  style={{ width: `${Math.max(6, Math.round((c.count / max) * 100))}%` }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
