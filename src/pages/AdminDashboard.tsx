import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import {
  ChevronLeft, RefreshCw, Users, Zap, MessageSquare, Star, TrendingUp,
  Clock, ThumbsUp, ThumbsDown, Globe, Tags, UserCheck, Crown, Gauge, Activity,
} from 'lucide-react';
import { motion } from 'motion/react';
import { auth, authedGet } from '../lib/firebase';
import { fadeUp, staggerContainer } from '../lib/animations';
import { codeToFlag, codeToName } from '../lib/flags';

const ADMIN_EMAILS = ['darshan.p.hegde@gmail.com'];

interface VoteRow { text: string; up: number; down: number }

interface DashboardStats {
  generatedAt: string;
  totals: {
    sessions: number; players: number; questions: number;
    feedback: number; registeredUsers: number; completedSessions: number;
  };
  engagement: {
    avgPlaySeconds: number | null;
    avgPlayersPerSession: number | null;
    avgQuestionsPerSession: number | null;
    completionRate: number | null;
  };
  daily: { date: string; sessions: number; players: number; questions: number }[];
  countries: { code: string; count: number }[];
  categories: { name: string; count: number }[];
  questionVotes: { totalUp: number; totalDown: number; totalRated: number; topLiked: VoteRow[]; topDisliked: VoteRow[] };
  feedback: { total: number; ratedCount: number; avgRating: number | null; distribution: number[] };
  users: { total: number; sampled: number; active: number; premium: number; hitFreeLimit: number; avgUsage: number; freeLimit: number };
}

interface FeedbackItem {
  id: string;
  text: string;
  rating: number | null;
  sessionCode: string | null;
  questionText: string | null;
  email: string | null;
  createdAt: string | null;
  ip: string | null;
}

