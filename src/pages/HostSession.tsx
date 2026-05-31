import { useState, useCallback, useMemo } from 'react';
import { useParams, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { useGameSocket } from '../hooks/useGameSocket';
import { QUESTION_BANK } from '../data/questions';
import Lobby from '../components/game/Lobby';
import Timer from '../components/game/Timer';
import PlayerList from '../components/game/PlayerList';
import AnswerCard from '../components/game/AnswerCard';
import ShareResults from '../components/game/ShareResults';
import QuestionVote from '../components/game/QuestionVote';
import { cn } from '../lib/utils';
import type { Category } from '../types';

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
  const [selectedCategory, setSelectedCategory] = useState<Category>('Icebreaker');
  const [customQuestion, setCustomQuestion] = useState('');
  const [timerSec, setTimerSec] = useState(180);
  const [usedQuestions, setUsedQuestions] = useState<Set<string>>(new Set());

  // ALL hooks must be called before any conditional return (React rules of hooks).
  // The `enabled` flag prevents the WebSocket from connecting until we have a hostToken.
  const { connectionStatus, gameState, error, actions } = useGameSocket({
    roomCode,
    playerName: hostName,
    hostToken: hostToken || undefined,
    enabled: !!roomCode && !!hostToken,
  });

  // Build question list for the selected category
  const categoryQuestions = useMemo(() => {
    const bank = QUESTION_BANK[selectedCategory];
    if (!bank) return [];
    return [...(bank.Light || []), ...(bank.Deep || [])];
  }, [selectedCategory]);

  const handleStartQuestion = useCallback((text: string) => {
    actions.startQuestion(text, timerSec);
    setUsedQuestions(prev => new Set(prev).add(text));
    setShowPicker(false);
    setCustomQuestion('');
  }, [actions, timerSec]);

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

        <div className="flex flex-col items-center gap-3">
          <a href="/" className="inline-block rounded-full bg-[#5A5A40] px-6 py-2.5 text-xs uppercase tracking-[0.3em] text-[#F5F2ED] transition-all hover:bg-[#4A4A34]">
            Back Home
          </a>
          <ShareResults
            questionsPlayed={gameState.currentQuestion?.index || 0}
            playerCount={gameState.players.length}
            leaderboard={gameState.leaderboard}
            roomCode={gameState.roomCode}
          />
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
            /* Question Picker */
            <div className="w-full max-w-lg">
              <button
                onClick={() => setShowPicker(false)}
                className="mb-6 text-xs uppercase tracking-wider text-[#1A1A1A]/40 transition-colors hover:text-[#1A1A1A]/60"
              >
                &larr; Back to lobby
              </button>

              <h2
                className="mb-6 text-xl font-light italic text-[#1A1A1A]"
                style={{ fontFamily: 'Georgia, serif' }}
              >
                Pick a Question
              </h2>

              {/* Timer setting */}
              <div className="mb-6">
                <label className="mb-2 block text-xs uppercase tracking-wider text-[#1A1A1A]/40">
                  Timer (seconds)
                </label>
                <div className="flex gap-2">
                  {[60, 120, 180, 300].map(sec => (
                    <button
                      key={sec}
                      onClick={() => setTimerSec(sec)}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-xs transition-all',
                        timerSec === sec
                          ? 'bg-[#5A5A40] text-[#F5F2ED]'
                          : 'bg-[#1A1A1A]/5 text-[#1A1A1A]/50 hover:bg-[#1A1A1A]/10',
                      )}
                    >
                      {sec < 60 ? `${sec}s` : `${sec / 60}m`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category tabs */}
              <div className="mb-4 flex flex-wrap gap-2">
                {ALL_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs transition-all',
                      selectedCategory === cat
                        ? 'bg-[#1A1A1A] text-[#F5F2ED]'
                        : 'bg-[#1A1A1A]/5 text-[#1A1A1A]/50 hover:bg-[#1A1A1A]/10',
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Question list */}
              <div className="mb-6 max-h-60 overflow-y-auto rounded-xl border border-[#1A1A1A]/5 bg-white">
                {categoryQuestions.map((q, i) => {
                  const isUsed = usedQuestions.has(q);
                  return (
                    <button
                      key={i}
                      onClick={() => handleStartQuestion(q)}
                      disabled={isUsed}
                      className={cn(
                        'block w-full border-b border-[#1A1A1A]/5 px-4 py-3 text-left text-sm transition-colors last:border-b-0',
                        isUsed
                          ? 'cursor-not-allowed bg-[#1A1A1A]/5 text-[#1A1A1A]/30 line-through'
                          : 'text-[#1A1A1A]/70 hover:bg-[#F5F2ED]',
                      )}
                      style={{ fontFamily: 'Georgia, serif' }}
                    >
                      {q}
                    </button>
                  );
                })}
              </div>

              {/* Custom question */}
              <div className="rounded-xl border border-[#1A1A1A]/10 bg-white p-4">
                <p className="mb-2 text-xs uppercase tracking-wider text-[#1A1A1A]/40">
                  Or write your own
                </p>
                <textarea
                  value={customQuestion}
                  onChange={e => setCustomQuestion(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="Type a custom question..."
                  className="mb-3 w-full resize-none rounded-lg border border-[#1A1A1A]/10 p-3 text-sm text-[#1A1A1A] outline-none placeholder:text-[#1A1A1A]/20 focus:border-[#5A5A40]"
                  style={{ fontFamily: 'Georgia, serif' }}
                />
                <button
                  onClick={() => handleStartQuestion(customQuestion.trim())}
                  disabled={!customQuestion.trim()}
                  className={cn(
                    'w-full rounded-full py-2.5 text-xs uppercase tracking-[0.2em] transition-all',
                    'bg-[#5A5A40] text-[#F5F2ED] hover:bg-[#4A4A34]',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                  )}
                >
                  Start with Custom Question
                </button>
              </div>
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

      {/* Revealed answers */}
      <div className="flex-1 px-6 py-6">
        <div className="mx-auto max-w-lg space-y-4">
          {gameState.revealedAnswers.map((ans, i) => (
            <AnswerCard
              key={ans.playerId}
              answer={ans}
              index={i}
              isNew={i === gameState.revealedAnswers.length - 1}
            />
          ))}

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
