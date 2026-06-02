import type { Timestamp, FieldValue } from 'firebase/firestore';

export type Difficulty = 'Light' | 'Deep' | 'Random';
export type Category = 'Icebreaker' | 'Deep Talk' | 'Funny' | 'Team Building' | 'Date Night' | 'Philosophy' | 'Creative Sparks';

/** Union type for Firestore timestamp fields.
 *  - `FieldValue` when calling serverTimestamp() before the write (client-side placeholder)
 *  - `Timestamp` after reading back from Firestore
 *  - `Date | string` from server-side REST writes or JSON serialisation
 */
export type FirestoreTimestamp = Timestamp | FieldValue | Date | string;

/** Categories that require a premium subscription to access */
export const PREMIUM_CATEGORIES: readonly Category[] = ['Date Night', 'Philosophy', 'Creative Sparks'] as const;

// ── Question Packs ──────────────────────────────────────────────────────────

export interface PackQuestion {
  id: string;
  text: string;
  difficulty: 'Light' | 'Deep';
}

export interface QuestionPack {
  id: string;
  name: string;
  tagline: string;
  emoji: string;
  gradient: string;   // CSS gradient string for the card background
  accent: string;     // Accent hex colour
  isPremium: boolean;
  questions: PackQuestion[];
}
export type SubscriptionPlan = 'free' | 'monthly' | 'yearly';

export interface Question {
  id: string;
  text: string;
  category: Category;
  difficulty: Difficulty;
}

export interface DailyQuestion {
  date: string;
  questionId: string;
  text: string;
  category: Category;
  imageUrl?: string;
  imagePrompt?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  isPremium: boolean;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: 'none' | 'active' | 'canceled' | 'past_due';
  lifetimePurchase: boolean;
  usageCount: number;
  createdAt: FirestoreTimestamp;
  // Streak tracking — updated by incrementUsage()
  currentStreak?: number;
  longestStreak?: number;
  lastActiveDate?: string;       // YYYY-MM-DD
  // Referral (Phase 5)
  referralCode?: string;
  referredBy?: string;
  referralCount?: number;
  bonusQuestions?: number;
  feedbackRewarded?: boolean;
  // Payment provider linkage (written server-side by webhooks)
  paymentProvider?: 'stripe' | 'lemonsqueezy';
  stripeCustomerId?: string;
  lsCustomerId?: string;
  lsSubscriptionId?: string;
}

// ── Live Session (Kahoot-style game) ────────────────────────────────────────

export type SessionStatus = 'lobby' | 'writing' | 'revealing' | 'voting' | 'ended';
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
export type PlayerGender = 'male' | 'female' | 'other';

export interface GamePlayer {
  id: string;
  name: string;
  isHost: boolean;
  gender?: PlayerGender;
  avatar?: string;  // emoji character
}

export interface RevealedAnswer {
  playerId: string;
  name: string;
  answer: string;
  avatar?: string;
}

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  score: number;
  avatar?: string;
}

export interface GameState {
  status: SessionStatus;
  roomCode: string;
  playerId: string;
  isHost: boolean;
  players: GamePlayer[];
  currentQuestion: { text: string; index: number } | null;
  timerEndsAt: string | null;
  answeredPlayerIds: Set<string>;
  hasSubmitted: boolean;
  revealedAnswers: RevealedAnswer[];
  revealIndex: number;
  totalAnswers: number;
  // Voting & Leaderboard
  votes: Record<string, number>;     // targetPlayerId -> vote count
  hasVoted: boolean;
  votingOpen: boolean;
  leaderboard: LeaderboardEntry[];
}

/** Client → Server message types */
export type GameClientMessage =
  | { type: 'join'; name: string; hostToken?: string; gender?: PlayerGender; avatar?: string }
  | { type: 'start_question'; text: string; timerSec?: number }
  | { type: 'submit_answer'; answer: string }
  | { type: 'reveal_next' }
  | { type: 'reveal_all' }
  | { type: 'next_question' }
  | { type: 'end_session' }
  | { type: 'kick'; playerId: string }
  | { type: 'start_voting' }
  | { type: 'cast_vote'; targetPlayerId: string }
  | { type: 'end_voting' };

/** Server → Client message types */
export type GameServerMessage =
  | { type: 'welcome'; playerId: string; players: GamePlayer[]; status: SessionStatus; roomCode: string; currentQuestion?: { text: string; index: number }; timerEndsAt?: string | null; answers?: RevealedAnswer[]; revealIndex?: number; leaderboard?: LeaderboardEntry[] }
  | { type: 'player_joined'; id: string; name: string; playerCount: number; gender?: PlayerGender; avatar?: string }
  | { type: 'player_left'; id: string; playerCount: number }
  | { type: 'question_started'; text: string; index: number; timerEndsAt: string }
  | { type: 'answer_received'; playerId: string; playerCount: number; answeredCount: number }
  | { type: 'reveal'; playerId: string; name: string; answer: string; avatar?: string; revealIndex: number; totalAnswers: number }
  | { type: 'reveal_all'; answers: RevealedAnswer[] }
  | { type: 'phase_change'; status: SessionStatus }
  | { type: 'timer_expired' }
  | { type: 'error'; message: string }
  | { type: 'session_ended' }
  | { type: 'kicked' }
  | { type: 'voting_started' }
  | { type: 'vote_update'; votes: Record<string, number>; voterCount: number; totalVoters: number }
  | { type: 'vote_result'; winnerId: string; winnerName: string; leaderboard: LeaderboardEntry[] };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}