function fmtDuration(secs: number | null): string {
  if (secs == null) return '—';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/**
 * /admin — Owner-only analytics dashboard. Surfaces lifetime + derived metrics,
 * a 14-day trend, crowd question-vote leaderboards (for tuning prompts), category
 * popularity, geography, feedback ratings, and user/conversion stats.
 */
export default function AdminDashboard() {
  const [user, loadingAuth] = useAuthState(auth);
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user && ADMIN_EMAILS.includes(user.email ?? '');

  useEffect(() => {
    if (loadingAuth) return;
    if (!user || !isAdmin) {
      navigate('/');
      return;
    }
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadingAuth]);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, feedbackRes] = await Promise.all([
        authedGet('/api/admin/dashboard-stats'),
        authedGet('/api/admin/feedback-list?limit=30'),
      ]);
      if (!statsRes.ok || !feedbackRes.ok) throw new Error('Failed to load dashboard data');
      setStats((await statsRes.json()) as DashboardStats);
      setFeedback(((await feedbackRes.json()) as { items: FeedbackItem[] }).items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  if (loadingAuth || (!user && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F0]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1A1A1A]/10 border-t-[#5A5A40]" />
      </div>
    );
  }
  if (!isAdmin) return null;

  const approval =
    stats && stats.questionVotes.totalUp + stats.questionVotes.totalDown > 0
      ? Math.round((stats.questionVotes.totalUp / (stats.questionVotes.totalUp + stats.questionVotes.totalDown)) * 100)
      : null;

  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      <header className="border-b border-[#1A1A1A]/10 bg-white/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link to="/account" className="text-[#1A1A1A]/40 transition-colors hover:text-[#1A1A1A]/70">
              <ChevronLeft size={18} />
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-[#1A1A1A]" style={{ fontFamily: 'Georgia, serif' }}>
                Admin Dashboard
              </h1>
              <p className="text-[10px] uppercase tracking-[0.3em] text-[#1A1A1A]/30">
                Dinner Table Cards Analytics
                {stats && (
                  <span className="ml-2 normal-case tracking-normal text-[#1A1A1A]/25">
                    · updated {new Date(stats.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={loadDashboard}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-[#1A1A1A]/10 px-3 py-2 text-xs uppercase tracking-wider text-[#1A1A1A]/60 transition-all hover:bg-white hover:shadow-sm disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {stats && (
          <>
            {/* ── KPI cards ──────────────────────────────────────────────── */}
            <motion.div
              initial="hidden" animate="visible" variants={staggerContainer}
              className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6"
            >
              <StatCard icon={Zap} value={stats.totals.sessions} label="Sessions" color="amber" />
              <StatCard icon={Users} value={stats.totals.players} label="Players" color="emerald" />
              <StatCard icon={MessageSquare} value={stats.totals.questions} label="Questions" color="sky" />
              <StatCard icon={UserCheck} value={stats.totals.registeredUsers} label="Registered" color="violet" />
              <StatCard icon={Crown} value={stats.users.premium} label="Premium" color="rose" />
              <StatCard icon={Star} value={stats.totals.feedback} label="Feedback" color="stone" />
            </motion.div>

            {/* ── Engagement / quality ratios ───────────────────────────── */}
            <Panel icon={Gauge} title="Engagement & Quality">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
                <Metric icon={Clock} label="Avg. play time" value={fmtDuration(stats.engagement.avgPlaySeconds)} />
                <Metric icon={Users} label="Players / session" value={stats.engagement.avgPlayersPerSession ?? '—'} />
                <Metric icon={MessageSquare} label="Questions / session" value={stats.engagement.avgQuestionsPerSession ?? '—'} />
                <Metric icon={Activity} label="Completion rate" value={stats.engagement.completionRate != null ? `${stats.engagement.completionRate}%` : '—'} hint={`${stats.totals.completedSessions} finished`} />
                <Metric icon={ThumbsUp} label="Question approval" value={approval != null ? `${approval}%` : '—'} hint={`${stats.questionVotes.totalUp}▲ / ${stats.questionVotes.totalDown}▼`} />
              </div>
            </Panel>

            {/* ── 14-day trend ──────────────────────────────────────────── */}
            <Panel icon={TrendingUp} title="Last 14 Days">
              <DailyChart data={stats.daily} />
            </Panel>

            {/* ── Question-vote leaderboards (prompt tuning) ─────────────── */}
            <Panel icon={ThumbsUp} title="Question Performance" subtitle="Crowd up/down votes — the signal for tuning question prompts">
              {stats.questionVotes.totalRated === 0 ? (
                <Empty>No question votes yet. They appear as players rate questions mid-game.</Empty>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  <VoteLeaderboard title="Top performing" tone="up" rows={stats.questionVotes.topLiked} />
                  <VoteLeaderboard title="Underperforming" tone="down" rows={stats.questionVotes.topDisliked} />
                </div>
              )}
            </Panel>

            {/* ── Category popularity + Geography ───────────────────────── */}
            <div className="grid gap-6 md:grid-cols-2">
              <Panel icon={Tags} title="Category Popularity" subtitle="Which question sets hosts pick most">
                {stats.categories.length === 0 ? (
                  <Empty>No category data yet. Tracking starts as hosts pick questions.</Empty>
                ) : (
                  <BarList items={stats.categories.map((c) => ({ label: c.name, count: c.count }))} />
                )}
              </Panel>
              <Panel icon={Globe} title="Geography" subtitle="Player joins by country">
                {stats.countries.length === 0 ? (
                  <Empty>No geography data yet.</Empty>
                ) : (
                  <BarList items={stats.countries.map((c) => ({ label: `${codeToFlag(c.code)} ${codeToName(c.code)}`, count: c.count }))} />
                )}
              </Panel>
            </div>

            {/* ── Feedback ratings + User conversion ────────────────────── */}
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <Panel icon={Star} title="Feedback Ratings">
                {stats.feedback.ratedCount === 0 ? (
                  <Empty>No star ratings yet.</Empty>
                ) : (
                  <RatingBars avg={stats.feedback.avgRating} distribution={stats.feedback.distribution} total={stats.feedback.ratedCount} />
                )}
              </Panel>
              <Panel icon={Users} title="Users & Conversion">
                <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                  <Metric icon={UserCheck} label="Registered" value={stats.users.total} />
                  <Metric icon={Activity} label="Active (used ≥1)" value={stats.users.active} hint={`of ${stats.users.sampled} sampled`} />
                  <Metric icon={Crown} label="Premium" value={stats.users.premium} hint={pct(stats.users.premium, stats.users.sampled)} />
                  <Metric icon={Gauge} label="Hit free limit" value={stats.users.hitFreeLimit} hint={`≥${stats.users.freeLimit} · upgrade signal`} />
                  <Metric icon={MessageSquare} label="Avg. questions / user" value={stats.users.avgUsage} />
                </div>
              </Panel>
            </div>
          </>
        )}

        {/* ── Recent feedback list ─────────────────────────────────────── */}
        <div className="mt-6">
          <Panel icon={MessageSquare} title={`Recent Feedback (${feedback.length})`}>
            {feedback.length === 0 ? (
              <Empty>No feedback yet.</Empty>
            ) : (
              <div className="space-y-3">
                {feedback.map((item) => <FeedbackRow key={item.id} item={item} />)}
              </div>
            )}
          </Panel>
        </div>
      </main>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : '—';
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Panel({ icon: Icon, title, subtitle, children }: {
  icon: typeof Users; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <motion.div
      variants={fadeUp} initial="hidden" animate="visible"
      className="mb-6 rounded-xl border border-[#1A1A1A]/10 bg-white p-6 shadow-sm"
    >
      <div className="mb-4 flex items-center gap-2">
        <Icon size={14} className="text-[#5A5A40]" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#1A1A1A]/60">{title}</h2>
      </div>
      {subtitle && <p className="-mt-3 mb-4 text-xs italic text-[#1A1A1A]/40">{subtitle}</p>}
      {children}
    </motion.div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm italic text-[#1A1A1A]/40" style={{ fontFamily: 'Georgia, serif' }}>{children}</p>;
}

function Metric({ icon: Icon, label, value, hint }: {
  icon: typeof Users; label: string; value: string | number; hint?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[#1A1A1A]/40">
        <Icon size={12} />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-bold text-[#1A1A1A] tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-[#1A1A1A]/35">{hint}</p>}
    </div>
  );
}

function StatCard({ icon: Icon, value, label, color }: {
  icon: typeof Users; value: number; label: string;
  color: 'amber' | 'emerald' | 'sky' | 'violet' | 'rose' | 'stone';
}) {
  const colorMap = {
    amber: 'from-amber-50 to-amber-100 border-amber-200 text-amber-700',
    emerald: 'from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-700',
    sky: 'from-sky-50 to-sky-100 border-sky-200 text-sky-700',
    violet: 'from-violet-50 to-violet-100 border-violet-200 text-violet-700',
    rose: 'from-rose-50 to-rose-100 border-rose-200 text-rose-700',
    stone: 'from-stone-50 to-stone-100 border-stone-200 text-stone-700',
  };
  return (
    <motion.div variants={fadeUp} className={`rounded-xl border bg-gradient-to-br p-4 ${colorMap[color]}`}>
      <Icon size={16} className="mb-2 opacity-60" />
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      <p className="text-[10px] uppercase tracking-wider opacity-60">{label}</p>
    </motion.div>
  );
}

function DailyChart({ data }: { data: DashboardStats['daily'] }) {
  const maxVal = Math.max(...data.flatMap((d) => [d.sessions, d.players, d.questions]), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#1A1A1A]/5">
            <th className="pb-2 text-left font-medium text-[#1A1A1A]/40">Date</th>
            <th className="pb-2 text-right font-medium text-amber-600">Sessions</th>
            <th className="pb-2 text-right font-medium text-emerald-600">Players</th>
            <th className="pb-2 text-right font-medium text-sky-600">Questions</th>
            <th className="pb-2 pl-4 text-left font-medium text-[#1A1A1A]/40">Activity</th>
          </tr>
        </thead>
        <tbody>
          {data.map((day) => {
            const total = day.sessions + day.players + day.questions;
            const barWidth = maxVal > 0 ? (total / (maxVal * 3)) * 100 : 0;
            return (
              <tr key={day.date} className="border-b border-[#1A1A1A]/5 last:border-0">
                <td className="py-2 text-[#1A1A1A]/60">
                  {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </td>
                <td className="py-2 text-right font-medium text-amber-700">{day.sessions}</td>
                <td className="py-2 text-right font-medium text-emerald-700">{day.players}</td>
                <td className="py-2 text-right font-medium text-sky-700">{day.questions}</td>
                <td className="py-2 pl-4">
                  <div className="h-2 w-24 rounded-full bg-[#1A1A1A]/5">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#5A5A40] to-[#5A5A40]/60" style={{ width: `${Math.min(100, barWidth)}%` }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BarList({ items }: { items: { label: string; count: number }[] }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-2.5">
      {items.slice(0, 12).map((it) => (
        <div key={it.label} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-xs text-[#1A1A1A]/70" title={it.label}>{it.label}</span>
          <div className="h-2.5 flex-1 rounded-full bg-[#1A1A1A]/5">
            <div className="h-full rounded-full bg-gradient-to-r from-[#5A5A40] to-[#5A5A40]/50" style={{ width: `${(it.count / max) * 100}%` }} />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-semibold text-[#1A1A1A]/60 tabular-nums">{it.count}</span>
        </div>
      ))}
    </div>
  );
}

function VoteLeaderboard({ title, tone, rows }: { title: string; tone: 'up' | 'down'; rows: VoteRow[] }) {
  const Icon = tone === 'up' ? ThumbsUp : ThumbsDown;
  const accent = tone === 'up' ? 'text-emerald-600' : 'text-red-500';
  return (
    <div>
      <div className={`mb-3 flex items-center gap-1.5 ${accent}`}>
        <Icon size={13} />
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
      </div>
      {rows.length === 0 ? (
        <Empty>None yet.</Empty>
      ) : (
        <ol className="space-y-2.5">
          {rows.map((r, i) => {
            const net = r.up - r.down;
            return (
              <li key={i} className="flex items-start gap-3 border-b border-[#1A1A1A]/5 pb-2.5 last:border-0">
                <span className="mt-0.5 w-4 shrink-0 text-right text-xs font-bold text-[#1A1A1A]/25 tabular-nums">{i + 1}</span>
                <p className="flex-1 text-xs leading-relaxed text-[#1A1A1A]/80" style={{ fontFamily: 'Georgia, serif' }}>
                  "{r.text}"
                </p>
                <span className="shrink-0 text-[10px] tabular-nums">
                  <span className="text-emerald-600">{r.up}▲</span>{' '}
                  <span className="text-red-500">{r.down}▼</span>
                  <span className={`ml-1 font-bold ${net >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{net >= 0 ? `+${net}` : net}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function RatingBars({ avg, distribution, total }: { avg: number | null; distribution: number[]; total: number }) {
  const max = Math.max(...distribution, 1);
  return (
    <div>
      <div className="mb-4 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-amber-600">{avg ?? '—'}</span>
        <span className="text-sm text-amber-500">★</span>
        <span className="text-xs text-[#1A1A1A]/40">avg · {total} rated</span>
      </div>
      <div className="space-y-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = distribution[star - 1] ?? 0;
          return (
            <div key={star} className="flex items-center gap-2 text-xs">
              <span className="w-6 text-[#1A1A1A]/50">{star}★</span>
              <div className="h-2 flex-1 rounded-full bg-[#1A1A1A]/5">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${(count / max) * 100}%` }} />
              </div>
              <span className="w-6 text-right text-[#1A1A1A]/50 tabular-nums">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FeedbackRow = React.memo(function FeedbackRow({ item }: { item: FeedbackItem }) {
  return (
    <div className="rounded-lg border border-[#1A1A1A]/5 p-4 transition-colors hover:bg-[#1A1A1A]/[0.02]">
      <div className="mb-2 flex items-start justify-between gap-4">
        <p className="flex-1 text-sm text-[#1A1A1A]" style={{ fontFamily: 'Georgia, serif' }}>"{item.text}"</p>
        {item.rating && (
          <span className="shrink-0 text-xs text-amber-600">{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-wider text-[#1A1A1A]/40">
        {item.createdAt && (
          <span>{new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        )}
        {item.sessionCode && <span className="rounded bg-[#1A1A1A]/5 px-1.5 py-0.5">Session: {item.sessionCode}</span>}
        {item.email && <span className="text-[#5A5A40]">{item.email}</span>}
        {item.ip && <span className="opacity-50">IP: {item.ip}</span>}
      </div>
      {item.questionText && <p className="mt-1.5 text-xs italic text-[#1A1A1A]/30">Re: {item.questionText}</p>}
    </div>
  );
});
