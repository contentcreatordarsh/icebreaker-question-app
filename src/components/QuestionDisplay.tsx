import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Share2, Heart, CheckCircle2,
  Twitter, Facebook, Linkedin, Instagram, Music,
  Copy, Check, Zap, Shuffle, Sparkles, Lock,
} from 'lucide-react';
import { db, auth, authedFetch } from '../lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { pickQuestion, poolSize } from '../data/questions';
import { generateUniqueQuestion, getCategoryGradient, getCategoryAccent } from '../services/questionService';
import { Category, DailyQuestion, OperationType, Difficulty, UserProfile, PREMIUM_CATEGORIES } from '../types';
import { PLANS } from '../constants';
import { cn } from '../lib/utils';
import { handleFirestoreError } from '../lib/firestoreUtils';

interface QuestionDisplayProps {
  isPremium: boolean;
  category: Category;
  difficulty: Difficulty;
  userProfile: UserProfile | null;
  onUpgrade: () => void;
  shuffleKey?: number;
  overrideQuestion?: DailyQuestion | null;
  onUsageIncremented?: () => void;
}

export default function QuestionDisplay({
  isPremium,
  category,
  difficulty,
  userProfile,
  onUpgrade,
  shuffleKey = 0,
  overrideQuestion = null,
  onUsageIncremented,
}: QuestionDisplayProps) {
  const [dailyQuestion, setDailyQuestion] = useState<DailyQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isDiscussed, setIsDiscussed] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [surpriseLoading, setSurpriseLoading] = useState(false);
  const [surpriseError, setSurpriseError] = useState<string | null>(null);
  // Guard: prevent the consumption loop caused by usageCount changing after /api/consume
  // fires onUsageIncremented, which refreshes the profile, which would re-run the effect.
  const consumedRef = useRef(false);

  const gradient = getCategoryGradient(category);
  const accent = getCategoryAccent(category);

  const loadInteractionState = useCallback(async (q: DailyQuestion) => {
    if (!auth.currentUser) return;
    const favRef  = doc(db, 'users', auth.currentUser.uid, 'favorites', q.questionId);
    const histRef = doc(db, 'users', auth.currentUser.uid, 'history',   q.questionId);
    const [favSnap, histSnap] = await Promise.all([getDoc(favRef), getDoc(histRef)]);
    setIsFavorited(favSnap.exists());
    setIsDiscussed(histSnap.exists());
  }, []);

  // If a question is being overridden (pack navigation, search, collections),
  // show it and consume one usage credit so the header counter ticks up.
  useEffect(() => {
    if (!overrideQuestion) return;
    setDailyQuestion(overrideQuestion);
    setIsFavorited(false);
    setIsDiscussed(false);
    if (!auth.currentUser) return;
    loadInteractionState(overrideQuestion);
    // Consume asynchronously — don't block the UI render
    authedFetch('/api/consume')
      .then(() => onUsageIncremented?.())
      .catch(err => console.warn('Override consume failed:', err));
  }, [overrideQuestion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load today's daily question (cached in Firestore, generated from bank if missing).
  // IMPORTANT: userProfile?.usageCount is intentionally NOT in the deps array.
  // Including it causes a consumption loop: /api/consume → onUsageIncremented →
  // profile refresh → usageCount changes → effect re-fires → /api/consume again.
  // The isAtLimit variable (derived outside the effect) handles the upgrade wall.
  useEffect(() => {
    // Don't overwrite an overridden question
    if (overrideQuestion) return;

    // Reset the consume guard whenever a genuinely new question should be fetched
    // (category/difficulty change, shuffle, or app first load).
    consumedRef.current = false;

    async function fetchDailyQuestion() {
      // Wait until the profile has loaded before checking the limit.
      // If the profile isn't loaded yet, show the question anyway — the
      // isAtLimit check (rendered outside this effect) will show the wall once
      // the profile arrives, and the server's /api/consume is the real authority.
      const effectiveLimit =
        userProfile
          ? (PLANS[userProfile.subscriptionPlan || 'free'].limit + (userProfile.bonusQuestions ?? 0))
          : Infinity;

      if (userProfile && userProfile.usageCount >= effectiveLimit) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const today  = new Date().toISOString().split('T')[0];
      const docRef = doc(db, 'daily_questions', `${today}_${category}_${difficulty}`);

      try {
        const docSnap = await getDoc(docRef);
        let qData: DailyQuestion;

        if (docSnap.exists() && shuffleKey === 0) {
          // Use cached daily question (consistent for all users today)
          qData = docSnap.data() as DailyQuestion;
        } else {
          // shuffleKey > 0 means user hit Randomize/New Question — pick fresh
          const picked = pickQuestion(category, difficulty);
          qData = picked as DailyQuestion;
          if (shuffleKey === 0) {
            try { await setDoc(docRef, qData); } catch { /* offline — fine */ }
          }
        }

        setDailyQuestion(qData);

        // Only consume once per effect run — the ref guards against double-fires
        // in React Strict Mode and prevents the usageCount-change loop.
        if (auth.currentUser && !consumedRef.current) {
          consumedRef.current = true;
          try {
            const res = await authedFetch('/api/consume');
            // Refresh the profile — on 402 this surfaces the blur gate.
            onUsageIncremented?.();
            if (res.ok) await loadInteractionState(qData);
          } catch (err) {
            console.warn('Usage consume failed:', err);
          }
        }
      } catch (error) {
        console.error('Error fetching daily question:', error);
        setDailyQuestion(pickQuestion(category, difficulty) as DailyQuestion);
      } finally {
        setLoading(false);
      }
    }

    fetchDailyQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, difficulty, shuffleKey, overrideQuestion]);

  // Shuffle: pick a fresh question from the bank and consume one usage credit.
  const handleShuffle = useCallback(async () => {
    setIsFavorited(false);
    setIsDiscussed(false);
    const q = pickQuestion(category, difficulty) as DailyQuestion;
    setDailyQuestion(q);
    if (auth.currentUser) {
      loadInteractionState(q);
      try {
        await authedFetch('/api/consume');
        onUsageIncremented?.(); // updates the header counter (0→1→2…)
      } catch (err) {
        console.warn('Shuffle consume failed:', err);
      }
    }
  }, [category, difficulty, loadInteractionState, onUsageIncremented]);

  // Surprise me: Workers AI — premium only. Gate free users to the upgrade modal.
  const handleSurprise = useCallback(async () => {
    if (!isPremium) {
      onUpgrade();
      return;
    }
    setSurpriseLoading(true);
    setSurpriseError(null);
    setIsFavorited(false);
    setIsDiscussed(false);
    try {
      const q = await generateUniqueQuestion(category, difficulty);
      setDailyQuestion(q as DailyQuestion);
      if (auth.currentUser && q.questionId) {
        // Await so errors are caught below instead of becoming unhandled rejections.
        await loadInteractionState(q as DailyQuestion).catch(() => {});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed — please try again.';
      setSurpriseError(msg);
      console.error('Surprise generation failed:', err);
    } finally {
      setSurpriseLoading(false);
    }
  }, [category, difficulty, loadInteractionState, isPremium, onUpgrade]);

  const APP_URL = 'https://dinnertablecards.xyz';

  const handleShare = () => {
    if (dailyQuestion) {
      navigator.share?.({
        title: 'Dinner Table Cards',
        text: `"${dailyQuestion.text}"\n\nGet your free question at dinnertablecards.xyz 🃏`,
        url: APP_URL,
      }).catch(() => {});
    }
  };

  const copyToClipboard = () => {
    if (dailyQuestion) {
      navigator.clipboard.writeText(
        `"${dailyQuestion.text}"\n\nGet your free question at dinnertablecards.xyz 🃏`
      );
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  };

  const getShareUrls = () => {
    if (!dailyQuestion) return { twitter: '', facebook: '', linkedin: '' };
    const shareText = `"${dailyQuestion.text}"\n\nGet your free question at dinnertablecards.xyz 🃏`;
    const text = encodeURIComponent(shareText);
    const url  = encodeURIComponent(APP_URL);
    return {
      twitter:  `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    };
  };

  const toggleFavorite = async () => {
    if (!auth.currentUser || !dailyQuestion) return;
    const favRef = doc(db, 'users', auth.currentUser.uid, 'favorites', dailyQuestion.questionId);
    try {
      if (isFavorited) {
        await deleteDoc(favRef);
        setIsFavorited(false);
      } else {
        await setDoc(favRef, { ...dailyQuestion, savedAt: serverTimestamp() });
        setIsFavorited(true);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}/favorites/${dailyQuestion.questionId}`);
    }
  };

  const markDiscussed = async () => {
    if (!auth.currentUser || !dailyQuestion || isDiscussed) return;
    const histRef = doc(db, 'users', auth.currentUser.uid, 'history', dailyQuestion.questionId);
    try {
      await setDoc(histRef, { ...dailyQuestion, discussedAt: serverTimestamp() });
      setIsDiscussed(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}/history/${dailyQuestion.questionId}`);
    }
  };

  // ── Usage limit wall — blurred preview with upgrade CTA ──────────────────
  const plan = userProfile ? PLANS[userProfile.subscriptionPlan || 'free'] : null;
  const effectiveLimit = (plan?.limit ?? Infinity) + (userProfile?.bonusQuestions ?? 0);
  const isAtLimit = !!userProfile && userProfile.usageCount >= effectiveLimit;
  const isNearingLimit = !!userProfile && !isAtLimit && userProfile.usageCount >= effectiveLimit - 3;

  if (isAtLimit) {
    // Pick a preview question from the bank — just for the blurred backdrop
    const preview = pickQuestion(category, difficulty);
    return (
      <div className="relative w-full max-w-4xl mx-auto text-center px-4 py-12 min-h-[400px]">
        {/* Blurred question backdrop */}
        <div className="select-none pointer-events-none" style={{ filter: 'blur(10px)', opacity: 0.4 }}>
          <span className="caps-tracking opacity-40 mb-12 block">The Daily Provocation</span>
          <h2 className="font-serif text-5xl md:text-7xl leading-[1.1] text-brand mb-10 tracking-tighter">
            {preview.text}
          </h2>
        </div>

        {/* Glass overlay */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          <div className="bg-paper/90 backdrop-blur-md border border-brand/20 rounded-sm px-10 py-10 max-w-sm text-center shadow-2xl">
            <Sparkles className="mx-auto mb-4 text-accent" size={24} />
            <h2 className="font-serif text-2xl italic text-brand mb-3">Unlock the Complete Archive</h2>
            <p className="font-serif italic text-brand/60 mb-6 text-sm leading-relaxed">
              You've explored your free questions. Upgrade to keep the conversation going — over 3,000 more await.
            </p>
            <button
              onClick={onUpgrade}
              className="caps-tracking bg-brand text-white px-8 py-3 w-full hover:bg-opacity-90 transition-all text-[11px] mb-3"
            >
              Unlock the Archive
            </button>
            <p className="text-[9px] caps-tracking opacity-30">From $2/month · Cancel anytime</p>
            <div className="mt-4 pt-4 border-t border-brand/10">
              <p className="text-[9px] caps-tracking opacity-40 text-center">
                Or invite a friend —{' '}
                <button
                  onClick={onUpgrade}
                  className="underline hover:opacity-60 transition-opacity"
                >
                  earn 50 free questions
                </button>
                {' '}via your profile
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Premium category gate ─────────────────────────────────────────────────
  const isPremiumCategory = (PREMIUM_CATEGORIES as readonly string[]).includes(category);
  if (isPremiumCategory && !isPremium) {
    const preview = pickQuestion('Deep Talk', difficulty);
    return (
      <div className="relative w-full max-w-4xl mx-auto text-center px-4 py-12 min-h-[400px]">
        {/* Blurred free question as backdrop */}
        <div className="select-none pointer-events-none" style={{ filter: 'blur(12px)', opacity: 0.3 }}>
          <span className="caps-tracking opacity-40 mb-12 block">The Daily Provocation</span>
          <h2 className="font-serif text-5xl md:text-7xl leading-[1.1] text-brand mb-10 tracking-tighter">
            {preview.text}
          </h2>
        </div>
        {/* Upgrade overlay */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 flex flex-col items-center justify-center px-4"
        >
          <div className="bg-paper/95 backdrop-blur-md border border-brand/20 rounded-sm px-10 py-10 max-w-sm text-center shadow-2xl">
            <Sparkles className="mx-auto mb-4 text-accent" size={22} />
            <p className="text-[9px] caps-tracking opacity-40 mb-2">{category}</p>
            <h2 className="font-serif text-2xl italic text-brand mb-3">Premium Category</h2>
            <p className="font-serif italic text-brand/60 mb-6 text-sm leading-relaxed">
              Unlock {category} along with Philosophy, Creative Sparks, and the full archive.
            </p>
            <button
              onClick={onUpgrade}
              className="caps-tracking bg-brand text-white px-8 py-3 w-full hover:bg-opacity-90 transition-all text-[11px] mb-3"
            >
              Unlock from $2/month
            </button>
            <p className="text-[9px] caps-tracking opacity-30">Cancel anytime · No commitment</p>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[300px]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-brand/20 border-t-brand rounded-full mb-4"
        />
        <p className="caps-tracking opacity-40">Selecting today's provocation…</p>
      </div>
    );
  }

  const shareUrls = getShareUrls();

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-4xl mx-auto text-center px-4">
      {/* Approaching-limit nudge banner */}
      {isNearingLimit && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 mx-auto max-w-lg bg-accent/10 border border-accent/20 rounded-sm px-6 py-3 flex items-center justify-between gap-4"
        >
          <p className="caps-tracking text-[10px] text-accent">
            {effectiveLimit - userProfile!.usageCount} question{effectiveLimit - userProfile!.usageCount !== 1 ? 's' : ''} remaining on your free plan
          </p>
          <button
            onClick={onUpgrade}
            className="caps-tracking text-[9px] border border-accent/30 bg-accent/5 px-3 py-1.5 text-accent hover:bg-accent/20 transition-colors whitespace-nowrap"
          >
            Unlock more
          </button>
        </motion.div>
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={dailyQuestion?.text}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="relative py-12"
        >
          <span className="caps-tracking opacity-40 mb-12 block">The Daily Provocation</span>

          <h2 className="font-serif text-4xl sm:text-5xl md:text-7xl leading-[1.1] text-brand mb-10 tracking-tighter">
            {dailyQuestion?.text}
          </h2>

          <div className="h-[1px] w-24 bg-brand mx-auto opacity-20 mb-10" />

          <div className="flex flex-col items-center gap-6">
            <p className="text-xl italic text-brand/60 max-w-xl mx-auto leading-relaxed">
              Sharing depth is encouraged, but introspection is mandatory.
            </p>

            {/* Primary action buttons */}
            <div className="flex flex-wrap justify-center gap-4 pt-4">
              <button
                onClick={() => setShowShareCard(true)}
                className="caps-tracking border border-accent/40 bg-accent/5 text-accent px-6 py-3 hover:bg-accent hover:text-white transition-all flex items-center gap-2"
              >
                <Share2 size={14} /> Share Card
              </button>

              <button
                onClick={toggleFavorite}
                disabled={!auth.currentUser}
                className={cn(
                  'caps-tracking border border-brand/20 px-6 py-3 transition-all flex items-center gap-2 disabled:opacity-20',
                  isFavorited ? 'bg-brand text-white border-brand' : 'hover:bg-brand hover:text-white',
                )}
              >
                <Heart size={14} className={cn(isFavorited && 'fill-current')} />
                {isFavorited ? 'Favorited' : 'Favorite'}
              </button>

              <button
                onClick={markDiscussed}
                disabled={!auth.currentUser || isDiscussed}
                className={cn(
                  'caps-tracking border border-brand/20 px-6 py-3 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed',
                  isDiscussed ? 'bg-accent/10 border-accent/20 text-accent' : 'hover:bg-brand hover:text-white',
                )}
              >
                <CheckCircle2 size={14} />
                {isDiscussed ? 'Discussed' : 'Mark Discussed'}
              </button>

            </div>

            {!auth.currentUser && (
              <p className="text-[10px] caps-tracking opacity-30">Sign in to save progress</p>
            )}

            {/* Surprise Me error — rate limit or generation failure */}
            {surpriseError && (
              <p className="text-[10px] caps-tracking text-red-600/80 max-w-xs text-center">
                {surpriseError}
              </p>
            )}

            {/* Shuffle / Surprise me */}
            <div className="flex flex-wrap justify-center gap-4 pt-2">
              <button
                onClick={handleShuffle}
                className="caps-tracking border border-brand/10 px-5 py-2.5 opacity-50 hover:opacity-100 hover:border-brand/30 transition-all flex items-center gap-2 text-[10px]"
                title={`${poolSize(category, difficulty)} questions available`}
              >
                <Shuffle size={12} /> New Question
              </button>

              <button
                onClick={handleSurprise}
                disabled={surpriseLoading}
                className="caps-tracking border border-brand/10 px-5 py-2.5 opacity-50 hover:opacity-100 hover:border-brand/30 transition-all flex items-center gap-2 text-[10px] disabled:opacity-30"
                title={isPremium ? 'Generate a unique question via Cloudflare Workers AI' : 'Premium feature — upgrade to unlock'}
              >
                {surpriseLoading ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-3 h-3 border border-brand/40 border-t-brand rounded-full"
                    />
                    Generating…
                  </>
                ) : isPremium ? (
                  <><Sparkles size={12} /> Surprise Me</>
                ) : (
                  <><Lock size={12} /> Surprise Me</>
                )}
              </button>
            </div>

            {/* Social sharing */}
            <div className="flex items-center gap-6 mt-8">
              <div className="flex gap-6 opacity-40 hover:opacity-100 transition-opacity">
                <a href={shareUrls.twitter} target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors" title="Share on Twitter">
                  <Twitter size={18} />
                </a>
                <a href={shareUrls.facebook} target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors" title="Share on Facebook">
                  <Facebook size={18} />
                </a>
                <a href={shareUrls.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors" title="Share on LinkedIn">
                  <Linkedin size={18} />
                </a>
                <button onClick={copyToClipboard} className="hover:text-accent transition-colors" title="Copy for Instagram">
                  <Instagram size={18} />
                </button>
                <button onClick={copyToClipboard} className="hover:text-accent transition-colors" title="Copy for TikTok">
                  <Music size={18} />
                </button>
              </div>

              <div className="h-4 w-[1px] bg-brand/10" />

              <button
                onClick={copyToClipboard}
                className={cn(
                  'flex items-center gap-2 text-[10px] caps-tracking transition-all',
                  copyFeedback ? 'text-accent' : 'opacity-40 hover:opacity-100',
                )}
              >
                {copyFeedback ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy Link</>}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Share Card Modal */}
      <AnimatePresence>
        {showShareCard && dailyQuestion && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-brand/90 backdrop-blur-md flex items-center justify-center p-4"
          >
            <div className="max-w-md w-full flex flex-col gap-6">
              {/* Card */}
              <div
                className="relative aspect-square border-[12px] border-white shadow-2xl overflow-hidden"
                style={{ background: gradient }}
              >
                {/* Decorative corner accent */}
                <div
                  className="absolute top-0 left-0 w-20 h-20 opacity-20"
                  style={{ background: `radial-gradient(circle at 0% 0%, ${accent}, transparent 70%)` }}
                />
                <div
                  className="absolute bottom-0 right-0 w-32 h-32 opacity-10"
                  style={{ background: `radial-gradient(circle at 100% 100%, ${accent}, transparent 70%)` }}
                />

                <div className="relative h-full flex flex-col justify-between p-6 sm:p-10 text-left">
                  <div className="flex flex-col">
                    <span className="text-[8px] tracking-[0.4em] uppercase mb-1 opacity-60">
                      Issue {new Date().getFullYear()} / {dailyQuestion.category}
                    </span>
                    <div className="h-[1px] w-8 opacity-20" style={{ background: accent }} />
                  </div>

                  <h3 className="font-serif text-2xl sm:text-3xl italic leading-tight text-brand tracking-tight">
                    "{dailyQuestion.text}"
                  </h3>

                  <div className="flex justify-between items-end">
                    <div className="text-[8px] tracking-[0.3em] font-sans uppercase opacity-40">
                      Dinner Table<br />Cards
                    </div>
                    <div className="w-8 h-8 border border-brand/10 rounded-full flex items-center justify-center">
                      <span className="text-[8px] font-serif italic text-brand">DT</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={copyToClipboard}
                  className="flex-1 bg-white text-brand caps-tracking py-4 hover:bg-paper transition-all flex items-center justify-center gap-2"
                >
                  {copyFeedback ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Question</>}
                </button>
                <button
                  onClick={() => setShowShareCard(false)}
                  className="flex-1 border border-white/20 text-white caps-tracking py-4 hover:bg-white/10 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
