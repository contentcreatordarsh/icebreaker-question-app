import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, TrendingUp, Flame, Bookmark, Award, Zap, Gift, Copy, Check } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { collection, getCountFromServer } from 'firebase/firestore';
import { UserProfile } from '../types';
import { PLANS } from '../constants';
import { cn } from '../lib/utils';

interface UsageDashboardProps {
  userProfile: UserProfile;
  onClose: () => void;
  onUpgrade: () => void;
}

function computeDailyAvg(usageCount: number, createdAt: any): string {
  try {
    const created: Date = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt);
    const msPerDay = 1000 * 60 * 60 * 24;
    const days = Math.max(1, Math.floor((Date.now() - created.getTime()) / msPerDay));
    return (usageCount / days).toFixed(1);
  } catch {
    return '—';
  }
}

export default function UsageDashboard({ userProfile, onClose, onUpgrade }: UsageDashboardProps) {
  const currentPlan = PLANS[userProfile.subscriptionPlan || 'free'];
  const usageLimit = currentPlan.limit + (userProfile.bonusQuestions || 0);
  const usagePercent = Math.min((userProfile.usageCount / usageLimit) * 100, 100);
  const isNearLimit = usagePercent > 80;

  const [favCount, setFavCount] = useState<number | null>(null);
  const [histCount, setHistCount] = useState<number | null>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    (async () => {
      try {
        const [favSnap, histSnap] = await Promise.all([
          getCountFromServer(collection(db, 'users', uid, 'favorites')),
          getCountFromServer(collection(db, 'users', uid, 'history')),
        ]);
        setFavCount(favSnap.data().count);
        setHistCount(histSnap.data().count);
      } catch {
        // getCountFromServer may not be available on older SDK versions — swallow
      }
    })();
  }, []);

  const streak = userProfile.currentStreak ?? 0;
  const longestStreak = userProfile.longestStreak ?? 0;
  const dailyAvg = computeDailyAvg(userProfile.usageCount, userProfile.createdAt);

  // ── Referral link ───────────────────────────────────────────────────────────
  const referralCount = userProfile.referralCount ?? 0;
  const bonusQuestions = userProfile.bonusQuestions ?? 0;
  const referralLink = userProfile.referralCode
    ? `${window.location.origin}/?ref=${userProfile.referralCode}`
    : '';
  const [copied, setCopied] = useState(false);

  const copyReferralLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable — ignore
    }
  };

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
            <span className="caps-tracking opacity-40 italic font-serif">Account Overview</span>
            <h1 className="text-2xl font-serif italic text-brand">Usage Dashboard</h1>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-brand/5 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-16">
          {/* Current Status */}
          <div className="lg:col-span-2 space-y-8">
            {/* Usage bar */}
            <div className="bg-white/50 border border-brand/10 p-8 rounded-sm">
              <div className="flex justify-between items-end mb-6">
                <div>
                  <span className="text-[10px] caps-tracking opacity-40 block mb-1">Active Tier</span>
                  <h2 className="text-3xl font-serif italic text-brand">{currentPlan.name} Plan</h2>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-serif text-brand">{userProfile.usageCount}</span>
                  <span className="text-sm opacity-40">
                    {' '}/ {currentPlan.limit === 1000000 ? '∞' : usageLimit}
                  </span>
                  <span className="text-[10px] caps-tracking opacity-40 block mt-1">Questions Used</span>
                </div>
              </div>

              <div className="relative h-2 bg-brand/5 rounded-full overflow-hidden mb-4">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${usagePercent}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className={cn('absolute h-full transition-colors', isNearLimit ? 'bg-accent' : 'bg-brand')}
                />
              </div>

              {isNearLimit && !userProfile.isPremium && (
                <p className="text-accent text-[10px] caps-tracking flex items-center gap-2">
                  <Zap size={10} /> Approaching your limit —{' '}
                  <button className="underline" onClick={onUpgrade}>upgrade to continue</button>
                </p>
              )}
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 border border-brand/5 rounded-sm">
                <Flame size={14} className="opacity-40 mb-2" />
                <span className="block text-[10px] caps-tracking opacity-40">Current Streak</span>
                <span className="text-lg font-serif">{streak}</span>
                <span className="text-[9px] caps-tracking opacity-30 ml-1">day{streak !== 1 ? 's' : ''}</span>
              </div>
              <div className="p-4 border border-brand/5 rounded-sm">
                <Award size={14} className="opacity-40 mb-2" />
                <span className="block text-[10px] caps-tracking opacity-40">Best Streak</span>
                <span className="text-lg font-serif">{longestStreak}</span>
                <span className="text-[9px] caps-tracking opacity-30 ml-1">day{longestStreak !== 1 ? 's' : ''}</span>
              </div>
              <div className="p-4 border border-brand/5 rounded-sm">
                <TrendingUp size={14} className="opacity-40 mb-2" />
                <span className="block text-[10px] caps-tracking opacity-40">Daily Avg</span>
                <span className="text-lg font-serif">{dailyAvg}</span>
                <span className="text-[9px] caps-tracking opacity-30 ml-1">/ day</span>
              </div>
              <div className="p-4 border border-brand/5 rounded-sm">
                <Bookmark size={14} className="opacity-40 mb-2" />
                <span className="block text-[10px] caps-tracking opacity-40">Saved</span>
                <span className="text-lg font-serif">{favCount ?? '—'}</span>
                <span className="text-[9px] caps-tracking opacity-30 ml-1">favorites</span>
              </div>
            </div>

            {/* History count note */}
            {histCount !== null && (
              <p className="text-[10px] caps-tracking opacity-30 mt-2">
                {histCount} question{histCount !== 1 ? 's' : ''} in your chronicle
              </p>
            )}
          </div>

          {/* Plan Comparison */}
          <div className="space-y-6">
            <h3 className="text-[10px] caps-tracking opacity-40">Available Upgrades</h3>

            {Object.values(PLANS)
              .filter(p => p.id !== userProfile.subscriptionPlan)
              .map((plan) => (
                <div
                  key={plan.id}
                  className="p-6 border border-brand/10 bg-white/30 rounded-sm hover:border-brand/30 transition-all group"
                >
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
                    className="w-full py-3 text-[10px] caps-tracking border border-brand/20 group-hover:bg-brand group-hover:text-white transition-all"
                  >
                    Select Tier
                  </button>
                </div>
              ))}
          </div>
        </div>

        {/* ── Referral / Share your link ───────────────────────────────── */}
        {referralLink && (
          <div className="bg-gradient-to-br from-brand/5 to-accent/5 border border-brand/10 rounded-sm p-8 mb-8">
            <div className="flex items-start gap-3 mb-5">
              <Gift size={18} className="text-brand mt-0.5" />
              <div>
                <h3 className="font-serif italic text-lg text-brand leading-tight">Give 50, get 50</h3>
                <p className="text-[11px] opacity-50 leading-relaxed mt-1 max-w-md">
                  Share your link. Every friend who joins earns you{' '}
                  <span className="text-brand font-medium">50 bonus questions</span> — free, forever.
                </p>
              </div>
            </div>

            <div className="flex items-stretch gap-2 max-w-xl">
              <div className="flex-1 px-4 py-3 bg-white/60 border border-brand/10 rounded-sm font-mono text-[11px] text-brand/70 truncate flex items-center">
                {referralLink}
              </div>
              <button
                onClick={copyReferralLink}
                className={cn(
                  'px-5 flex items-center gap-2 text-[10px] caps-tracking rounded-sm transition-all',
                  copied ? 'bg-green-600 text-white' : 'bg-brand text-white hover:opacity-90',
                )}
              >
                {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>

            <div className="flex gap-8 mt-6">
              <div>
                <span className="text-xl font-serif text-brand">{referralCount}</span>
                <span className="text-[10px] caps-tracking opacity-40 ml-2">friend{referralCount !== 1 ? 's' : ''} joined</span>
              </div>
              <div>
                <span className="text-xl font-serif text-brand">+{bonusQuestions}</span>
                <span className="text-[10px] caps-tracking opacity-40 ml-2">bonus questions earned</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
