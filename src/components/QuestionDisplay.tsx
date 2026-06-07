import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Share2, Heart, CheckCircle2,
  Twitter, Facebook, Linkedin, Instagram, Music,
  Copy, Check, Zap, Shuffle, Sparkles, MessageCircle, Send,
} from 'lucide-react';
import { db, auth, authedFetch } from '../lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { pickQuestion, poolSize } from '../data/questions';
import { generateUniqueQuestion, getCategoryGradient, getCategoryAccent } from '../services/questionService';
import { Category, DailyQuestion, OperationType, Difficulty, UserProfile } from '../types';
import { PLANS } from '../constants';
import { cn } from '../lib/utils';
import { handleFirestoreError } from '../lib/firestoreUtils';

interface QuestionDisplayProps {
  category: Category;
  difficulty: Difficulty;
  userProfile: UserProfile | null;
  shuffleKey?: number;
  overrideQuestion?: DailyQuestion | null;
  onUsageIncremented?: (newCount?: number) => void;
}

export default function QuestionDisplay({
  category,
  difficulty,
  userProfile,
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
  const [actionError, setActionError] = useState<string | null>(null);
  // Guard: prevent the consumption loop caused by usageCount changing after /api/consume
  // fires onUsageIncremented, which refreshes the profile, which would re-run the effect.
  const consumedRef = useRef(false);

  // Feedback-to-unlock (at the usage limit): share feedback → get free questions.
  const [feedbackText, setFeedbackText] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockMsg, setUnlockMsg] = useState<string | null>(null);

  const handleFeedbackUnlock = useCallback(async () => {
    const text = feedbackText.trim();
    if (text.length < 3) {
      setUnlockMsg('Please share a little more.');
      return;
    }
    setUnlocking(true);
    setUnlockMsg(null);
    try {
      const res = await authedFetch('/api/feedback-unlock', { text });
      const data = (await res.json()) as { ok?: boolean; granted?: number; onCooldown?: boolean; error?: string };
      if (res.ok && data.ok) {
        if (data.granted && data.granted > 0) {
          // Success — clear the box and refresh the profile, which lifts the wall
          // and drops the user straight onto their next question (no scrolling).
          setUnlockMsg('✓ Unlocked! Loading your next question…');
          setFeedbackText('');
          onUsageIncremented?.();
        } else if (data.onCooldown) {
          setUnlockMsg('Just a moment — try again in a few seconds.');
        } else {
          setUnlockMsg('Thanks for the feedback!');
        }
      } else {
        setUnlockMsg(data.error || 'Could not submit — please try again.');
      }
    } catch {
      setUnlockMsg('Could not submit — please try again.');
    } finally {
      setUnlocking(false);
    }
  }, [feedbackText, onUsageIncremented]);

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

  // Helper: optimistically tick the counter, then reconcile with the server.
  const consumeAndTick = useCallback(() => {
    // Step 1 — Optimistic local increment (instant UI feedback)
    const optimistic = (userProfile?.usageCount ?? 0) + 1;
    onUsageIncremented?.(optimistic);

    // Step 2 — Tell the server (fire-and-reconcile)
    authedFetch('/api/consume')
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          // Reconcile with the server's authoritative count
          if (typeof data.usageCount === 'number') {
            onUsageIncremented?.(data.usageCount);
          }
        } else {
          console.warn('[consume] server returned', res.status);
        }
      })
      .catch(err => console.warn('[consume] network error:', err));
    // Optimistic count stays even if the call fails — the server
    // is the real authority and will correct on next profile sync.
  }, [userProfile?.usageCount, onUsageIncremented]);

  // If a question is being overridden (pack navigation, search, collections),
  // show it and consume one usage credit so the header counter ticks up.
  useEffect(() => {
    if (!overrideQuestion) return;
    setDailyQuestion(overrideQuestion);
    setLoading(false); // clear the mount loading state (daily effect early-returns when overridden)
    setIsFavorited(false);
    setIsDiscussed(false);
    if (!auth.currentUser) return;
    loadInteractionState(overrideQuestion);
    consumeAndTick();
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
          consumeAndTick();
          try { await loadInteractionState(qData); } catch { /* ok */ }
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
      consumeAndTick();
    }
  }, [category, difficulty, loadInteractionState, consumeAndTick]);

  // Surprise me: a fresh Workers AI question — free for everyone (counts toward usage).
  const handleSurprise = useCallback(async () => {
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
  }, [category, difficulty, loadInteractionState]);

  const APP_URL = 'https://dinnertablecards.xyz';

  // Per-question share URL. Its server-rendered Open Graph title IS the question,
  // so Facebook/LinkedIn/iMessage/Slack previews (which ignore pre-filled text)
  // finally show the question instead of the generic site description.
  const questionShareUrl = () => {
    if (!dailyQuestion) return APP_URL;
    const params = new URLSearchParams({ t: dailyQuestion.text });
    if (dailyQuestion.category) params.set('c', dailyQuestion.category);
    return `${APP_URL}/q?${params.toString()}`;
  };

  const shareMessage = () =>
    dailyQuestion ? `"${dailyQuestion.text}"\n\nGet your free question at Dinner Table Cards 🃏` : '';

  // Native share sheet — the only way to reach Instagram/Stories and the best
  // path on mobile (full text + URL to ANY installed app). Falls back to copy.
  const handleShare = async () => {
    if (!dailyQuestion) return;
    const data = { title: 'Dinner Table Cards', text: shareMessage(), url: questionShareUrl() };
    if (navigator.share) {
      try { await navigator.share(data); return; } catch { /* cancelled — fall through */ }
    }
    copyToClipboard();
  };

  const copyToClipboard = () => {
    if (dailyQuestion) {
      navigator.clipboard.writeText(`${shareMessage()}\n${questionShareUrl()}`);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  };

  const getShareUrls = () => {
    if (!dailyQuestion) return { twitter: '', facebook: '', linkedin: '', whatsapp: '', telegram: '' };
    const text = encodeURIComponent(shareMessage());
    const url = encodeURIComponent(questionShareUrl());
    return {
      // X reads the text param, so the question shows in the post itself.
      twitter:  `https://x.com/intent/post?text=${text}&url=${url}`,
      // FB/LinkedIn ignore text — they build the preview from /q's OG tags.
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      // WhatsApp & Telegram accept full text + URL.
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareMessage()}\n${questionShareUrl()}`)}`,
      telegram: `https://t.me/share/url?url=${url}&text=${text}`,
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
      setActionError('Could not save favorite. Please try again.');
      setTimeout(() => setActionError(null), 4000);
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
      setActionError('Could not mark as discussed. Please try again.');
      setTimeout(() => setActionError(null), 4000);
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
          <div className="bg-paper/95 backdrop-blur-md border border-brand/20 rounded-sm px-8 py-9 max-w-sm w-full text-center shadow-2xl">
            <Sparkles className="mx-auto mb-4 text-accent" size={24} />
            <h2 className="font-serif text-2xl italic text-brand mb-2">Keep the conversation going</h2>
            <p className="font-serif italic text-brand/60 mb-5 text-sm leading-relaxed">
              Share one quick thought and we&rsquo;ll unlock <strong className="text-brand/80">25 more questions</strong> — free. Every time.
            </p>
            <div className="text-left">
              <textarea
                id="unlock-feedback"
                value={feedbackText}
                onChange={(e) => { setFeedbackText(e.target.value); setUnlockMsg(null); }}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleFeedbackUnlock(); } }}
                maxLength={1000}
                rows={3}
                autoFocus
                placeholder="One thing you loved, or one thing we should add…"
                className="w-full border border-brand/20 rounded-sm px-3 py-2 text-sm text-brand bg-white/70 outline-none focus:border-brand/50 resize-none mb-2"
              />
              {unlockMsg && (
                <p className={cn('text-[11px] mb-2', unlockMsg.startsWith('✓') ? 'text-accent' : 'text-red-600')}>{unlockMsg}</p>
              )}
              <button
                onClick={handleFeedbackUnlock}
                disabled={unlocking || feedbackText.trim().length < 3}
                className="caps-tracking bg-brand text-white px-6 py-3 w-full hover:bg-opacity-90 transition-all text-[11px] disabled:opacity-40"
              >
                {unlocking ? 'Unlocking…' : 'Share & unlock 25 free'}
              </button>
              <p className="mt-3 text-[9px] caps-tracking opacity-30">No payment, ever. Your feedback shapes what we build next.</p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Every category is free — there is no paid tier. (Premium gating removed.)

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
          className="mb-6 mx-auto max-w-lg bg-accent/10 border border-accent/20 rounded-sm px-6 py-3 text-center"
        >
          <p className="caps-tracking text-[10px] text-accent">
            {effectiveLimit - userProfile!.usageCount} question{effectiveLimit - userProfile!.usageCount !== 1 ? 's' : ''} left · share feedback any time to add 25 more — free
          </p>
        </motion.div>
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={dailyQuestion?.text}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="relative py-12 md:py-16 px-6 md:px-10 rounded-lg bg-white/30 border border-brand/[0.07] shadow-[0_1px_30px_-12px_rgba(26,26,26,0.15)]"
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

            {/* Action error toast — favorite/discuss failures */}
            {actionError && (
              <p className="text-[10px] caps-tracking text-red-600/80 max-w-xs text-center">
                {actionError}
              </p>
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
                title="Generate a unique question via Cloudflare Workers AI"
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
                ) : (
                  <><Sparkles size={12} /> Surprise Me</>
                )}
              </button>
            </div>

            {/* Social sharing */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mt-8">
              {/* Native share sheet — primary path (mobile reaches Instagram, WhatsApp, anything) */}
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-[10px] caps-tracking text-paper transition-all hover:bg-brand/90 active:scale-[0.98]"
                title="Share"
              >
                <Share2 size={13} /> Share
              </button>

              <div className="flex items-center gap-5 opacity-40 hover:opacity-100 transition-opacity">
                <a href={shareUrls.twitter} target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors" title="Share on X">
                  <Twitter size={18} />
                </a>
                <a href={shareUrls.whatsapp} target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors" title="Share on WhatsApp">
                  <MessageCircle size={18} />
                </a>
                <a href={shareUrls.telegram} target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors" title="Share on Telegram">
                  <Send size={18} />
                </a>
                <a href={shareUrls.facebook} target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors" title="Share on Facebook">
                  <Facebook size={18} />
                </a>
                <a href={shareUrls.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors" title="Share on LinkedIn">
                  <Linkedin size={18} />
                </a>
                <button onClick={handleShare} className="hover:text-accent transition-colors" title="Share to Instagram (opens share sheet)">
                  <Instagram size={18} />
                </button>
                <button onClick={handleShare} className="hover:text-accent transition-colors" title="Share to TikTok (opens share sheet)">
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
