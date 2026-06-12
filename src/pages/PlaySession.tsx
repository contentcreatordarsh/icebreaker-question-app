import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useGameSocket } from '../hooks/useGameSocket';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { useGameStatusAnnouncer } from '../hooks/useGameStatusAnnouncer';
import Lobby from '../components/game/Lobby';
import Timer from '../components/game/Timer';
import PlayerList from '../components/game/PlayerList';
import AnswerCard from '../components/game/AnswerCard';
import VotingCard from '../components/game/VotingCard';
import Leaderboard from '../components/game/Leaderboard';
import AvatarPicker, { getDefaultAvatar } from '../components/game/AvatarPicker';
import FeedbackModal from '../components/FeedbackModal';
import RecapCard from '../components/game/RecapCard';
import QuestionVote from '../components/game/QuestionVote';
import SoundToggle from '../components/game/SoundToggle';
import GameErrorBoundary from '../components/game/GameErrorBoundary';
import { cn } from '../lib/utils';
import type { PlayerGender } from '../types';

/**
 * /play/:code — Player session view. Connects via WebSocket.
 * No Firebase auth required — guests play with just a display name.
 *
 * If the user arrived via a direct link (no playerName in router state),
 * we show a name prompt inline instead of redirecting away.
 */
export default function PlaySession() {
  const { code } = useParams<{ code: string }>();
  const location = useLocation();
  const locState = location.state as { playerName?: string; gender?: PlayerGender; avatar?: string } | null;
  const statePlayerName = locState?.playerName;

  const [nameInput, setNameInput] = useState('');
  const [confirmedName, setConfirmedName] = useState(statePlayerName || '');
  const [gender, setGender] = useState<PlayerGender>(locState?.gender || 'male');
  const [avatar, setAvatar] = useState(locState?.avatar || getDefaultAvatar('male'));
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const roomCode = (code || '').toUpperCase();
  const playerName = confirmedName;

  const { play: playSound, toggleMute, getMuted } = useSoundEffects();

  // ALL hooks must be called before any conditional return (React rules of hooks).
  // The `enabled` flag prevents the WebSocket from connecting until we have a name.
  const { connectionStatus, gameState, error, actions } = useGameSocket({
    roomCode,
    playerName: playerName || 'pending', // placeholder — won't connect while enabled=false
    gender,
    avatar,
    enabled: !!roomCode && !!playerName,
  });

  // Reset answer state when a new question starts
  const questionRef = useRef(gameState.currentQuestion?.text);
  useEffect(() => {
    if (gameState.currentQuestion?.text && gameState.currentQuestion.text !== questionRef.current) {
      setAnswer('');
      setSubmitted(false);
      questionRef.current = gameState.currentQuestion.text;
    }
  }, [gameState.currentQuestion?.text]);

  // Sound effects on state transitions (skip initial mount)
  const mountedRef = useRef(false);
  const prevStatusRef = useRef(gameState.status);
  const prevRevealCountRef = useRef(gameState.revealedAnswers.length);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (prevStatusRef.current !== gameState.status) {
      if (gameState.status === 'revealing') playSound('reveal');
      if (gameState.status === 'ended') playSound('win');
      prevStatusRef.current = gameState.status;
    }
    if (gameState.revealedAnswers.length > prevRevealCountRef.current) {
      playSound('reveal');
    }
    prevRevealCountRef.current = gameState.revealedAnswers.length;
  }, [gameState.status, gameState.revealedAnswers.length, playSound]);

  // Accessibility: phase-aware document title + screen-reader announcements.
  useGameStatusAnnouncer(gameState, { submitted });

  const handleSubmit = useCallback(() => {
    const trimmed = answer.trim();
    if (!trimmed) return;
    actions.submitAnswer(trimmed);
    setSubmitted(true);
    playSound('submit');
  }, [answer, actions, playSound]);

  // ── Name prompt (shown when arrived via direct link) ───────────────────────

  if (!playerName) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F5F0] px-6 py-12">
        <p className="mb-3 text-[10px] uppercase tracking-[0.4em] text-[#1A1A1A]/30">
          Dinner Table Cards
        </p>
        <h1
          className="mb-2 text-3xl font-light italic text-[#1A1A1A] sm:text-4xl"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          Join Session
        </h1>
        <div className="mb-6 flex gap-2">
          {roomCode.split('').map((char, i) => (
            <span
              key={i}
              className="flex h-12 w-10 items-center justify-center rounded-lg bg-[#1A1A1A] text-xl font-bold tracking-wider text-[#F5F2ED] shadow-sm"
              style={{ fontFamily: 'ui-monospace, monospace' }}
            >
              {char}
            </span>
          ))}
        </div>
        <p
          className="mb-6 text-sm text-[#1A1A1A]/50"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          Enter your name to join
        </p>

        <div className="mb-4 w-full max-w-xs">
          <label htmlFor="join-name" className="sr-only">Your Name</label>
          <input
            id="join-name"
            type="text"
            maxLength={30}
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && nameInput.trim()) {
                setConfirmedName(nameInput.trim());
              }
            }}
            placeholder="Your name"
            autoFocus
            className="w-full rounded-lg border-2 border-[#1A1A1A]/10 bg-white px-4 py-3 text-center text-[#1A1A1A] shadow-sm outline-none transition-all placeholder:text-[#1A1A1A]/20 focus:border-[#5A5A40] focus:ring-2 focus:ring-[#5A5A40]/20"
            style={{ fontFamily: 'Georgia, serif' }}
          />
        </div>

        {/* Avatar picker */}
        <div className="mb-6 w-full max-w-xs">
          <AvatarPicker
            selectedGender={gender}
            selectedAvatar={avatar}
            onGenderChange={setGender}
            onAvatarChange={setAvatar}
          />
        </div>

        <button
          onClick={() => {
            if (nameInput.trim()) setConfirmedName(nameInput.trim());
          }}
          disabled={!nameInput.trim()}
          className={cn(
            'rounded-full px-10 py-3.5 text-xs uppercase tracking-[0.3em] shadow-md transition-all',
            'bg-[#5A5A40] text-[#F5F2ED] hover:bg-[#4A4A34] hover:shadow-lg active:scale-[0.98]',
            'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none',
          )}
        >
          Join
        </button>

        <a
          href="/"
          className="mt-8 text-xs uppercase tracking-wider text-[#1A1A1A]/30 transition-colors hover:text-[#1A1A1A]/60"
        >
          Back to Dinner Table Cards
        </a>
      </div>
    );
  }

  // ── Loading / Error states ─────────────────────────────────────────────────

  if (connectionStatus === 'connecting') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F0]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[#1A1A1A]/10 border-t-[#5A5A40]" />
          <p className="text-sm text-[#1A1A1A]/50" style={{ fontFamily: 'Georgia, serif' }}>
            Connecting to session...
          </p>
        </div>
      </div>
    );
  }

  if (connectionStatus === 'error' || gameState.status === 'ended') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F5F0] px-6">
        <div className="text-center">
          <p className="mb-2 text-4xl">
            {gameState.status === 'ended' ? '🎉' : '😔'}
          </p>
          <h2
            className="mb-3 text-2xl font-light italic text-[#1A1A1A]"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {gameState.status === 'ended' ? 'Session Over' : 'Connection Lost'}
          </h2>
          <p className="mb-6 text-sm text-[#1A1A1A]/50">
            {error || (gameState.status === 'ended' ? 'Thanks for playing!' : 'Unable to reconnect.')}
          </p>

          {/* Leaderboard on session end */}
          {gameState.status === 'ended' && gameState.leaderboard.length > 0 && (
            <div className="mb-6">
              <GameErrorBoundary fallbackMessage="Could not display leaderboard.">
                <Leaderboard entries={gameState.leaderboard} currentPlayerId={gameState.playerId} />
              </GameErrorBoundary>
            </div>
          )}

          {/* Shareable recap card — the viral memento with the join URL baked in */}
          {gameState.status === 'ended' && (
            <div className="mb-8">
              <GameErrorBoundary fallbackMessage="Could not generate the recap card.">
                <RecapCard
                  questionsPlayed={gameState.currentQuestion?.index || 0}
                  playerCount={gameState.players.length}
                  leaderboard={gameState.leaderboard}
                  roomCode={gameState.roomCode}
                />
              </GameErrorBoundary>
            </div>
          )}

          <div className="flex flex-col items-center gap-3">
            <a
              href="/play"
              className="inline-block rounded-full border border-[#1A1A1A]/10 px-6 py-2.5 text-xs uppercase tracking-[0.3em] text-[#1A1A1A]/60 transition-all hover:border-[#5A5A40]/30 hover:text-[#5A5A40]"
            >
              Join Another Session
            </a>
            {gameState.status === 'ended' && (
              <button
                onClick={() => setShowFeedback(true)}
                className="text-xs uppercase tracking-wider text-[#1A1A1A]/40 transition-colors hover:text-[#1A1A1A]/70"
              >
                💬 Send Feedback
              </button>
            )}
          </div>
        </div>

        {showFeedback && (
          <FeedbackModal
            onClose={() => setShowFeedback(false)}
            sessionCode={gameState.roomCode}
            questionText={gameState.currentQuestion?.text}
          />
        )}
      </div>
    );
  }

  // ── Lobby ──────────────────────────────────────────────────────────────────

  if (gameState.status === 'lobby') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F5F0] px-6 py-12">
        <Lobby
          roomCode={gameState.roomCode}
          players={gameState.players}
          currentPlayerId={gameState.playerId}
          isHost={false}
        />
      </div>
    );
  }

  // ── Writing Phase ──────────────────────────────────────────────────────────

  if (gameState.status === 'writing') {
    return (
      <div className="flex min-h-screen flex-col bg-[#F5F5F0]">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-[#1A1A1A]/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-[#1A1A1A]/30">
              Question {gameState.currentQuestion?.index}
            </span>
            <SoundToggle onToggle={toggleMute} getMuted={getMuted} />
          </div>
          <Timer timerEndsAt={gameState.timerEndsAt} />
        </div>

        {/* Question */}
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
          <h2
            className="mb-8 max-w-lg text-center text-2xl font-light italic leading-relaxed text-[#1A1A1A] sm:text-3xl"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {gameState.currentQuestion?.text}
          </h2>

          {submitted ? (
            <div className="text-center">
              <div className="mb-3 flex items-center justify-center gap-2">
                <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium text-emerald-700">Answer submitted!</span>
              </div>
              <p className="text-sm italic text-[#1A1A1A]/40" style={{ fontFamily: 'Georgia, serif' }}>
                Waiting for others...
              </p>
            </div>
          ) : (
            <div className="w-full max-w-md">
              <label htmlFor="answer-input" className="sr-only">Your answer</label>
              <textarea
                id="answer-input"
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                onKeyDown={e => {
                  // Cmd/Ctrl+Enter submits (Enter alone allows multi-line answers).
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                maxLength={500}
                rows={3}
                placeholder="Type your answer..."
                aria-describedby="answer-hint"
                autoFocus
                className="mb-2 w-full resize-none rounded-xl border-2 border-[#1A1A1A]/10 bg-white p-4 text-[#1A1A1A] shadow-sm outline-none transition-all placeholder:text-[#1A1A1A]/20 focus:border-[#5A5A40] focus:ring-2 focus:ring-[#5A5A40]/20"
                style={{ fontFamily: 'Georgia, serif' }}
              />
              {/* Keyboard hint — only meaningful on devices that have a keyboard */}
              <p id="answer-hint" className="mb-4 hidden text-center text-[10px] uppercase tracking-wider text-[#1A1A1A]/30 [@media(hover:hover)]:block">
                Press ⌘/Ctrl + Enter to submit
              </p>
              <button
                onClick={handleSubmit}
                disabled={!answer.trim()}
                className={cn(
                  'w-full rounded-full py-3.5 text-xs uppercase tracking-[0.3em] shadow-md transition-all',
                  'bg-[#5A5A40] text-[#F5F2ED] hover:bg-[#4A4A34] hover:shadow-lg active:scale-[0.98]',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                )}
              >
                Submit Answer
              </button>
            </div>
          )}
        </div>

        {/* Footer — who has answered */}
        <div className="border-t border-[#1A1A1A]/5 px-4 py-3">
          <PlayerList
            players={gameState.players}
            answeredPlayerIds={gameState.answeredPlayerIds}
            currentPlayerId={gameState.playerId}
            compact
          />
        </div>
      </div>
    );
  }

  // ── Voting Phase ────────────────────────────────────────────────────────────

  if (gameState.status === 'voting') {
    return (
      <div className="flex min-h-screen flex-col bg-[#F5F5F0]">
        {/* Header */}
        <div className="border-b border-[#1A1A1A]/5 px-4 py-3">
          <span className="text-xs uppercase tracking-wider text-amber-600">
            🗳️ Vote for the Best Answer
          </span>
        </div>

        {/* Question reminder */}
        <div className="border-b border-[#1A1A1A]/5 bg-white/50 px-6 py-4">
          <p
            className="text-center text-lg italic text-[#1A1A1A]/70"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {gameState.currentQuestion?.text}
          </p>
        </div>

        {/* Voting cards */}
        <div className="flex-1 px-6 py-6">
          <div className="mx-auto max-w-lg space-y-3">
            {gameState.hasVoted && (
              <p className="mb-4 text-center text-sm text-emerald-600">
                ✓ Vote cast! Waiting for others...
              </p>
            )}
            <GameErrorBoundary fallbackMessage="Could not display voting cards.">
              {gameState.revealedAnswers.map((ans) => (
                <VotingCard
                  key={ans.playerId}
                  answer={ans}
                  voteCount={gameState.votes[ans.playerId] || 0}
                  hasVoted={gameState.hasVoted}
                  isSelf={ans.playerId === gameState.playerId}
                  onVote={() => {
                    actions.castVote(ans.playerId);
                  }}
                />
              ))}
            </GameErrorBoundary>
          </div>
        </div>

        {/* Leaderboard preview */}
        {gameState.leaderboard.length > 0 && (
          <div className="border-t border-[#1A1A1A]/5 px-6 py-6">
            <Leaderboard entries={gameState.leaderboard} currentPlayerId={gameState.playerId} />
          </div>
        )}
      </div>
    );
  }

  // ── Revealing Phase ────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F5F0]">
      {/* Header */}
      <div className="border-b border-[#1A1A1A]/5 px-4 py-3">
        <span className="text-xs uppercase tracking-wider text-[#1A1A1A]/30">
          Revealing Answers
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
          <GameErrorBoundary fallbackMessage="Could not display answers.">
            {gameState.revealedAnswers.map((ans, i) => (
              <AnswerCard
                key={ans.playerId}
                answer={ans}
                index={i}
                isNew={i === gameState.revealedAnswers.length - 1}
              />
            ))}
          </GameErrorBoundary>

          {gameState.revealedAnswers.length === 0 && (
            <p className="text-center text-sm italic text-[#1A1A1A]/40" style={{ fontFamily: 'Georgia, serif' }}>
              The host is about to reveal answers...
            </p>
          )}
        </div>
      </div>

      {/* Leaderboard (if scores exist from previous rounds) */}
      {gameState.leaderboard.length > 0 && (
        <div className="border-t border-[#1A1A1A]/5 px-6 py-6">
          <Leaderboard entries={gameState.leaderboard} currentPlayerId={gameState.playerId} />
        </div>
      )}
    </div>
  );
}
