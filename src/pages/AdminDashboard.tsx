import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { ChevronLeft, RefreshCw, Users, Zap, MessageSquare, Star, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import { auth, authedGet } from '../lib/firebase';
import { fadeUp, staggerContainer } from '../lib/animations';

const ADMIN_EMAILS = ['darshan.p.hegde@gmail.com'];

interface DashboardStats {
  totals: { sessions: number; players: number; questions: number; feedback: number };
  daily: { date: string; sessions: number; players: number; questions: number }[];
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

/**
 * /admin — Owner-only analytics dashboard.
 * Shows usage metrics, daily trends, and feedback list.
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

      if (!statsRes.ok || !feedbackRes.ok) {
        throw new Error('Failed to load dashboard data');
      }

      const statsData = await statsRes.json() as DashboardStats;
      const feedbackData = await feedbackRes.json() as { items: FeedbackItem[] };

      setStats(statsData);
      setFeedback(feedbackData.items);
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

  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      {/* Header */}
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
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {stats && (
          <>
            {/* Stat cards */}
            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
              className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4"
            >
              <StatCard icon={Zap} value={stats.totals.sessions} label="Total Sessions" color="amber" />
              <StatCard icon={Users} value={stats.totals.players} label="Total Players" color="emerald" />
              <StatCard icon={MessageSquare} value={stats.totals.questions} label="Questions Asked" color="sky" />
              <StatCard icon={Star} value={stats.totals.feedback} label="Feedback Received" color="violet" />
            </motion.div>

            {/* Daily chart */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="mb-8 rounded-xl border border-[#1A1A1A]/10 bg-white p-6 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp size={14} className="text-[#5A5A40]" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#1A1A1A]/60">
                  Last 7 Days
                </h2>
              </div>
              <DailyChart data={stats.daily} />
            </motion.div>
          </>
        )}

        {/* Feedback list */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="rounded-xl border border-[#1A1A1A]/10 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1A1A1A]/60">
            Recent Feedback ({feedback.length})
          </h2>
          {feedback.length === 0 ? (
            <p className="text-sm italic text-[#1A1A1A]/40" style={{ fontFamily: 'Georgia, serif' }}>
              No feedback yet.
            </p>
          ) : (
            <div className="space-y-3">
              {feedback.map(item => (
                <FeedbackRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, value, label, color }: {
  icon: typeof Users;
  value: number;
  label: string;
  color: 'amber' | 'emerald' | 'sky' | 'violet';
}) {
  const colorMap = {
    amber: 'from-amber-50 to-amber-100 border-amber-200 text-amber-700',
    emerald: 'from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-700',
    sky: 'from-sky-50 to-sky-100 border-sky-200 text-sky-700',
    violet: 'from-violet-50 to-violet-100 border-violet-200 text-violet-700',
  };

  return (
    <motion.div
      variants={fadeUp}
      className={`rounded-xl border bg-gradient-to-br p-4 ${colorMap[color]}`}
    >
      <Icon size={16} className="mb-2 opacity-60" />
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      <p className="text-[10px] uppercase tracking-wider opacity-60">{label}</p>
    </motion.div>
  );
}

function DailyChart({ data }: { data: DashboardStats['daily'] }) {
  const maxVal = Math.max(...data.flatMap(d => [d.sessions, d.players, d.questions]), 1);

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
          {data.map(day => {
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
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#5A5A40] to-[#5A5A40]/60 transition-all"
                      style={{ width: `${Math.min(100, barWidth)}%` }}
                    />
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

const FeedbackRow = React.memo(function FeedbackRow({ item }: { item: FeedbackItem }) {
  return (
    <div className="rounded-lg border border-[#1A1A1A]/5 p-4 transition-colors hover:bg-[#1A1A1A]/[0.02]">
      <div className="mb-2 flex items-start justify-between gap-4">
        <p className="flex-1 text-sm text-[#1A1A1A]" style={{ fontFamily: 'Georgia, serif' }}>
          "{item.text}"
        </p>
        {item.rating && (
          <span className="shrink-0 text-xs text-amber-600">
            {'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}
          </span>
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
      {item.questionText && (
        <p className="mt-1.5 text-xs italic text-[#1A1A1A]/30">Re: {item.questionText}</p>
      )}
    </div>
  );
});
