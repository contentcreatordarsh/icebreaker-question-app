import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useParams, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { useGameSocket } from '../hooks/useGameSocket';
import { useGameStatusAnnouncer } from '../hooks/useGameStatusAnnouncer';
import { QUESTION_BANK, pickQuestion, pickTopicQuestion } from '../data/questions';
import { TOPICS } from '../data/topics';
import { generateUniqueQuestion } from '../services/questionService';
import Lobby from '../components/game/Lobby';
import Timer from '../components/game/Timer';
import PlayerList from '../components/game/PlayerList';
import AnswerCard from '../components/game/AnswerCard';
import VotingCard from '../components/game/VotingCard';
import RecapCard from '../components/game/RecapCard';
import QuestionVote from '../components/game/QuestionVote';
import GameErrorBoundary from '../components/game/GameErrorBoundary';
import { cn } from '../lib/utils';
import type { Category, Difficulty } from '../types';

const ALL_CATEGORIES = Object.keys(QUESTION_BANK) as Category[];

/**
 * /host/:code — Host control panel for a live session.
 * The host picks questions, controls the timer, and reveals answers.
 * hostToken is passed via URL hash (not logged by servers).
 */
export default function HostSession() {
  const { code } = useParams<{ code: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // hostToken and hostName come from the create flow (via location.state)
  const state = location.state as { hostToken?: string; hostName?: string } | null;
  const hostToken = state?.hostToken || location.hash.slice(1); // fallback: read from hash
  const hostName = state?.hostName || 'Host';
  const roomCode = (code || '').toUpperCase();

  // Question picker state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'packs' | 'topics' | 'surprise' | 'custom'>('packs');
  const [difficulty, setDifficulty] = useState<Difficulty>('Light');
  const [selectedCategory, setSelectedCategory] = useState<Category>('Icebreaker');
  const [topicGroupId, setTopicGroupId] = useState<string>(TOPICS[0].id);
  const [customQuestion, setCustomQuestion] = useState('');
  const [timerSec, setTimerSec] = useState(180);
  const [usedQuestions, setUsedQuestions] = useState<Set<string>>(new Set());
  const [surpriseLoading, setSurpriseLoading] = useState(false);
  const [pickerError, setPickerError] = useState('');

  // ALL hooks must be called before any conditional return (React rules of hooks).
  // The `enabled` flag prevents the WebSocket from connecting until we have a hostToken.
  const { connectionStatus, gameState, error, actions } = useGameSocket({
    roomCode,
    playerName: hostName,
    hostToken: hostToken || undefined,
    enabled: !!roomCode && !!hostToken,
  });

  // Accessibility: phase-aware document title + screen-reader announcements.
  useGameStatusAnnouncer(gameState, { submitted: false });

  // Questions for the selected pack, filtered by the chosen depth.
  const categoryQuestions = useMemo(() => {
    const bank = QUESTION_BANK[selectedCategory];
    if (!bank) return [];
    if (difficulty === 'Light') return bank.Light || [];
    if (difficulty === 'Deep') return bank.Deep || [];
    return [...(bank.Light || []), ...(bank.Deep || [])]; // Random/Surprise mix
  }, [selectedCategory, difficulty]);

  const activeTopicGroup = useMemo(
    () => TOPICS.find(g => g.id === topicGroupId) ?? TOPICS[0],
    [topicGroupId],
  );

  const handleStartQuestion = useCallback((text: string, category?: string) => {
    actions.startQuestion(text, timerSec, category);
    setUsedQuestions(prev => new Set(prev).add(text));
    setShowPicker(false);
    setCustomQuestion('');
    setPickerError('');
  }, [actions, timerSec]);

  // Pick a random question from the selected pack at the chosen depth.
  const handleRandomFromPack = useCallback(() => {
    const q = pickQuestion(selectedCategory, difficulty);
    handleStartQuestion(q.text, selectedCategory);
  }, [selectedCategory, difficulty, handleStartQuestion]);

  // Pick a random question from a topic sub-pool (e.g. "sports.football").
  const handleTopicQuestion = useCallback((leafId: string, label: string) => {
    const q = pickTopicQuestion(leafId, difficulty);
    handleStartQuestion(q.text, `Topic: ${label}`);
  }, [difficulty, handleStartQuestion]);

  // Generate a fresh AI question ("Surprise Me").
  const handleSurprise = useCallback(async () => {
    setSurpriseLoading(true);
    setPickerError('');
    try {
      const q = await generateUniqueQuestion(selectedCategory, difficulty);
      if (q.text) handleStartQuestion(q.text, `Surprise: ${selectedCategory}`);
      else setPickerError('Could not generate a question. Try a pack instead.');
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : 'Could not generate a question.');
    } finally {
      setSurpriseLoading(false);
    }
  }, [selectedCategory, difficulty, handleStartQuestion]);

  // ── Host-as-player: the host answers and votes like everyone else ──────────
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Reset the host's answer state whenever a new question starts.
  const questionRef = useRef(gameState.currentQuestion?.text);
  useEffect(() => {
    if (gameState.currentQuestion?.text && gameState.currentQuestion.text !== questionRef.current) {
      setAnswer('');
      setSubmitted(false);
      questionRef.current = gameState.currentQuestion.text;
    }
  }, [gameState.currentQuestion?.text]);

  const handleHostSubmit = useCallback(() => {
    const t = answer.trim();
    if (!t) return;
    actions.submitAnswer(t);
    setSubmitted(true);
  }, [answer, actions]);

  const hostAnswered = submitted || gameState.answeredPlayerIds.has(gameState.playerId);

  const handleEndAndLeave = useCallback(() => {
    actions.endSession();
    setTimeout(() => navigate('/'), 500);
  }, [actions, navigate]);

  // Redirect home if no hostToken (placed after all hooks)
  if (!hostToken) {
    return <Navigate to="/" replace />;
  }

  // ── Loading / Error ────────────────────────────────────────────────────────

  if (connectionStatus === 'connecting') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F0]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[#1A1A1A]/10 border-t-[#5A5A40]" />
          <p className="text-sm text-[#1A1A1A]/50" style={{ fontFamily: 'Georgia, serif' }}>
            Connecting as host...
          </p>
        </div>
      </div>
    );
  }

  if (connectionStatus === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F5F0] px-6">
        <p className="mb-2 text-4xl">😔</p>
        <h2 className="mb-3 text-2xl font-light italic text-[#1A1A1A]" style={{ fontFamily: 'Georgia, serif' }}>
          Connection Lost
        </h2>
        <p className="mb-6 text-sm text-[#1A1A1A]/50">{error || 'Unable to reconnect to the session.'}</p>
        <a href="/" className="inline-block rounded-full bg-[#5A5A40] px-6 py-2.5 text-xs uppercase tracking-[0.3em] text-[#F5F2ED]">
          Back Home
        </a>
      </div>
    );
  }

  if (gameState.status === 'ended') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F5F0] px-6">
        <p className="mb-2 text-4xl">🎉</p>
        <h2 className="mb-3 text-2xl font-light italic text-[#1A1A1A]" style={{ fontFamily: 'Georgia, serif' }}>
          Great Session!
        </h2>
        <p className="mb-4 text-sm text-[#1A1A1A]/50">
          {gameState.currentQuestion?.index || 0} questions played with {gameState.players.length} players
        </p>

        {gameState.leaderboard.length > 0 && (
          <div className="mb-6 w-full max-w-sm">
            <p className="mb-2 text-center text-[10px] uppercase tracking-wider text-[#1A1A1A]/30">Final Standings</p>
            <div className="space-y-1">
              {gameState.leaderboard.slice(0, 5).map((entry, i) => (
                <div key={entry.playerId} className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2 text-sm">
                  <span>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}{' '}
                    {entry.avatar && <span className="mr-1">{entry.avatar}</span>}
                    {entry.name}
                  </span>
                  <span className="font-medium text-[#5A5A40]">{entry.score} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shareable recap card — host is most likely to post results to Reddit/X */}
        <div className="mb-8">
          <RecapCard
            questionsPlayed={gameState.currentQuestion?.index || 0}
            playerCount={gameState.players.length}
            leaderboard={gameState.leaderboard}
            roomCode={gameState.roomCode}
          />
        </div>

        <div className="flex flex-col items-center gap-3">
          <a href="/" className="inline-block rounded-full border border-[#1A1A1A]/10 px-6 py-2.5 text-xs uppercase tracking-[0.3em] text-[#1A1A1A]/60 transition-all hover:border-[#5A5A40]/30 hover:text-[#5A5A40]">
            Back Home
          </a>
        </div>
      </div>
    );
  }

  // ── Lobby — waiting for players + pick first question ──────────────────────

  if (gameState.status === 'lobby') {
    return (
      <div className="flex min-h-screen flex-col bg-[#F5F5F0]">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-[#1A1A1A]/5 px-4 py-3">
          <span className="text-xs uppercase tracking-wider text-[#1A1A1A]/30">
            Host View
          </span>
          <button
            onClick={handleEndAndLeave}
            className="text-xs uppercase tracking-wider text-red-500/60 transition-colors hover:text-red-600"
          >
            End Session
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
          {!showPicker ? (
            <Lobby
              roomCode={gameState.roomCode}
              players={gameState.players}
              currentPlayerId={gameState.playerId}
              isHost={true}
              onKick={actions.kick}
              onStart={() => setShowPicker(true)}
            />
          ) : (
            /* Question Picker — host chooses HOW the next question is sourced */
            <div className="w-full max-w-lg pb-10">
              <button
                onClick={() => setShowPicker(false)}
                className="mb-4 text-xs uppercase tracking-wider text-[#1A1A1A]/40 transition-colors hover:text-[#1A1A1A]/60"
              >
                &larr; Back to lobby
              </button>

              <h2 className="text-2xl font-light italic text-[#1A1A1A]" style={{ fontFamily: 'Georgia, serif' }}>
                Choose a question
              </h2>
              <p className="mb-5 mt-1 text-sm text-[#1A1A1A]/45" style={{ fontFamily: 'Georgia, serif' }}>
                Everyone — including you — answers the one you pick.
              </p>

              {/* Depth — clarifies the Light vs Deep distinction in plain language */}
              <div className="mb-5">
                <label className="mb-1.5 block text-[10px] uppercase tracking-[0.2em] text-[#1A1A1A]/40">Depth</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['Light', '☀️ Light', 'Playful & easy'],
                    ['Deep', '🌙 Deep', 'Meaningful & reflective'],
                    ['Random', '🎲 Mix', 'A blend of both'],
                  ] as [Difficulty, string, string][]).map(([d, label, hint]) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={cn(
                        'rounded-xl border px-2 py-2.5 text-center transition-all',
                        difficulty === d
                          ? 'border-[#5A5A40] bg-[#5A5A40]/10 text-[#5A5A40]'
                          : 'border-[#1A1A1A]/10 bg-white text-[#1A1A1A]/55 hover:border-[#5A5A40]/30',
                      )}
                    >
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="mt-0.5 block text-[10px] leading-tight opacity-70">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Timer */}
              <div className="mb-5">
                <label className="mb-1.5 block text-[10px] uppercase tracking-[0.2em] text-[#1A1A1A]/40">Answer timer</label>
                <div className="flex gap-2">
                  {[60, 120, 180, 300].map(sec => (
                    <button
                      key={sec}
                      onClick={() => setTimerSec(sec)}
                      className={cn(
                        'flex-1 rounded-full py-2 text-xs transition-all',
                        timerSec === sec ? 'bg-[#5A5A40] text-[#F5F2ED]' : 'bg-[#1A1A1A]/5 text-[#1A1A1A]/50 hover:bg-[#1A1A1A]/10',
                      )}
                    >
                      {sec < 60 ? `${sec}s` : `${sec / 60}m`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source mode — Packs / Topics / Surprise / Custom */}
              <div className="mb-4 grid grid-cols-4 gap-2">
                {([
                  ['packs', '📚', 'Packs'],
                  ['topics', '🌍', 'Topics'],
                  ['surprise', '✨', 'Surprise'],
                  ['custom', '✍️', 'Custom'],
                ] as ['packs' | 'topics' | 'surprise' | 'custom', string, string][]).map(([mode, icon, label]) => (
                  <button
                    key={mode}
                    onClick={() => { setPickerMode(mode); setPickerError(''); }}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border px-1 py-3 transition-all',
                      pickerMode === mode
                        ? 'border-[#1A1A1A] bg-[#1A1A1A] text-[#F5F2ED]'
                        : 'border-[#1A1A1A]/10 bg-white text-[#1A1A1A]/55 hover:border-[#1A1A1A]/30',
                    )}
                  >
                    <span className="text-lg leading-none">{icon}</span>
                    <span className="text-[10px] uppercase tracking-wider">{label}</span>
                  </button>
                ))}
              </div>

              {pickerError && (
                <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600">{pickerError}</p>
              )}

              {/* ── Packs ─────────────────────────────────────────────── */}
              {pickerMode === 'packs' && (
                <div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {ALL_CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={cn(
                          'rounded-full px-3 py-1.5 text-xs transition-all',
                          selectedCategory === cat ? 'bg-[#1A1A1A] text-[#F5F2ED]' : 'bg-[#1A1A1A]/5 text-[#1A1A1A]/55 hover:bg-[#1A1A1A]/10',
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleRandomFromPack}
                    className="mb-3 w-full rounded-full bg-[#5A5A40] py-3 text-xs uppercase tracking-[0.2em] text-[#F5F2ED] shadow-md transition-all hover:bg-[#4A4A34] active:scale-[0.98]"
                  >
                    🎲 Start a random {selectedCategory} question
                  </button>
                  <p className="mb-2 text-[10px] uppercase tracking-wider text-[#1A1A1A]/35">Or pick one ({categoryQuestions.length})</p>
                  <div className="max-h-52 overflow-y-auto rounded-xl border border-[#1A1A1A]/10 bg-white">
                    {categoryQuestions.map(q => {
                      const isUsed = usedQuestions.has(q);
                      return (
                        <button
                          key={q}
                          onClick={() => handleStartQuestion(q, selectedCategory)}
                          disabled={isUsed}
                          className={cn(
                            'block w-full border-b border-[#1A1A1A]/5 px-4 py-3 text-left text-sm transition-colors last:border-b-0',
                            isUsed ? 'cursor-not-allowed bg-[#1A1A1A]/5 text-[#1A1A1A]/30 line-through' : 'text-[#1A1A1A]/75 hover:bg-[#F5F2ED]',
                          )}
                          style={{ fontFamily: 'Georgia, serif' }}
                        >
                          {q}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Topics ────────────────────────────────────────────── */}
              {pickerMode === 'topics' && (
                <div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {TOPICS.map(g => (
                      <button
                        key={g.id}
                        onClick={() => setTopicGroupId(g.id)}
                        className={cn(
                          'rounded-full px-3 py-1.5 text-xs transition-all',
                          topicGroupId === g.id ? 'bg-[#1A1A1A] text-[#F5F2ED]' : 'bg-[#1A1A1A]/5 text-[#1A1A1A]/55 hover:bg-[#1A1A1A]/10',
                        )}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                  <p className="mb-2 text-[10px] uppercase tracking-wider text-[#1A1A1A]/35">Tap a topic to start a random question about it</p>
                  <div className="grid grid-cols-2 gap-2">
                    {activeTopicGroup.children.map(leaf => (
                      <button
                        key={leaf.id}
                        onClick={() => handleTopicQuestion(leaf.id, leaf.label)}
                        className="rounded-xl border border-[#1A1A1A]/10 bg-white px-4 py-4 text-center text-sm text-[#1A1A1A]/75 shadow-sm transition-all hover:border-[#5A5A40]/40 hover:bg-[#F5F2ED] active:scale-[0.98]"
                        style={{ fontFamily: 'Georgia, serif' }}
                      >
                        {leaf.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Surprise Me (AI) ──────────────────────────────────── */}
              {pickerMode === 'surprise' && (
                <div>
                  <p className="mb-3 text-sm text-[#1A1A1A]/55" style={{ fontFamily: 'Georgia, serif' }}>
                    AI writes a fresh question in your chosen pack &amp; depth — no repeats.
                  </p>
                  <div className="mb-4 flex flex-wrap gap-2">
                    {ALL_CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={cn(
                          'rounded-full px-3 py-1.5 text-xs transition-all',
                          selectedCategory === cat ? 'bg-[#1A1A1A] text-[#F5F2ED]' : 'bg-[#1A1A1A]/5 text-[#1A1A1A]/55 hover:bg-[#1A1A1A]/10',
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleSurprise}
                    disabled={surpriseLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-[#5A5A40] py-3.5 text-xs uppercase tracking-[0.2em] text-[#F5F2ED] shadow-md transition-all hover:bg-[#4A4A34] active:scale-[0.98] disabled:opacity-50"
                  >
                    {surpriseLoading ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#F5F2ED]/40 border-t-[#F5F2ED]" />
                        Generating…
                      </>
                    ) : (
                      <>✨ Generate &amp; start a {selectedCategory} question</>
                    )}
                  </button>
                </div>
              )}

              {/* ── Custom ────────────────────────────────────────────── */}
              {pickerMode === 'custom' && (
                <div className="rounded-xl border border-[#1A1A1A]/10 bg-white p-4">
                  <textarea
                    value={customQuestion}
                    onChange={e => setCustomQuestion(e.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="Type your own question…"
                    autoFocus
                    className="mb-3 w-full resize-none rounded-lg border border-[#1A1A1A]/10 p-3 text-sm text-[#1A1A1A] outline-none placeholder:text-[#1A1A1A]/20 focus:border-[#5A5A40]"
                    style={{ fontFamily: 'Georgia, serif' }}
                  />
                  <button
                    onClick={() => handleStartQuestion(customQuestion.trim(), 'Custom')}
                    disabled={!customQuestion.trim()}
                    className={cn(
                      'w-full rounded-full py-3 text-xs uppercase tracking-[0.2em] transition-all',
                      'bg-[#5A5A40] text-[#F5F2ED] hover:bg-[#4A4A34] active:scale-[0.98]',
                      'disabled:cursor-not-allowed disabled:opacity-40',
                    )}
                  >
                    Start with my question
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Writing Phase — host sees who has answered ─────────────────────────────

  if (gameState.status === 'writing') {
    const totalPlayers = gameState.players.length;
    const answered = gameState.answeredPlayerIds.size;

    return (
      <div className="flex min-h-screen flex-col bg-[#F5F5F0]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1A1A1A]/5 px-4 py-3">
          <span className="text-xs uppercase tracking-wider text-[#1A1A1A]/30">
            Question {gameState.currentQuestion?.index}
          </span>
          <Timer timerEndsAt={gameState.timerEndsAt} />
        </div>

        {/* Question */}
        <div className="border-b border-[#1A1A1A]/5 bg-white/50 px-6 py-6">
          <h2
            className="text-center text-2xl font-light italic leading-relaxed text-[#1A1A1A] sm:text-3xl"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {gameState.currentQuestion?.text}
          </h2>
        </div>

        {/* Status */}
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
          {/* Host's own answer — the host plays too */}
          <div className="mb-8 w-full max-w-md">
            {hostAnswered ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-center">
                <p className="flex items-center justify-center gap-2 text-sm font-medium text-emerald-700">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Your answer is in
                </p>
              </div>
            ) : (
              <>
                <label htmlFor="host-answer" className="mb-2 block text-center text-xs uppercase tracking-wider text-[#5A5A40]">
                  Your answer
                </label>
                <textarea
                  id="host-answer"
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  onKeyDown={e => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleHostSubmit(); }
                  }}
                  maxLength={500}
                  rows={2}
                  placeholder="Answer your own question..."
                  className="w-full resize-none rounded-xl border-2 border-[#1A1A1A]/10 bg-white p-3 text-[#1A1A1A] shadow-sm outline-none transition-all placeholder:text-[#1A1A1A]/20 focus:border-[#5A5A40] focus:ring-2 focus:ring-[#5A5A40]/20"
                  style={{ fontFamily: 'Georgia, serif' }}
                />
                <button
                  onClick={handleHostSubmit}
                  disabled={!answer.trim()}
                  className={cn(
                    'mt-2 w-full rounded-full py-2.5 text-xs uppercase tracking-[0.3em] shadow-md transition-all',
                    'bg-[#5A5A40] text-[#F5F2ED] hover:bg-[#4A4A34] active:scale-[0.98]',
                    'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none',
                  )}
                >
                  Submit Answer
                </button>
              </>
            )}
          </div>

          <div className="mb-6 text-center">
            <p className="text-5xl font-light text-[#1A1A1A]">
              {answered} / {totalPlayers}
            </p>
            <p className="mt-2 text-sm text-[#1A1A1A]/40" style={{ fontFamily: 'Georgia, serif' }}>
              answers received
            </p>
          </div>

          <PlayerList
            players={gameState.players}
            answeredPlayerIds={gameState.answeredPlayerIds}
            currentPlayerId={gameState.playerId}
            isHost={true}
            onKick={actions.kick}
          />

          {/* Skip to reveal early */}
          {answered > 0 && (
            <button
              onClick={() => {
                // Force transition to revealing by starting reveal
                actions.revealNext();
              }}
              className="mt-8 rounded-full border border-[#1A1A1A]/10 px-6 py-2.5 text-xs uppercase tracking-wider text-[#1A1A1A]/50 transition-all hover:bg-[#1A1A1A]/5"
            >
              Start Revealing ({answered} answers)
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Revealing Phase — host controls reveals ────────────────────────────────

  const allRevealed = gameState.revealIndex >= gameState.totalAnswers;

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F5F0]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1A1A1A]/5 px-4 py-3">
        <span className="text-xs uppercase tracking-wider text-[#1A1A1A]/30">
          Revealing Answers
        </span>
        <span className="text-xs text-[#1A1A1A]/30">
          {gameState.revealIndex} / {gameState.totalAnswers}
        </span>
      </div>

      {/* Question reminder + vote */}
      <div className="border-b border-[#1A1A1A]/5 bg-white/50 px-6 py-4">
        <p
          className="text-center text-lg italic text-[#1A1A1A]/70"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          {gameState.currentQuestion?.text}
        </p>
        {gameState.currentQuestion?.text && (
          <div className="mt-2 flex justify-center">
            <QuestionVote questionText={gameState.currentQuestion.text} />
          </div>
        )}
      </div>

      {/* Revealed answers — votable for the host during the voting phase */}
      <div className="flex-1 px-6 py-6">
        <div className="mx-auto max-w-lg space-y-4">
          {gameState.status === 'voting' && (
            <p className="mb-1 text-center text-sm text-amber-600">
              {gameState.hasVoted ? '✓ Vote cast! You can end voting when ready.' : '🗳️ Tap an answer to cast your vote'}
            </p>
          )}
          <GameErrorBoundary fallbackMessage="Could not display answers.">
            {gameState.revealedAnswers.map((ans, i) =>
              gameState.status === 'voting' ? (
                <VotingCard
                  key={ans.playerId}
                  answer={ans}
                  voteCount={gameState.votes[ans.playerId] || 0}
                  hasVoted={gameState.hasVoted}
                  isSelf={ans.playerId === gameState.playerId}
                  onVote={() => actions.castVote(ans.playerId)}
                />
              ) : (
                <AnswerCard
                  key={ans.playerId}
                  answer={ans}
                  index={i}
                  isNew={i === gameState.revealedAnswers.length - 1}
                />
              ),
            )}
          </GameErrorBoundary>

          {gameState.revealedAnswers.length === 0 && (
            <p className="text-center text-sm italic text-[#1A1A1A]/40" style={{ fontFamily: 'Georgia, serif' }}>
              Tap "Reveal Next" to show the first answer
            </p>
          )}
        </div>
      </div>

      {/* Host controls */}
      <div className="sticky bottom-0 border-t border-[#1A1A1A]/5 bg-[#F5F5F0] px-4 py-4">
        <div className="mx-auto flex max-w-lg gap-3">
          {!allRevealed ? (
            <>
              <button
                onClick={actions.revealNext}
                className="flex-1 rounded-full bg-[#5A5A40] py-3 text-xs uppercase tracking-[0.2em] text-[#F5F2ED] shadow-md transition-all hover:bg-[#4A4A34] active:scale-[0.98]"
              >
                Reveal Next
              </button>
              <button
                onClick={actions.revealAll}
                className="rounded-full border border-[#1A1A1A]/10 px-4 py-3 text-xs uppercase tracking-wider text-[#1A1A1A]/50 transition-all hover:bg-[#1A1A1A]/5"
              >
                Reveal All
              </button>
            </>
          ) : gameState.votingOpen ? (
            <>
              <button
                onClick={actions.endVoting}
                className="flex-1 rounded-full bg-[#5A5A40] py-3 text-xs uppercase tracking-[0.2em] text-[#F5F2ED] shadow-md transition-all hover:bg-[#4A4A34] active:scale-[0.98]"
              >
                End Voting & Score
              </button>
            </>
          ) : (
            <>
              <button
                onClick={actions.startVoting}
                className="flex-1 rounded-full bg-amber-500 py-3 text-xs uppercase tracking-[0.2em] text-white shadow-md transition-all hover:bg-amber-600 active:scale-[0.98]"
              >
                🗳️ Start Voting
              </button>
              <button
                onClick={() => {
                  setShowPicker(false);
                  actions.nextQuestion();
                }}
                className="rounded-full border border-[#1A1A1A]/10 px-4 py-3 text-xs uppercase tracking-wider text-[#1A1A1A]/50 transition-all hover:bg-[#1A1A1A]/5"
              >
                Skip → Next
              </button>
              <button
                onClick={handleEndAndLeave}
                className="rounded-full border border-red-200 px-4 py-3 text-xs uppercase tracking-wider text-red-500/60 transition-all hover:bg-red-50"
              >
                End
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
