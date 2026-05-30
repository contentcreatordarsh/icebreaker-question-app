/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Link } from 'react-router-dom';
import { auth, db, signInWithGoogle, authedFetch } from './lib/firebase';
import { doc, getDoc, getDocFromServer, setDoc, serverTimestamp } from 'firebase/firestore';
import { AnimatePresence } from 'motion/react';
import { LogIn, LogOut, Coffee, Smile, MessageCircle, Briefcase, Search, BookOpen, Info, Menu, X as XIcon, Heart, Lightbulb, Zap, Lock } from 'lucide-react';
import QuestionDisplay from './components/QuestionDisplay';
import PackSelector from './components/PackSelector';
import Pricing from './components/Pricing';
import SearchOverlay from './components/SearchOverlay';
import AboutOverlay from './components/AboutOverlay';
import UsageDashboard from './components/UsageDashboard';
import UserCollections from './components/UserCollections';
import PaymentSuccessBanner from './components/PaymentSuccessBanner';
import OnboardingToast from './components/OnboardingToast';
import { Category, Difficulty, UserProfile, DailyQuestion, PREMIUM_CATEGORIES, QuestionPack } from './types';
import { QUESTION_PACKS } from './data/packs';
import { PLANS } from './constants';
import { cn } from './lib/utils';
import Landing from './pages/Landing';

/** Derive a stable, URL-safe referral code from a Firebase UID. */
function makeReferralCode(uid: string): string {
  return uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
}

/** Register this user's referral code in KV and attribute any inbound referral.
 *  The Worker derives the uid from the verified ID token (sent by authedFetch). */
async function registerReferral(code: string, referredByCode?: string): Promise<void> {
  try {
    await authedFetch('/api/referral', { code, referredByCode });
  } catch (err) {
    console.error('Referral registration failed:', err);
  }
}

