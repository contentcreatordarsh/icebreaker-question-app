/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Link } from 'react-router-dom';
import { auth, db, signInWithGoogle, authedFetch } from './lib/firebase';
import { doc, getDoc, getDocFromServer, setDoc, serverTimestamp } from 'firebase/firestore';
import { AnimatePresence } from 'motion/react';
import { LogIn, LogOut, Coffee, Smile, MessageCircle, Briefcase, Search, BookOpen, Info, Menu, X as XIcon, Heart, Lightbulb, Zap, Play } from 'lucide-react';
import QuestionDisplay from './components/QuestionDisplay';
import PackSelector from './components/PackSelector';
import OnboardingToast from './components/OnboardingToast';
import AdSlot from './components/AdSlot';
import { ADSENSE_SLOT_HOME } from './lib/ads';

// Lazy-load overlay/modal components — they're behind user interaction and
// not needed on first paint. Keeps the initial bundle small.
const SearchOverlay = lazy(() => import('./components/SearchOverlay'));
const AboutOverlay = lazy(() => import('./components/AboutOverlay'));
const UsageDashboard = lazy(() => import('./components/UsageDashboard'));
const UserCollections = lazy(() => import('./components/UserCollections'));
import { Category, Difficulty, UserProfile, DailyQuestion, QuestionPack } from './types';
import { QUESTION_PACKS } from './data/packs';
import { TOPICS } from './data/topics';
import { pickTopicQuestion } from './data/questions';
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

  // Topics (two-level: parent group expanded + active leaf pool)
  const [activeTopicParent, setActiveTopicParent] = useState<string | null>(null);
  const [activeTopicLeaf, setActiveTopicLeaf] = useState<string | null>(null);

  // ── Profile sync ────────────────────────────────────────────────────────────
  const refreshProfile = useCallback(async (_uid: string) => {
    // Fetch profile from server — uses the service account, bypasses Firestore
    // security rules, and always returns the latest server-side values.
    try {
      const res = await authedFetch('/api/profile');
      if (res.ok) {
        const { profile } = await res.json();
        if (profile) { setUserProfile(profile as UserProfile); return; }
      }
    } catch { /* fall through */ }

    // Fallback: try direct Firestore reads
    try {
      const docRef = doc(db, 'users', _uid);
      const snap = await getDocFromServer(docRef);
      if (snap.exists()) setUserProfile(snap.data() as UserProfile);
    } catch {
      try {
        const docRef = doc(db, 'users', _uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) setUserProfile(snap.data() as UserProfile);
      } catch { /* give up silently */ }
    }
  }, []);

  useEffect(() => {
    async function syncProfile() {
      if (!user) { setUserProfile(null); return; }

      // Fetch (or auto-create) the profile via our server endpoint. This
      // uses the service account, so it works even when the Firestore client
      // SDK can't access the named database due to security rules.
      try {
        const res = await authedFetch('/api/profile');
        if (res.ok) {
          const { profile } = await res.json();
          if (profile) {
            setUserProfile(profile as UserProfile);

            // Backfill referral code for users created before this feature shipped.
            if (!(profile as UserProfile).referralCode) {
              const code = makeReferralCode(user.uid);
              await registerReferral(code);
              // Also write the referral code to Firestore via the server next time.
              setUserProfile({ ...(profile as UserProfile), referralCode: code });
            }

            // Attribute any inbound referral captured before sign-in.
            const pendingReferral = localStorage.getItem('pendingReferral') || undefined;
            if (pendingReferral) {
              await registerReferral(
                (profile as UserProfile).referralCode || makeReferralCode(user.uid),
                pendingReferral,
              );
              localStorage.removeItem('pendingReferral');
              setTimeout(() => refreshProfile(user.uid), 1500);
            }
            return; // done
          }
        }
      } catch (err) {
        console.warn('Server profile fetch failed, trying Firestore directly:', err);
      }

      // Fallback: read/create via client-side Firestore (works when the
      // named database security rules allow it).
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const existing = docSnap.data() as UserProfile;
          setUserProfile(existing);
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

          const pendingReferral = localStorage.getItem('pendingReferral') || undefined;
          await registerReferral(referralCode, pendingReferral);
          if (pendingReferral) {
            localStorage.removeItem('pendingReferral');
            setTimeout(() => refreshProfile(user.uid), 1500);
          }
        }
      } catch (err) {
        console.error('Firestore profile sync also failed:', err);
        // Last resort: set a minimal local profile so the UI isn't stuck.
        setUserProfile({
          uid: user.uid,
          email: user.email || '',
          isPremium: false,
          subscriptionPlan: 'free',
          subscriptionStatus: 'none',
          lifetimePurchase: false,
          usageCount: 0,
          createdAt: new Date().toISOString(),
          referralCode: makeReferralCode(user.uid),
          referralCount: 0,
          bonusQuestions: 0,
        });
      }
    }
    syncProfile();
  }, [user, refreshProfile]);

  // Note: Google redirect sign-in is finalised centrally in main.tsx (runs on
  // every route, since the redirect can land on /play, /host, etc. — not just "/").

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
    // If a topic is active, re-pick from that topic pool instead of the daily bank.
    if (activeTopicLeaf) {
      setOverrideQuestion(pickTopicQuestion(activeTopicLeaf, difficulty));
      return;
    }
    setOverrideQuestion(null);
    setShuffleKey(k => k + 1);
  }, [activeTopicLeaf, difficulty]);

  // ── Topic handlers ───────────────────────────────────────────────────────────
  const handleSelectTopic = useCallback((leafId: string) => {
    setActivePack(null);
    setCategory('Icebreaker'); // neutral, non-premium category for the gate
    setActiveTopicLeaf(leafId);
    setOverrideQuestion(pickTopicQuestion(leafId, difficulty));
  }, [difficulty]);

  // ── Pack handlers ────────────────────────────────────────────────────────────
  const packQuestionToOverride = useCallback((pack: QuestionPack, idx: number): DailyQuestion => ({
    date: new Date().toISOString().split('T')[0],
    questionId: `pack-${pack.id}-${idx}`,
    text: pack.questions[idx].text,
    category: 'Icebreaker', // generic — pack questions bypass category logic
  }), []);

  const handleSelectPack = useCallback((pack: QuestionPack) => {
    setActivePack(pack);
    setActiveTopicLeaf(null);
    setActiveTopicParent(null);
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
      {/* Skip-to-content link — visible only on keyboard focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-paper focus:text-xs"
      >
        Skip to content
      </a>

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
            <nav aria-label="Main navigation" className="flex items-center gap-4 mt-2">
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
              <Link to="/play" className="caps-tracking hover:opacity-60 transition-opacity flex items-center gap-1.5">
                <Play size={11} /> Live
              </Link>

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
                            ? '∞'
                            : PLANS[userProfile?.subscriptionPlan || 'free'].limit + (userProfile?.bonusQuestions ?? 0)
                        }
                      </span>
                    </div>
                  </button>
                  {(userProfile?.currentStreak ?? 0) > 0 && (
                    <span
                      className="caps-tracking text-[10px] opacity-60 flex items-center gap-1"
                      title={`${userProfile?.currentStreak}-day streak`}
                    >
                      🔥 {userProfile?.currentStreak}
                    </span>
                  )}
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

            </nav>
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
            <Link to="/play" onClick={() => setMobileNavOpen(false)}
              className="caps-tracking flex items-center gap-2 py-2 hover:opacity-60 transition-opacity">
              <Play size={13} /> Live Session
            </Link>
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

      <main id="main-content" className="flex-grow flex flex-col py-12 max-w-7xl mx-auto w-full">
        {/* Live-session CTA — prominent entry so hosting isn't buried in the nav */}
        <div className="px-4 md:px-8 mb-14">
          <Link
            to="/play"
            className="group mx-auto flex max-w-2xl items-center gap-4 rounded-2xl border border-brand/15 bg-accent/[0.06] p-4 sm:p-5 transition-all hover:border-accent/40 hover:shadow-md"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-white">
              <Play size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-serif text-lg italic text-brand">Host a Live Session</span>
              <span className="block text-sm leading-snug text-brand/55">
                Everyone answers the same question on their phones, then reveal &amp; vote — perfect for dinners &amp; teams.
              </span>
            </span>
            <span className="hidden shrink-0 caps-tracking text-[10px] text-accent opacity-60 transition-opacity group-hover:opacity-100 sm:block">
              Start&nbsp;&rarr;
            </span>
          </Link>
        </div>

        {/* Category Selector */}
        <p className="text-center text-[10px] uppercase tracking-[0.3em] text-brand/30 mb-4 px-4">
          Choose a theme
        </p>
        <div className="flex justify-center flex-wrap gap-x-5 gap-y-4 mb-12 px-4 md:px-8">
          {categories.map((cat) => {
            const isActive = category === cat.label;
            return (
              <button
                key={cat.label}
                onClick={() => {
                  setCategory(cat.label);
                  setOverrideQuestion(null);
                  setActiveTopicLeaf(null);
                  setActiveTopicParent(null);
                }}
                className={cn(
                  'caps-tracking pb-2 pt-1 transition-all border-b-2 flex items-center gap-1.5 min-h-[40px]',
                  isActive ? 'border-brand opacity-100' : 'border-transparent opacity-40 hover:opacity-80',
                )}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Difficulty Selector */}
        <p className="text-center text-[10px] uppercase tracking-[0.3em] text-brand/30 mb-4 px-4">
          How deep? <span className="normal-case tracking-normal opacity-70">· Light = playful, Deep = meaningful</span>
        </p>
        <div className="flex justify-center gap-4 mb-12">
          {(['Light', 'Deep', 'Random'] as Difficulty[]).map((dif) => {
            const isActive = difficulty === dif;
            return (
              <button
                key={dif}
                onClick={() => {
                  setDifficulty(dif);
                  if (activeTopicLeaf) setOverrideQuestion(pickTopicQuestion(activeTopicLeaf, dif));
                  else setOverrideQuestion(null);
                }}
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

        {/* Topics — two-level selector (parent group → sub-topic pool) */}
        <div className="mb-12 px-4 md:px-8">
          <div className="text-center mb-5">
            <span className="caps-tracking opacity-40">Explore by Topic</span>
          </div>
          <div className="flex justify-center flex-wrap gap-2.5 mb-4">
            {TOPICS.map((group) => {
              const isOpen = activeTopicParent === group.id;
              return (
                <button
                  key={group.id}
                  onClick={() => setActiveTopicParent(isOpen ? null : group.id)}
                  className={cn(
                    'caps-tracking text-[10px] px-4 py-2 rounded-full border transition-all flex items-center gap-1.5 min-h-[36px]',
                    isOpen ? 'bg-brand text-white border-brand' : 'border-brand/15 opacity-60 hover:opacity-100',
                  )}
                >
                  <span aria-hidden>{group.emoji}</span> {group.label}
                </button>
              );
            })}
          </div>
          {activeTopicParent && (
            <div className="flex justify-center flex-wrap gap-2">
              {TOPICS.find(g => g.id === activeTopicParent)?.children.map((leaf) => {
                const isActive = activeTopicLeaf === leaf.id;
                return (
                  <button
                    key={leaf.id}
                    onClick={() => handleSelectTopic(leaf.id)}
                    className={cn(
                      'caps-tracking text-[10px] px-3.5 py-1.5 rounded-full border transition-all min-h-[32px]',
                      isActive ? 'bg-accent text-white border-accent' : 'border-brand/10 opacity-50 hover:opacity-100',
                    )}
                  >
                    {leaf.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Question Packs */}
        <PackSelector
          packs={QUESTION_PACKS}
          activePack={activePack}
          packIndex={packIndex}
          isPremium={true} /* all content is free — no paid tier */
          onSelectPack={handleSelectPack}
          onExitPack={handleExitPack}
          onPackNext={handlePackNext}
          onPackPrev={handlePackPrev}
          onUpgrade={() => {}}
        />

        {/* Question Area */}
        <div className="flex-grow flex flex-col justify-center px-8">
          <QuestionDisplay
            // Remount when the active topic changes so a topic switch always
            // shows a fresh question (inert when no topic is selected).
            key={activeTopicLeaf ?? 'main'}
            category={category}
            difficulty={difficulty}
            userProfile={userProfile}
            shuffleKey={shuffleKey}
            overrideQuestion={overrideQuestion}
            onUsageIncremented={(newCount?: number) => {
              if (newCount !== undefined) {
                // Use the server's authoritative count directly — no Firestore read needed.
                setUserProfile(prev => {
                  if (prev) return { ...prev, usageCount: newCount };
                  // Profile hasn't loaded yet — create a minimal placeholder.
                  return {
                    uid: user?.uid || '',
                    email: user?.email || '',
                    isPremium: false,
                    subscriptionPlan: 'free' as const,
                    subscriptionStatus: 'none' as const,
                    lifetimePurchase: false,
                    usageCount: newCount,
                    createdAt: new Date().toISOString(),
                    referralCode: '',
                    referralCount: 0,
                    bonusQuestions: 0,
                  };
                });
              } else if (user) {
                // Fallback: re-read from Firestore (e.g. on non-OK response).
                refreshProfile(user.uid);
              }
            }}
          />
        </div>

      </main>

      {/* Ad unit — hidden until a real ad fills (invisible before approval / when
          unfilled). Consent is handled by Google's CMP. Kept off the live-game
          screens (separate routes) to stay non-intrusive. */}
      <AdSlot slot={ADSENSE_SLOT_HOME} />

      {/* Footer */}
      <footer className="p-8 md:p-12 grid grid-cols-1 md:grid-cols-3 items-end border-t border-brand/10 max-w-7xl mx-auto w-full gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <span className="caps-tracking">Works Offline</span>
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

        <div className="hidden md:flex flex-col items-center gap-3">
          <div className="w-12 h-12 border border-brand/10 rounded-full flex items-center justify-center">
            <span className="text-[10px] font-serif italic">DT</span>
          </div>
          <div className="flex items-center gap-3 opacity-40">
            <a
              href="https://x.com/hegdedarsh/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-100 transition-opacity"
              aria-label="Follow us on X (Twitter)"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="mailto:contentcreatordarsh@gmail.com"
              className="hover:opacity-100 transition-opacity"
              aria-label="Contact us via email"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </a>
          </div>
        </div>

        <div className="text-right space-y-3">
          <div className="flex gap-4 justify-end caps-tracking opacity-50 flex-wrap">
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

      {/* Overlays — lazy-loaded, wrapped in Suspense */}
      <Suspense fallback={null}>
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
            />
          )}
        </AnimatePresence>
      </Suspense>
    </div>
  );
}
