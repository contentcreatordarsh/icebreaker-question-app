import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { ChevronLeft, Clock, Users, MessageSquare, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { auth, authedGet } from '../lib/firebase';
import { fadeUp, staggerContainer } from '../lib/animations';

interface SessionRecord {
  roomCode: string;
  playerCount: number;
  questionsPlayed: number;
  createdAt: string | null;
  status: string;
}

/**
 * /sessions — Session history for hosts.
 * Shows past sessions with player count, questions played, and timestamps.
 */
export default function SessionHistory() {
  const [user, loadingAuth] = useAuthState(auth);
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loadingAuth) return;
    if (!user) {
      navigate('/');
      return;
    }
    loadHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadingAuth]);

  async function loadHistory() {
    setLoading(true);
    setError(null);
    try {
      const res = await authedGet('/api/sessions/history');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json() as { sessions: SessionRecord[] };
      setSessions(data.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session history');
    } finally {
      setLoading(false);
    }
  }

  if (loadingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F0]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1A1A1A]/10 border-t-[#5A5A40]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      {/* Header */}
      <header className="border-b border-[#1A1A1A]/10 bg-white/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link to="/account" className="text-[#1A1A1A]/40 transition-colors hover:text-[#1A1A1A]/70">
              <ChevronLeft size={18} />
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-[#1A1A1A]" style={{ fontFamily: 'Georgia, serif' }}>
                Session History
              </h1>
              <p className="text-[10px] uppercase tracking-[0.3em] text-[#1A1A1A]/30">
                Your past game sessions
              </p>
            </div>
          </div>
          <button
            onClick={loadHistory}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-[#1A1A1A]/10 px-3 py-2 text-xs uppercase tracking-wider text-[#1A1A1A]/60 transition-all hover:bg-white hover:shadow-sm disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && sessions.length === 0 ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1A1A1A]/10 border-t-[#5A5A40]" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-12 text-center">
            <p className="mb-2 text-4xl">🎲</p>
            <p className="text-sm italic text-[#1A1A1A]/40" style={{ fontFamily: 'Georgia, serif' }}>
              No sessions yet. Host your first game to see it here!
            </p>
            <Link
              to="/"
              className="mt-4 inline-block rounded-full bg-[#5A5A40] px-6 py-2.5 text-xs uppercase tracking-[0.3em] text-[#F5F2ED] transition-all hover:bg-[#4A4A34]"
            >
              Start a Session
            </Link>
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="space-y-3"
          >
            {sessions.map(session => (
              <motion.div
                key={session.roomCode}
                variants={fadeUp}
                className="rounded-xl border border-[#1A1A1A]/10 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#5A5A40]/10">
                      <span className="text-xs font-bold text-[#5A5A40]" style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {session.roomCode}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-3 text-sm text-[#1A1A1A]">
                        <span className="flex items-center gap-1">
                          <Users size={12} className="opacity-40" />
                          {session.playerCount} players
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare size={12} className="opacity-40" />
                          {session.questionsPlayed} questions
                        </span>
                      </div>
                      {session.createdAt && (
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[#1A1A1A]/40">
                          <Clock size={10} />
                          {new Date(session.createdAt).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider ${
                    session.status === 'ended'
                      ? 'bg-[#1A1A1A]/5 text-[#1A1A1A]/40'
                      : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    {session.status === 'ended' ? 'Completed' : 'Active'}
                  </span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </main>
    </div>
  );
}
