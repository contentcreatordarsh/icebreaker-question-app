import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Check, CreditCard, Sparkles } from 'lucide-react';
import { auth } from '../lib/firebase';
import { cn } from '../lib/utils';

interface PricingProps {
  onSuccess: () => void;
}

export default function Pricing({ onSuccess }: PricingProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleCheckout = async (priceId: string, mode: 'subscription' | 'payment') => {
    if (!auth.currentUser) {
      alert("Please sign in to upgrade.");
      return;
    }

    setLoading(priceId);
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          mode,
          customerEmail: auth.currentUser.email,
          successUrl: window.location.origin + '?payment=success',
          cancelUrl: window.location.origin + '?payment=cancel',
        }),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Checkout failed:", error);
    } finally {
      setLoading(null);
    }
  };

  const SUBSCRIPTION_PRICE_ID = import.meta.env.VITE_STRIPE_SUBSCRIPTION_PRICE_ID;
  const LIFETIME_PRICE_ID = import.meta.env.VITE_STRIPE_LIFETIME_PRICE_ID;

  return (
    <div className="py-12 bg-white/50 border border-brand/10 p-8 rounded-sm shadow-sm max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h3 className="font-serif text-3xl text-brand mb-4">The Subscription</h3>
        <p className="caps-tracking opacity-60 max-w-md mx-auto">
          Supporting independent quality since 2026.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-12">
        {/* Family Subscription */}
        <div className="flex flex-col text-left">
          <div className="border-b border-brand/10 pb-4 mb-6">
            <span className="caps-tracking opacity-60">Volume Access</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-4xl font-normal font-serif">$3.00</span>
              <span className="caps-tracking opacity-40">/ mo</span>
            </div>
          </div>
          
          <ul className="space-y-3 mb-8 flex-grow">
            {[
              "Daily rotational archive",
              "Unlimited thematic categories",
              "Member favoriting features",
              "Family shared access"
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-xs uppercase tracking-wider font-sans opacity-80">
                <div className="w-1.5 h-1.5 bg-brand/20 rounded-full" />
                {feature}
              </li>
            ))}
          </ul>

          <button
            onClick={() => handleCheckout(SUBSCRIPTION_PRICE_ID, 'subscription')}
            disabled={!!loading}
            className="w-full py-4 bg-brand text-white caps-tracking hover:bg-opacity-80 transition-all disabled:opacity-50"
          >
            {loading === SUBSCRIPTION_PRICE_ID ? 'Processing...' : 'Subscribe via Stripe'}
          </button>
        </div>

        {/* Lifetime Purchase */}
        <div className="flex flex-col text-left">
          <div className="border-b border-brand/10 pb-4 mb-6">
            <span className="caps-tracking opacity-60">Permanence</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-4xl font-normal font-serif">$29.00</span>
              <span className="caps-tracking opacity-40 ml-2">Lifetime</span>
            </div>
          </div>
          
          <ul className="space-y-3 mb-8 flex-grow">
            {[
              "Endless ownership",
              "Priority access to new decks",
              "Offline printed PDF exports",
              "Legacy member status"
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-xs uppercase tracking-wider font-sans opacity-80">
                <div className="w-1.5 h-1.5 bg-brand/20 rounded-full" />
                {feature}
              </li>
            ))}
          </ul>

          <button
            onClick={() => handleCheckout(LIFETIME_PRICE_ID, 'payment')}
            disabled={!!loading}
            className="w-full py-4 border border-brand text-brand caps-tracking hover:bg-brand hover:text-white transition-all disabled:opacity-50"
          >
            {loading === LIFETIME_PRICE_ID ? 'Processing...' : 'Secure Lifetime'}
          </button>
        </div>
      </div>
    </div>
  );
}