export default function App() {
  const [user, loadingAuth] = useAuthState(auth);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Navigation state
  const [category, setCategory] = useState<Category>('Icebreaker');
  const [difficulty, setDifficulty] = useState<Difficulty>('Random');

  // Overlay visibility
  const [showPricing, setShowPricing] = useState(false);
  const [showCollections, setShowCollections] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showUsageDashboard, setShowUsageDashboard] = useState(false);

  // Mobile nav
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Question control
  const [shuffleKey, setShuffleKey] = useState(0);
  const [overrideQuestion, setOverrideQuestion] = useState<DailyQuestion | null>(null);

  // Question packs
  const [activePack, setActivePack] = useState<QuestionPack | null>(null);
  const [packIndex, setPackIndex] = useState(0);

  // Payment success
  const [showPaymentBanner, setShowPaymentBanner] = useState(false);
  const [premiumConfirmed, setPremiumConfirmed] = useState(false);

  // ── Profile sync ────────────────────────────────────────────────────────────
  const refreshProfile = useCallback(async (uid: string) => {
    const docRef = doc(db, 'users', uid);
    // Must use getDocFromServer — the Worker updates usageCount via the service
    // account REST API which bypasses the Firestore client SDK cache. getDoc()
    // would return the stale cached value and the header counter would not tick.
    const snap = await getDocFromServer(docRef);
    if (snap.exists()) setUserProfile(snap.data() as UserProfile);
  }, []);

  useEffect(() => {
    async function syncProfile() {
      if (!user) { setUserProfile(null); return; }

      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const existing = docSnap.data() as UserProfile;
        setUserProfile(existing);
        // Backfill referral code for users created before this feature shipped.
        // Only referralCode is client-writable now; the Worker owns the counters.
        if (!existing.referralCode) {
          const code = makeReferralCode(user.uid);
          await setDoc(docRef, { referralCode: code }, { merge: true });
          await registerReferral(code);
          setUserProfile({ ...existing, referralCode: code });
        }
      } else {
        const referralCode = makeReferralCode(user.uid);
        const newProfile: UserProfile = {
          uid: user.uid,
          email: user.email || '',
          isPremium: false,
          subscriptionPlan: 'free',
          subscriptionStatus: 'none',
          lifetimePurchase: false,
          usageCount: 0,
          createdAt: serverTimestamp(),
          referralCode,
          referralCount: 0,
          bonusQuestions: 0,
        };
        await setDoc(docRef, newProfile);
        setUserProfile(newProfile);

        // Register code + attribute any inbound referral captured before sign-in.
        const pendingReferral = localStorage.getItem('pendingReferral') || undefined;
        await registerReferral(referralCode, pendingReferral);
        if (pendingReferral) {
          localStorage.removeItem('pendingReferral');
          // Refresh shortly after so the new user's `referredBy` shows up.
          setTimeout(() => refreshProfile(user.uid), 1500);
        }
      }
    }
    syncProfile();
  }, [user, refreshProfile]);

  // ── Referral capture ────────────────────────────────────────────────────────
  // Stash ?ref=CODE in localStorage so it survives the Google OAuth redirect,
  // then strip it from the URL. Attribution happens on new-user creation.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (!ref) return;
    localStorage.setItem('pendingReferral', ref);
    params.delete('ref');
    const qs = params.toString();
    window.history.replaceState({}, '', qs ? `/?${qs}` : '/');
  }, []);

  // ── Payment success detection ───────────────────────────────────────────────
  // Stripe redirects back with ?payment=success. Poll until the webhook has
  // updated Firestore (there's a race between redirect and webhook arrival).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') !== 'success') return;

    // Strip the query param from the URL immediately
    window.history.replaceState({}, '', '/');
    setShowPaymentBanner(true);

    if (!user) return;

    let attempts = 0;
    // Poll every 2s for up to 30s — webhooks can take 5–15s in production.
    // Must use getDocFromServer to bypass the Firestore client cache and see
    // the webhook's server-side write immediately.
    const poll = setInterval(async () => {
      attempts++;
      await refreshProfile(user.uid);
      const snap = await getDocFromServer(doc(db, 'users', user.uid));
      if (snap.data()?.isPremium === true) {
        setPremiumConfirmed(true);
        clearInterval(poll);
      } else if (attempts >= 15) {
        clearInterval(poll);
      }
    }, 2000);

    return () => clearInterval(poll);
  }, [user, refreshProfile]);

  // ── Categories ──────────────────────────────────────────────────────────────
  const categories: { label: Category; icon: React.ElementType }[] = [
    { label: 'Icebreaker',      icon: Coffee },
    { label: 'Funny',           icon: Smile },
    { label: 'Deep Talk',       icon: MessageCircle },
    { label: 'Team Building',   icon: Briefcase },
    { label: 'Date Night',      icon: Heart },
    { label: 'Philosophy',      icon: Lightbulb },
    { label: 'Creative Sparks', icon: Zap },
  ];

  const isPremium = userProfile?.isPremium || false;

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSelectQuestion = useCallback((q: DailyQuestion) => {
    setActivePack(null);
    setOverrideQuestion(q);
    setShowSearch(false);
    setShowCollections(false);
  }, []);

  const handleShuffle = useCallback(() => {
    setActivePack(null);
    setOverrideQuestion(null);
    setShuffleKey(k => k + 1);
  }, []);

  // ── Pack handlers ────────────────────────────────────────────────────────────
  const packQuestionToOverride = useCallback((pack: QuestionPack, idx: number): DailyQuestion => ({
    date: new Date().toISOString().split('T')[0],
    questionId: `pack-${pack.id}-${idx}`,
    text: pack.questions[idx].text,
    category: 'Icebreaker', // generic — pack questions bypass category logic
  }), []);

  const handleSelectPack = useCallback((pack: QuestionPack) => {
    setActivePack(pack);
    setPackIndex(0);
    setOverrideQuestion(packQuestionToOverride(pack, 0));
  }, [packQuestionToOverride]);

  const handlePackNext = useCallback(() => {
    if (!activePack) return;
    const next = packIndex + 1;
    if (next >= activePack.questions.length) return;
    setPackIndex(next);
    setOverrideQuestion(packQuestionToOverride(activePack, next));
  }, [activePack, packIndex, packQuestionToOverride]);

  const handlePackPrev = useCallback(() => {
    if (!activePack) return;
    const prev = packIndex - 1;
    if (prev < 0) return;
    setPackIndex(prev);
    setOverrideQuestion(packQuestionToOverride(activePack, prev));
  }, [activePack, packIndex, packQuestionToOverride]);

  const handleExitPack = useCallback(() => {
    setActivePack(null);
    setPackIndex(0);
    setOverrideQuestion(null);
  }, []);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f0]">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-16 h-16 bg-[#5A5A40]/20 rounded-full mb-4" />
          <div className="h-4 w-32 bg-[#5A5A40]/20 rounded" />
        </div>
      </div>
    );
  }

  // ── Landing page for unauthenticated visitors ─────────────────────────────
  if (!user) {
    return <Landing onSignIn={signInWithGoogle} />;
  }

  return (
    <div className="editorial-container">
      {/* Payment success banner */}
      <AnimatePresence>
        {showPaymentBanner && (
          <PaymentSuccessBanner
            isPremiumConfirmed={premiumConfirmed}
            onDismiss={() => setShowPaymentBanner(false)}
          />
        )}
      </AnimatePresence>

      {/* Decorative Sidebars */}
      <div className="hidden lg:block absolute left-4 top-1/2 -translate-y-1/2 caps-tracking opacity-30 origin-center -rotate-90 whitespace-nowrap">
        Cultivating Meaningful Dialogue
      </div>
      <div className="hidden lg:block absolute right-4 top-1/2 -translate-y-1/2 caps-tracking opacity-30 origin-center rotate-90 whitespace-nowrap">
        A Private Table Collection
      </div>

      {/* Editorial Header */}
      <header className="px-6 py-5 md:p-12 border-b border-brand/10 max-w-7xl mx-auto w-full">
        {/* Desktop layout */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col">
            <span className="caps-tracking mb-1 hidden md:block">Volume 01 / Issue {new Date().getFullYear()}</span>
            <h1 className="font-serif text-2xl md:text-3xl font-normal italic tracking-tight">
              Dinner Table Cards
            </h1>
            <span className="caps-tracking text-[10px] opacity-40 mt-1 md:hidden">
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex flex-col items-end">
            <span className="caps-tracking">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            <div className="flex items-center gap-4 mt-2">
              <button onClick={() => setShowAbout(true)} className="caps-tracking hover:opacity-60 transition-opacity flex items-center gap-1.5">
                <Info size={11} /> About
              </button>
              <button onClick={() => setShowSearch(true)} className="caps-tracking hover:opacity-60 transition-opacity flex items-center gap-1.5">
                <Search size={11} /> Search
              </button>
              <button
                onClick={() => user ? setShowCollections(true) : signInWithGoogle()}
                className="caps-tracking hover:opacity-60 transition-opacity flex items-center gap-1.5"
              >
                <BookOpen size={11} /> Collection
              </button>

              {user ? (
                <div className="flex items-center gap-3 ml-2 pl-4 border-l border-brand/10">
                  <button onClick={() => setShowUsageDashboard(true)} className="flex items-center gap-2 group text-left">
                    {user.photoURL && (
                      <img src={user.photoURL} alt={user.displayName || 'User'}
                        className="w-6 h-6 rounded-full border border-brand/20 shadow-sm" referrerPolicy="no-referrer" />
                    )}
                    <div className="flex flex-col items-start leading-none">
                      {user.displayName && (
                        <span className="caps-tracking text-[10px] opacity-40">{user.displayName.split(' ')[0]}</span>
                      )}
                      <span className="text-[8px] caps-tracking opacity-20 group-hover:opacity-60 transition-opacity">
                        {userProfile?.usageCount || 0} / {
                          PLANS[userProfile?.subscriptionPlan || 'free'].limit === 1000000
                            ? '∞' : PLANS[userProfile?.subscriptionPlan || 'free'].limit
                        }
                      </span>
                    </div>
                  </button>
                  <button onClick={() => auth.signOut()} className="caps-tracking hover:opacity-60 transition-opacity flex items-center gap-1.5">
                    <LogOut size={11} /> Out
                  </button>
                </div>
              ) : (
                <button onClick={signInWithGoogle}
                  className="bg-brand text-white text-[10px] uppercase font-sans tracking-widest px-4 py-2 hover:bg-opacity-80 transition-all flex items-center gap-2 ml-2">
                  <LogIn size={12} /> Log In
                </button>
              )}

              {userProfile?.isPremium && (
                <span className="caps-tracking bg-accent/10 py-1 px-3 rounded-sm text-[10px]">Premium</span>
              )}
            </div>
          </div>

          {/* Mobile: right side — user avatar + hamburger */}
          <div className="flex md:hidden items-center gap-3">
            {user?.photoURL && (
              <button onClick={() => setShowUsageDashboard(true)}>
                <img src={user.photoURL} alt={user.displayName || 'User'}
                  className="w-7 h-7 rounded-full border border-brand/20" referrerPolicy="no-referrer" />
              </button>
            )}
            <button
              onClick={() => setMobileNavOpen(v => !v)}
              className="p-1.5 hover:bg-brand/5 rounded-sm transition-colors"
              aria-label="Menu"
            >
              {mobileNavOpen ? <XIcon size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {mobileNavOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-brand/10 flex flex-col gap-4">
            <button onClick={() => { setShowSearch(true); setMobileNavOpen(false); }}
              className="caps-tracking flex items-center gap-2 py-2 hover:opacity-60 transition-opacity">
              <Search size={13} /> Search
            </button>
            <button onClick={() => { user ? setShowCollections(true) : signInWithGoogle(); setMobileNavOpen(false); }}
              className="caps-tracking flex items-center gap-2 py-2 hover:opacity-60 transition-opacity">
              <BookOpen size={13} /> My Collection
            </button>
            <button onClick={() => { setShowAbout(true); setMobileNavOpen(false); }}
              className="caps-tracking flex items-center gap-2 py-2 hover:opacity-60 transition-opacity">
              <Info size={13} /> About
            </button>
            <div className="pt-2 border-t border-brand/5">
              {user ? (
                <div className="flex items-center justify-between">
                  <span className="caps-tracking text-[10px] opacity-40">{user.displayName}</span>
                  <button onClick={() => { auth.signOut(); setMobileNavOpen(false); }}
                    className="caps-tracking flex items-center gap-1.5 hover:opacity-60 transition-opacity">
                    <LogOut size={12} /> Sign Out
                  </button>
                </div>
              ) : (
                <button onClick={() => { signInWithGoogle(); setMobileNavOpen(false); }}
                  className="w-full bg-brand text-white caps-tracking py-3 flex items-center justify-center gap-2 hover:bg-opacity-80 transition-all">
                  <LogIn size={13} /> Sign In / Log In
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-grow flex flex-col py-12 max-w-7xl mx-auto w-full">
        {/* Category Selector */}
        <div className="flex justify-center flex-wrap gap-x-5 gap-y-4 mb-16 px-4 md:px-8">
          {categories.map((cat) => {
            const isActive = category === cat.label;
            const isPremiumCat = (PREMIUM_CATEGORIES as readonly string[]).includes(cat.label);
            const isLocked = isPremiumCat && !isPremium;
            return (
              <button
                key={cat.label}
                onClick={() => {
                  setCategory(cat.label);
                  setOverrideQuestion(null);
                  if (isLocked) setShowPricing(true);
                }}
                className={cn(
                  'caps-tracking pb-2 pt-1 transition-all border-b-2 flex items-center gap-1.5 min-h-[40px]',
                  isActive ? 'border-brand opacity-100' : 'border-transparent opacity-40 hover:opacity-80',
                  isLocked && 'opacity-30 hover:opacity-60',
                )}
              >
                {isLocked && <Lock size={9} />}
                {cat.label}
                {isPremiumCat && !isLocked && (
                  <span className="text-[8px] caps-tracking bg-accent/20 text-accent px-1.5 py-0.5 rounded-sm leading-none">Pro</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Difficulty Selector */}
        <div className="flex justify-center gap-4 mb-12">
          {(['Light', 'Deep', 'Random'] as Difficulty[]).map((dif) => {
            const isActive = difficulty === dif;
            return (
              <button
                key={dif}
                onClick={() => { setDifficulty(dif); setOverrideQuestion(null); }}
                className={cn(
                  'px-5 py-3 text-[10px] caps-tracking border transition-all min-h-[44px]',
                  isActive ? 'bg-brand text-white border-brand' : 'border-brand/10 opacity-40 hover:opacity-100',
                )}
              >
                {dif}
              </button>
            );
          })}
        </div>

        {/* Question Packs */}
        <PackSelector
          packs={QUESTION_PACKS}
          activePack={activePack}
          packIndex={packIndex}
          isPremium={isPremium}
          onSelectPack={handleSelectPack}
          onExitPack={handleExitPack}
          onPackNext={handlePackNext}
          onPackPrev={handlePackPrev}
          onUpgrade={() => setShowPricing(true)}
        />

        {/* Question Area */}
        <div className="flex-grow flex flex-col justify-center px-8">
          <QuestionDisplay
            category={category}
            difficulty={difficulty}
            userProfile={userProfile}
            onUpgrade={() => setShowPricing(true)}
            isPremium={isPremium}
            shuffleKey={shuffleKey}
            overrideQuestion={overrideQuestion}
            onUsageIncremented={() => user && refreshProfile(user.uid)}
          />
        </div>

        {/* Upgrade / Pricing */}
        <div className="mt-12 w-full px-8 pb-12">
          {!userProfile?.isPremium && (
            <div className="border-t border-brand/10 pt-12 text-center">
              <span className="caps-tracking opacity-40 mb-4 block">Archive Access</span>
              <button
                onClick={() => setShowPricing(!showPricing)}
                className="text-2xl font-serif italic text-brand hover:opacity-60 transition-opacity block mx-auto mb-8"
              >
                {showPricing ? 'Continue Dialogue' : 'Unlock the complete archive of over 3,000 provocations'}
              </button>

              <AnimatePresence>
                {showPricing && <Pricing onSuccess={() => setShowPricing(false)} />}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="p-8 md:p-12 grid grid-cols-1 md:grid-cols-3 items-end border-t border-brand/10 max-w-7xl mx-auto w-full gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <span className="caps-tracking">Connection Verified</span>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => user ? setShowCollections(true) : signInWithGoogle()}
              className="caps-tracking border border-brand/20 px-4 py-2 hover:bg-brand hover:text-white transition-colors"
            >
              History
            </button>
            <button
              onClick={handleShuffle}
              className="caps-tracking border border-brand/20 px-4 py-2 hover:bg-brand hover:text-white transition-colors"
            >
              Randomize
            </button>
          </div>
        </div>

        <div className="hidden md:flex justify-center">
          <div className="w-12 h-12 border border-brand/10 rounded-full flex items-center justify-center">
            <span className="text-[10px] font-serif italic">DT</span>
          </div>
        </div>

        <div className="text-right space-y-3">
          <div className="flex gap-4 justify-end caps-tracking opacity-50">
            <Link to="/privacy" className="hover:opacity-100 transition-opacity">Privacy</Link>
            <Link to="/terms" className="hover:opacity-100 transition-opacity">Terms</Link>
            <Link to="/account" className="hover:opacity-100 transition-opacity">Account</Link>
          </div>
          <p className="caps-tracking opacity-40">&copy; 2026 Cultivating Meaningful Dialogue</p>
        </div>
      </footer>

      {/* Onboarding toasts — shown once to new users */}
      <OnboardingToast
        isSignedIn={!!user}
        referralLink={
          userProfile?.referralCode
            ? `${window.location.origin}/?ref=${userProfile.referralCode}`
            : undefined
        }
      />

      {/* Overlays */}
      <AnimatePresence>
        {showCollections && (
          <UserCollections
            onClose={() => setShowCollections(false)}
            onSelectQuestion={handleSelectQuestion}
          />
        )}
        {showSearch && (
          <SearchOverlay
            onClose={() => setShowSearch(false)}
            onSelectQuestion={handleSelectQuestion}
          />
        )}
        {showAbout && <AboutOverlay onClose={() => setShowAbout(false)} />}
        {showUsageDashboard && userProfile && (
          <UsageDashboard
            userProfile={userProfile}
            onClose={() => setShowUsageDashboard(false)}
            onUpgrade={() => { setShowUsageDashboard(false); setShowPricing(true); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
