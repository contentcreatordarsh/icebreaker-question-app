export type Difficulty = 'Light' | 'Deep' | 'Random';
export type Category = 'Icebreaker' | 'Deep Talk' | 'Funny' | 'Team Building' | 'Date Night' | 'Philosophy' | 'Creative Sparks';

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
  createdAt: any;
  // Streak tracking — updated by incrementUsage()
  currentStreak?: number;
  longestStreak?: number;
  lastActiveDate?: string;       // YYYY-MM-DD
  // Referral (Phase 5)
  referralCode?: string;
  referredBy?: string;
  referralCount?: number;
  bonusQuestions?: number;
}

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
