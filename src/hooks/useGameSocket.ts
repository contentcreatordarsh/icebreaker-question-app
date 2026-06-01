import { useReducer, useCallback, useEffect, useRef } from 'react';
import type {
  ConnectionStatus,
  GameState,
  GameServerMessage,
  GameClientMessage,
  PlayerGender,
} from '../types';

// ── State + Reducer ────────────────────────────────────────────────────────────

interface SocketState {
  connection: ConnectionStatus;
  game: GameState;
  error: string | null;
}

const initialGame: GameState = {
  status: 'lobby',
  roomCode: '',
  playerId: '',
  isHost: false,
  players: [],
  currentQuestion: null,
  timerEndsAt: null,
  answeredPlayerIds: new Set(),
  hasSubmitted: false,
  revealedAnswers: [],
  revealIndex: 0,
  totalAnswers: 0,
  // Voting & Leaderboard
  votes: {},
  hasVoted: false,
  votingOpen: false,
  leaderboard: [],
};

type Action =
  | { type: 'SET_CONNECTION'; status: ConnectionStatus }
  | { type: 'SET_ERROR'; message: string }
  | { type: 'SERVER_MESSAGE'; msg: GameServerMessage }
  | { type: 'SET_VOTED' }
  | { type: 'SET_SUBMITTED' };

function reducer(state: SocketState, action: Action): SocketState {
  switch (action.type) {
    case 'SET_CONNECTION':
      return { ...state, connection: action.status };

    case 'SET_ERROR':
      return { ...state, error: action.message };

    case 'SERVER_MESSAGE':
      return { ...state, game: applyServerMessage(state.game, action.msg), error: null };

    case 'SET_VOTED':
      return { ...state, game: { ...state.game, hasVoted: true } };

    case 'SET_SUBMITTED':
      return { ...state, game: { ...state.game, hasSubmitted: true } };

    default:
      return state;
  }
}

