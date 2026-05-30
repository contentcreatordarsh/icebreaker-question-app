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
    limit: 25,
    price: '$0',
    billing: 'forever',
    features: ['Basic categories', 'Daily questions', '25 questions to start']
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
    features: ['Priority support', 'Early access', '500 questions/month']
  }
};
