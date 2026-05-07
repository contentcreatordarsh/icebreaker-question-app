import { Category, SubscriptionPlan } from './types';

export interface PlanDetails {
  id: SubscriptionPlan;
  name: string;
  limit: number;
  price: string;
  billing: string;
  features: string[];
}

export const PLANS: Record<SubscriptionPlan, PlanDetails> = {
  free: { 
    id: 'free',
    name: 'Free', 
    limit: 10, 
    price: '$0', 
    billing: 'forever',
    features: ['Basic categories', 'Daily questions', '10 generations total']
  },
  monthly: { 
    id: 'monthly',
    name: 'Monthly', 
    limit: 100, 
    price: '$3', 
    billing: 'per month',
    features: ['All categories', 'High-res exports', '100 generations month']
  },
  yearly: { 
    id: 'yearly',
    name: 'Yearly', 
    limit: 500, 
    price: '$2', 
    billing: 'per month ($24/yr)',
    features: ['Priority support', 'Early access', '500 generations/month']
  },
  lifetime: { 
    id: 'lifetime',
    name: 'Lifetime', 
    limit: 1000000, 
    price: '$29', 
    billing: 'once',
    features: ['Forever access', 'PDF archives', 'Unlimited* generations']
  }
};