function applyServerMessage(game: GameState, msg: GameServerMessage): GameState {
  switch (msg.type) {
    case 'welcome': {
      const isHost = msg.players.some(p => p.id === msg.playerId && p.isHost);
      return {
        ...game,
        playerId: msg.playerId,
        roomCode: msg.roomCode,
        status: msg.status,
        isHost,
        players: msg.players,
        currentQuestion: msg.currentQuestion ?? null,
        timerEndsAt: msg.timerEndsAt ?? null,
        revealedAnswers: msg.answers ?? [],
        revealIndex: msg.revealIndex ?? 0,
        hasSubmitted: false,
        answeredPlayerIds: new Set(),
        leaderboard: msg.leaderboard ?? [],
        votes: {},
        hasVoted: false,
        votingOpen: false,
      };
    }

    case 'player_joined':
      return {
        ...game,
        players: [
          ...game.players.filter(p => p.id !== msg.id),
          { id: msg.id, name: msg.name, isHost: false, gender: msg.gender, avatar: msg.avatar },
        ],
      };

    case 'player_left':
      return {
        ...game,
        players: game.players.filter(p => p.id !== msg.id),
      };

    case 'question_started':
      return {
        ...game,
        status: 'writing',
        currentQuestion: { text: msg.text, index: msg.index },
        timerEndsAt: msg.timerEndsAt,
        answeredPlayerIds: new Set(),
        hasSubmitted: false,
        revealedAnswers: [],
        revealIndex: 0,
        totalAnswers: 0,
        votes: {},
        hasVoted: false,
        votingOpen: false,
      };

    case 'answer_received': {
      const newAnswered = new Set(game.answeredPlayerIds);
      newAnswered.add(msg.playerId);
      return {
        ...game,
        answeredPlayerIds: newAnswered,
        totalAnswers: msg.answeredCount,
      };
    }

    case 'reveal':
      return {
        ...game,
        status: 'revealing',
        revealedAnswers: [
          ...game.revealedAnswers,
          { playerId: msg.playerId, name: msg.name, answer: msg.answer, avatar: msg.avatar },
        ],
        revealIndex: msg.revealIndex,
        totalAnswers: msg.totalAnswers,
      };

    case 'reveal_all':
      return {
        ...game,
        status: 'revealing',
        revealedAnswers: msg.answers,
        revealIndex: msg.answers.length,
        totalAnswers: msg.answers.length,
      };

    case 'voting_started':
      return {
        ...game,
        status: 'voting',
        votingOpen: true,
        votes: {},
        hasVoted: false,
      };

    case 'vote_update':
      return {
        ...game,
        votes: msg.votes,
      };

    case 'vote_result':
      return {
        ...game,
        votingOpen: false,
        leaderboard: msg.leaderboard,
      };

    case 'phase_change':
      return {
        ...game,
        status: msg.status,
        // Reset writing-phase state when going back to lobby
        ...(msg.status === 'lobby' ? {
          currentQuestion: null,
          timerEndsAt: null,
          answeredPlayerIds: new Set(),
          hasSubmitted: false,
          revealedAnswers: [],
          revealIndex: 0,
          totalAnswers: 0,
          votes: {},
          hasVoted: false,
          votingOpen: false,
        } : {}),
      };

    case 'timer_expired':
      return { ...game, timerEndsAt: null };

    case 'session_ended':
      return { ...game, status: 'ended' };

    case 'kicked':
      return { ...game, status: 'ended' };

    case 'error':
      // error is handled by the reducer's SET_ERROR, but we still pass it through
      return game;

    default:
      return game;
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────────

interface UseGameSocketOptions {
  roomCode: string;
  playerName: string;
  hostToken?: string;
  gender?: PlayerGender;
  avatar?: string;
  enabled?: boolean; // default true — set false to delay connection
}

interface UseGameSocketReturn {
  connectionStatus: ConnectionStatus;
  gameState: GameState;
  error: string | null;
  actions: {
    submitAnswer: (answer: string) => void;
    startQuestion: (text: string, timerSec?: number) => void;
    revealNext: () => void;
    revealAll: () => void;
    nextQuestion: () => void;
    endSession: () => void;
    kick: (playerId: string) => void;
    startVoting: () => void;
    castVote: (targetPlayerId: string) => void;
    endVoting: () => void;
  };
}

export function useGameSocket({
  roomCode,
  playerName,
  hostToken,
  gender,
  avatar,
  enabled = true,
}: UseGameSocketOptions): UseGameSocketReturn {
  const [state, dispatch] = useReducer(reducer, {
    connection: 'connecting',
    game: initialGame,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const cleanupListenersRef = useRef<(() => void) | null>(null);
  const maxRetries = 3;

  // Send a typed message over the WebSocket
  const sendMessage = useCallback((msg: GameClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  // Connect / reconnect logic
  useEffect(() => {
    if (!enabled || !roomCode || !playerName) return;

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;

      dispatch({ type: 'SET_CONNECTION', status: 'connecting' });

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/session/ws?code=${encodeURIComponent(roomCode)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const onOpen = () => {
        if (cancelled) { ws.close(); return; }
        dispatch({ type: 'SET_CONNECTION', status: 'connected' });
        retriesRef.current = 0;

        // Send join message immediately with avatar/gender
        const joinMsg: GameClientMessage = { type: 'join', name: playerName };
        if (hostToken) (joinMsg as any).hostToken = hostToken;
        if (gender) (joinMsg as any).gender = gender;
        if (avatar) (joinMsg as any).avatar = avatar;
        ws.send(JSON.stringify(joinMsg));
      };

      const onMessage = (event: MessageEvent) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(event.data as string) as GameServerMessage;
          if (msg.type === 'error') {
            dispatch({ type: 'SET_ERROR', message: msg.message });
          }
          dispatch({ type: 'SERVER_MESSAGE', msg });
        } catch {
          console.warn('[useGameSocket] Failed to parse message:', event.data);
        }
      };

      const onClose = (event: CloseEvent) => {
        if (cancelled) return;
        wsRef.current = null;

        // Don't reconnect if the session ended normally or we were kicked
        if (event.code === 1000) {
          dispatch({ type: 'SET_CONNECTION', status: 'disconnected' });
          return;
        }

        // Attempt reconnection with exponential backoff
        if (retriesRef.current < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retriesRef.current), 8000);
          retriesRef.current += 1;
          dispatch({ type: 'SET_CONNECTION', status: 'connecting' });
          reconnectTimer = setTimeout(connect, delay);
        } else {
          dispatch({ type: 'SET_CONNECTION', status: 'error' });
          dispatch({ type: 'SET_ERROR', message: 'Connection lost. Please refresh to rejoin.' });
        }
      };

      const onError = () => {
        // The close event will fire after this, triggering reconnect logic
      };

      ws.addEventListener('open', onOpen);
      ws.addEventListener('message', onMessage);
      ws.addEventListener('close', onClose);
      ws.addEventListener('error', onError);

      // Store cleanup for this WebSocket instance
      cleanupListenersRef.current = () => {
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('message', onMessage);
        ws.removeEventListener('close', onClose);
        ws.removeEventListener('error', onError);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (cleanupListenersRef.current) cleanupListenersRef.current();
      const ws = wsRef.current;
      if (ws) {
        ws.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [roomCode, playerName, hostToken, gender, avatar, enabled]);

  // Memoized action dispatchers
  const actions = {
    submitAnswer: useCallback((answer: string) => {
      sendMessage({ type: 'submit_answer', answer });
      // Optimistically mark as submitted
      dispatch({
        type: 'SERVER_MESSAGE',
        msg: {
          type: 'answer_received',
          playerId: state.game.playerId,
          playerCount: state.game.players.length,
          answeredCount: state.game.answeredPlayerIds.size + 1,
        },
      });
    }, [sendMessage, state.game.playerId, state.game.players.length, state.game.answeredPlayerIds.size]),

    startQuestion: useCallback((text: string, timerSec?: number) => {
      sendMessage({ type: 'start_question', text, timerSec });
    }, [sendMessage]),

    revealNext: useCallback(() => {
      sendMessage({ type: 'reveal_next' });
    }, [sendMessage]),

    revealAll: useCallback(() => {
      sendMessage({ type: 'reveal_all' });
    }, [sendMessage]),

    nextQuestion: useCallback(() => {
      sendMessage({ type: 'next_question' });
    }, [sendMessage]),

    endSession: useCallback(() => {
      sendMessage({ type: 'end_session' });
    }, [sendMessage]),

    kick: useCallback((playerId: string) => {
      sendMessage({ type: 'kick', playerId });
    }, [sendMessage]),

    startVoting: useCallback(() => {
      sendMessage({ type: 'start_voting' });
    }, [sendMessage]),

    castVote: useCallback((targetPlayerId: string) => {
      sendMessage({ type: 'cast_vote', targetPlayerId });
      // Optimistically mark as voted
      dispatch({ type: 'SET_VOTED' });
    }, [sendMessage]),

    endVoting: useCallback(() => {
      sendMessage({ type: 'end_voting' });
    }, [sendMessage]),
  };

  return {
    connectionStatus: state.connection,
    gameState: state.game,
    error: state.error,
    actions,
  };
}
