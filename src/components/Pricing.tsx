import React, { useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle } from 'lucide-react';
import { auth, authedFetch } from '../lib/firebase';

interface PricingProps {
  onSuccess: () => void;
}

export default function Pricing({ onSuccess }: PricingProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [signInPrompt, setSignInPrompt] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const MONTHLY_PRICE_ID = import.meta.env.VITE_STRIPE_MONTHLY_PRICE_ID;
  const YEARLY_PRICE_ID  = import.meta.env.VITE_STRIPE_YEARLY_PRICE_ID;

  const handleCheckout = async (priceId: string) => {
    if (!auth.currentUser) {
      setSignInPrompt(true);
      setTimeout(() => setSignInPrompt(false), 4000);
      return;
    }
    setCheckoutError(null);
    setLoading(priceId);
    try {
      const response = await authedFetch('/api/create-checkout-session', {
        priceId,
        mode: 'subscription',
        successUrl: window.location.origin + '?payment=success',
        cancelUrl: window.location.origin + '?payment=cancel',
      });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok) {
        setCheckoutError(data.error || 'Checkout unavailable — please try again.');
      } else if (data.url) {
        window.location.href = data.url;
      } else {
        setCheckoutError('Checkout unavailable — please try again.');
      }
    } catch {
      setCheckoutError('Something went wrong. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="py-12 bg-white/50 border border-brand/10 p-8 rounded-sm shadow-sm max-w-4xl mx-auto">
      {signInPrompt && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-3 bg-accent/10 border border-accent/20 rounded-sm px-5 py-3 text-[11px] caps-tracking text-accent">
          <AlertCircle size={14} /> Please sign in first to unlock a plan.
        </motion.div>
      )}
      {checkoutError && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 rounded-sm px-5 py-3 text-[11px] caps-tracking text-red-600">
          <AlertCircle size={14} /> {checkoutError}
        </motion.div>
      )}

      <div className="text-center mb-12">
        <h3 className="font-serif text-3xl text-brand mb-3">Unlock the Archive</h3>
        <p className="caps-tracking opacity-50 text-[11px] max-w-sm mx-auto">
          Over 300 curated questions. Cancel anytime.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
        {/* Monthly */}
        <div className="flex flex-col text-left p-8 border border-brand/10 bg-white/40 rounded-sm hover:border-brand/30 transition-all">
          <span className="caps-tracking opacity-40 text-[10px] mb-4">Monthly</span>
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-5xl font-serif font-normal">$3</span>
            <span className="caps-tracking opacity-40 text-sm">/ month</span>
          </div>
          <p className="caps-tracking opacity-30 text-[10px] mb-8">Billed monthly · Cancel anytime</p>

          <ul className="space-y-3 mb-10 flex-grow">
            {['100 questions per month', 'All categories', 'Favorites & history', 'Share cards'].map(f => (
              <li key={f} className="flex items-center gap-3 text-[11px] caps-tracking opacity-60">
                <div className="w-1 h-1 rounded-full bg-brand/40 shrink-0" /> {f}
              </li>
            ))}
          </ul>

          <button
            onClick={() => handleCheckout(MONTHLY_PRICE_ID)}
            disabled={!!loading}
            className="w-full py-4 bg-brand text-white caps-tracking text-[10px] hover:bg-opacity-80 transition-all disabled:opacity-50"
          >
            {loading === MONTHLY_PRICE_ID ? 'Redirecting…' : 'Subscribe Monthly'}
          </button>
        </div>

        {/* Yearly — highlighted */}
        <div className="flex flex-col text-left p-8 border-2 border-brand bg-brand/[0.02] rounded-sm relative overflow-hidden">
          <div className="absolute top-3 right-3 bg-brand text-white caps-tracking text-[9px] px-3 py-1 rounded-sm">
            Best Value
          </div>

          <span className="caps-tracking opacity-40 text-[10px] mb-4">Yearly</span>
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-5xl font-serif font-normal">$2</span>
            <span className="caps-tracking opacity-40 text-sm">/ month</span>
          </div>
          <p className="caps-tracking opacity-30 text-[10px] mb-8">Billed as $24/year · Save 33%</p>

          <ul className="space-y-3 mb-10 flex-grow">
            {['500 questions per month', 'All categories', 'Favorites & history', 'Early feature access'].map(f => (
              <li key={f} className="flex items-center gap-3 text-[11px] caps-tracking opacity-60">
                <div className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" /> {f}
              </li>
            ))}
          </ul>

          <button
            onClick={() => handleCheckout(YEARLY_PRICE_ID)}
            disabled={!!loading}
            className="w-full py-4 bg-brand text-white caps-tracking text-[10px] hover:bg-opacity-80 transition-all disabled:opacity-50 shadow-md"
          >
            {loading === YEARLY_PRICE_ID ? 'Redirecting…' : 'Subscribe Yearly — Save 33%'}
          </button>
        </div>
      </div>

      <p className="text-center caps-tracking opacity-20 text-[10px] mt-8">
        Secure payment via Stripe · No commitment · Cancel in 2 clicks
      </p>
    </div>
  );
}
