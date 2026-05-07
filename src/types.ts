export type Difficulty = 'Light' | 'Deep' | 'Random';
export type Category = 'Icebreaker' | 'Deep Talk' | 'Funny' | 'Team Building';
export type SubscriptionPlan = 'free' | 'monthly' | 'yearly' | 'lifetime';

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
  subscriptionStatus: 'none' | 'active' | 'canceled';
  lifetimePurchase: boolean;
  usageCount: number;
  createdAt: any;
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
