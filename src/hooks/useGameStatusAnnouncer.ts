import { useEffect, useRef } from 'react';
import type { GameState } from '../types';
import { useDocumentTitle } from '../lib/useDocumentTitle';

/** Human phase label for the document title / screen-reader context. */
function phaseTitle(gs: GameState): string | null {
  switch (gs.status) {
    case 'lobby':
      return 'Lobby';
    case 'writing':
      return gs.currentQuestion ? `Question ${gs.currentQuestion.index}` : 'Question';
    case 'voting':
      return 'Voting';
    case 'revealing':
      return 'Revealing Answers';
    case 'ended':
      return 'Session Over';
    default:
      return null;
  }
}

interface AnnouncerFlags {
  /** Whether the local player has submitted an answer this round. */
  submitted: boolean;
}

/**
 * Accessibility hook for the live game. It:
 *  1. Sets a phase-aware document title (e.g. "Question 2 · Dinner Table Cards").
 *  2. Maintains a single visually-hidden `aria-live` region on <body> that
 *     announces phase transitions, the new question text, answer submission, and
 *     vote casting to screen-reader users.
 *
 * The live region is managed imperatively (rather than via JSX) because the
 * live-session pages render entirely different trees per phase via early
 * returns — an imperative node guarantees the region is always present so
 * announcements are never dropped when the visual tree swaps out.
 */
export function useGameStatusAnnouncer(gameState: GameState, flags: AnnouncerFlags): void {
  useDocumentTitle(phaseTitle(gameState));

  const regionRef = useRef<HTMLDivElement | null>(null);
  const prevStatus = useRef<GameState['status'] | null>(null);
  const prevSubmitted = useRef(false);
  const prevHasVoted = useRef(false);

  // Create / tear down the live region.
  useEffect(() => {
    const el = document.createElement('div');
    el.setAttribute('aria-live', 'assertive');
    el.setAttribute('aria-atomic', 'true');
    el.setAttribute('role', 'status');
    // Visually hidden but available to assistive tech.
    el.style.cssText =
      'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;';
    document.body.appendChild(el);
    regionRef.current = el;
    return () => {
      el.remove();
      regionRef.current = null;
    };
  }, []);

  const say = (msg: string) => {
    if (regionRef.current) regionRef.current.textContent = msg;
  };

  // Phase transitions.
  useEffect(() => {
    if (prevStatus.current === gameState.status) return;
    prevStatus.current = gameState.status;
    switch (gameState.status) {
      case 'lobby':
        say('Joined the lobby. Waiting for the host to start.');
        break;
      case 'writing':
        say(
          gameState.currentQuestion
            ? `New question ${gameState.currentQuestion.index}: ${gameState.currentQuestion.text}. Type your answer.`
            : 'A new question is starting.',
        );
        break;
      case 'voting':
        say('Voting is open. Choose the best answer.');
        break;
      case 'revealing':
        say('Answers are being revealed.');
        break;
      case 'ended': {
        const winner = gameState.leaderboard[0];
        say(winner ? `Session over. ${winner.name} won with ${winner.score} points.` : 'Session over. Thanks for playing.');
        break;
      }
    }
  }, [gameState.status, gameState.currentQuestion, gameState.leaderboard]);

  // Local answer submission.
  useEffect(() => {
    if (flags.submitted && !prevSubmitted.current) say('Your answer was submitted. Waiting for others.');
    prevSubmitted.current = flags.submitted;
  }, [flags.submitted]);

  // Local vote cast.
  useEffect(() => {
    if (gameState.hasVoted && !prevHasVoted.current) say('Your vote was cast.');
    prevHasVoted.current = gameState.hasVoted;
  }, [gameState.hasVoted]);
}
