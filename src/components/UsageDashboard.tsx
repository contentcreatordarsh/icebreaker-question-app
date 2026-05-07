import React from 'react';
import { motion } from 'motion/react';
import { X, TrendingUp, Shield, Zap, Infinity as InfinityIcon } from 'lucide-react';
import { UserProfile } from '../types';
import { PLANS } from '../constants';
import { cn } from '../lib/utils';

interface UsageDashboardProps {
  userProfile: UserProfile;
  onClose: () => void;
  onUpgrade: () => void;
}

export default function UsageDashboard({ userProfile, onClose, onUpgrade }: UsageDashboardProps) {
  const currentPlan = PLANS[userProfile.subscriptionPlan || 'free'];
  const usagePercent = Math.min((userProfile.usageCount / currentPlan.limit) * 100, 100);
  const isNearLimit = usagePercent > 80;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-paper/98 backdrop-blur-xl flex flex-col p-6 md:p-12 overflow-y-auto"
    >
      <div className="max-w-4xl w-full mx-auto flex flex-col">
        <div className="flex justify-between items-center mb-16">
          <div className="flex flex-col">
            <span className="caps-tracking opacity-40 italic font-serif">Account Resource Management</span>
            <h1 className="text-2xl font-serif italic text-brand">Usage Dashboard</h1>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-brand/5 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-16">
          {/* Current Status */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white/50 border border-brand/10 p-8 rounded-sm">
              <div className="flex justify-between items-end mb-6">
                <div>
                  <span className="text-[10px] caps-tracking opacity-40 block mb-1">Active Tier</span>
                  <h2 className="text-3xl font-serif italic text-brand">{currentPlan.name} Plan</h2>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-serif text-brand">{userProfile.usageCount}</span>
                  <span className="text-sm opacity-40"> / {currentPlan.limit === 1000000 ? '∞' : currentPlan.limit}</span>
                  <span className="text-[10px] caps-tracking opacity-40 block mt-1">Generations Used</span>
                </div>
              </div>

              <div className="relative h-2 bg-brand/5 rounded-full overflow-hidden mb-4">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${usagePercent}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className={cn(
                    "absolute h-full transition-colors",
                    isNearLimit ? "bg-accent" : "bg-brand"
                  )}
                />
              </div>

              {isNearLimit && (
                <p className="text-accent text-[10px] caps-tracking flex items-center gap-2">
                  <Zap size={10} /> Approaching architecture limit. Consider scaling.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 border border-brand/5 rounded-sm">
                <TrendingUp size={14} className="opacity-40 mb-2" />
                <span className="block text-[10px] caps-tracking opacity-40">Daily Avg</span>
                <span className="text-lg font-serif">{(userProfile.usageCount / 30).toFixed(1)}</span>
              </div>
              <div className="p-4 border border-brand/5 rounded-sm">
                <Shield size={14} className="opacity-40 mb-2" />
                <span className="block text-[10px] caps-tracking opacity-40">Status</span>
                <span className="text-lg font-serif italic">Verified</span>
              </div>
              <div className="p-4 border border-brand/5 rounded-sm">
                <Zap size={14} className="opacity-40 mb-2" />
                <span className="block text-[10px] caps-tracking opacity-40">Latency</span>
                <span className="text-lg font-serif">4ms</span>
              </div>
              <div className="p-4 border border-brand/5 rounded-sm">
                <InfinityIcon size={14} className="opacity-40 mb-2" />
                <span className="block text-[10px] caps-tracking opacity-40">Uptime</span>
                <span className="text-lg font-serif">99.9%</span>
              </div>
            </div>
          </div>

          {/* Plan Comparison */}
          <div className="space-y-6">
            <h3 className="text-[10px] caps-tracking opacity-40">Available Upgrades</h3>
            
            {Object.values(PLANS).filter(p => p.id !== userProfile.subscriptionPlan).map((plan) => (
              <div key={plan.id} className="p-6 border border-brand/10 bg-white/30 rounded-sm hover:border-brand/30 transition-all group">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="font-serif italic text-lg">{plan.name}</h4>
                    <span className="text-[10px] caps-tracking opacity-40">{plan.billing}</span>
                  </div>
                  <span className="text-xl font-serif text-brand">{plan.price}</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {plan.features.slice(0, 2).map((f) => (
                    <li key={f} className="text-[10px] caps-tracking opacity-60 flex items-center gap-2">
                      <div className="w-1 h-1 bg-brand/20 rounded-full" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button 
                  onClick={onUpgrade}
                  className="w-full py-3 text-[10px] caps-tracking border border-brand/20 group-hover:bg-brand group-hover:text-white transition-all disabled:opacity-50"
                >
                  Select Tier
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 text-center">
            <p className="text-[10px] caps-tracking opacity-20 max-w-sm mx-auto">
                Lifetime accounts are available for $29. Secure permanent archival rights and unlimited generation quota forever.
            </p>
        </div>
      </div>
    </motion.div>
  );
}
