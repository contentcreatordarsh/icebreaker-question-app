import { Link } from 'react-router-dom';
import { Heart, Zap, BookOpen, ArrowRight, Lock, Star, ChevronDown, Users, MessageSquare, Sparkles } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'motion/react';
import Logo from '../components/Logo';
import { fadeUp, staggerContainer, pop } from '../lib/animations';
import TrustSignals from '../components/TrustSignals';

interface LandingProps {
  onSignIn: () => void;
}

const SAMPLE_QUESTIONS = [
  "What would you do differently if you knew no one would judge you?",
  "Which stranger has had the most unexpected impact on your life?",
  "What belief did you hold ten years ago that you've completely reversed?",
  "If tonight were your last dinner, who would you invite and what would you ask them?",
  "What's a dream you've stopped mentioning — and should probably revisit?",
  "What does a genuinely good day look like for you, in ordinary detail?",
];

const PREMIUM_CATEGORIES = [
  { name: 'Date Night', emoji: '✨', tagline: '25 questions for real closeness', desc: 'The ones that bring you closer.' },
  { name: 'Philosophy', emoji: '🔭', tagline: '69 questions about being human', desc: 'For dinners that become discussions.' },
  { name: 'Creative Sparks', emoji: '🎨', tagline: '63 imaginative what-ifs', desc: 'Open new ways of thinking together.' },
];

const TESTIMONIALS = [
  {
    quote: "We use it every team lunch. The deep-talk ones always catch someone off guard — in the best way.",
    who: "Engineering team, 11 people",
  },
  {
    quote: "Finally something better than 'how was your weekend?' at dinner parties. My guests actually stayed to talk.",
    who: "Couple, 4 years together",
  },
  {
    quote: "My family of 5 has a rule now — one question per Sunday dinner. It changed everything.",
    who: "Parent of three, Chicago",
  },
];

const FAQ_ITEMS = [
  {
    q: "What happens when I hit 25 free questions?",
    a: "You'll see an upgrade prompt. There's no expiry — your saved favorites stay yours forever.",
  },
  {
    q: "Can I cancel my subscription anytime?",
    a: "Yes. Two clicks from your account page. No dark patterns, no retention flow, no guilt.",
  },
  {
    q: "What's the difference between Light and Deep questions?",
    a: "Light questions are playful and low-stakes — great for groups still warming up. Deep questions go further: values, regrets, hopes. Both are in every category.",
  },
  {
    q: "Will I see the same questions twice?",
    a: "Occasionally — the archive has 600+ questions, but popular categories cycle. Premium unlocks the full depth so repeats are rare.",
  },
  {
    q: "Does it work without internet?",
    a: "Yes. Once the app loads, it works offline. Questions are cached in your browser automatically — no internet needed mid-dinner.",
  },
];

export default function Landing({ onSignIn }: LandingProps) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const heroQuestion = SAMPLE_QUESTIONS[Math.floor(Math.random() * SAMPLE_QUESTIONS.length)];
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="editorial-container min-h-screen">
      {/* Masthead */}
      <header className="border-b border-brand/10 px-6 py-5 md:px-12 md:py-8 w-full">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Logo size={36} className="text-brand" />
            <div>
              <span className="caps-tracking opacity-30 block text-[9px] mb-0.5">Vol. I · Est. 2024</span>
              <h1 className="font-serif text-xl md:text-2xl italic tracking-tight">
                Dinner Table Cards
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/play"
              className="hidden sm:inline-flex items-center gap-1.5 caps-tracking text-[10px] border border-brand/20 px-4 py-2 hover:bg-brand hover:text-paper transition-all"
            >
              Join Live Session
            </Link>
            <span className="caps-tracking opacity-30 text-[10px] hidden md:block">{today}</span>
          </div>
        </div>
      </header>

      <main className="flex-grow w-full max-w-6xl mx-auto px-6 md:px-12">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="py-14 md:py-20 grid md:grid-cols-2 gap-12 md:gap-16 items-center border-b border-brand/10">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
          >
            <motion.span variants={fadeUp} className="caps-tracking opacity-40 mb-6 block">
              Turn any gathering into something memorable
            </motion.span>
            <motion.h2 variants={fadeUp} className="font-serif text-4xl sm:text-5xl md:text-6xl italic leading-[1.1] text-brand mb-6 tracking-tighter">
              "{heroQuestion}"
            </motion.h2>
            <motion.p variants={fadeUp} className="text-brand/60 leading-relaxed mb-8 max-w-md">
              Skip the small talk. 600+ questions curated for dinner parties, date nights, and team
              meetings — the kind that spark stories you haven't heard before. Host live sessions where everyone answers together.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onSignIn}
                className="group inline-flex items-center justify-center gap-2 bg-brand text-paper caps-tracking px-8 py-4 hover:bg-opacity-90 transition-all shadow-lg shadow-brand/10 hover:shadow-xl hover:shadow-brand/15"
              >
                Start Free <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
              <Link
                to="/play"
                className="inline-flex items-center justify-center gap-2 caps-tracking px-8 py-4 border border-brand/20 hover:bg-brand/5 transition-all"
              >
                <Sparkles size={12} /> Join Live Session
              </Link>
            </motion.div>
            {/* Trust signals */}
            <motion.div variants={fadeUp} className="flex items-center gap-6 mt-6 pt-6 border-t border-brand/5">
              <div className="flex items-center gap-1.5">
                <Users size={12} className="opacity-40" />
                <span className="text-[10px] caps-tracking opacity-40">500+ players joined</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MessageSquare size={12} className="opacity-40" />
                <span className="text-[10px] caps-tracking opacity-40">600+ questions</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Star size={10} className="opacity-40 fill-current" />
                <span className="text-[10px] caps-tracking opacity-40">4.9 rating</span>
              </div>
            </motion.div>
          </motion.div>

          {/* Sample card */}
          <div className="hidden md:block">
            <div
              className="relative aspect-square border-[10px] border-white shadow-2xl overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #f9f5ee 0%, #ede4d0 100%)' }}
            >
              <div className="absolute top-0 left-0 w-24 h-24 opacity-20"
                style={{ background: 'radial-gradient(circle at 0% 0%, #c8a96e, transparent 70%)' }} />
              <div className="absolute bottom-0 right-0 w-36 h-36 opacity-10"
                style={{ background: 'radial-gradient(circle at 100% 100%, #c8a96e, transparent 70%)' }} />
              <div className="relative h-full flex flex-col justify-between p-10">
                <div>
                  <span className="text-[9px] tracking-[0.4em] uppercase opacity-50 block mb-1">
                    Issue {new Date().getFullYear()} · Icebreaker
                  </span>
                  <div className="h-[1px] w-8 opacity-20 bg-brand" />
                </div>
                <h3 className="font-serif text-2xl italic leading-tight text-brand tracking-tight">
                  "{heroQuestion}"
                </h3>
                <div className="flex justify-between items-end">
                  <span className="text-[9px] tracking-[0.3em] uppercase opacity-40 font-sans">
                    Dinner Table<br />Cards
                  </span>
                  <div className="w-8 h-8 border border-brand/10 rounded-full flex items-center justify-center">
                    <span className="text-[8px] font-serif italic text-brand">DT</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Live Trust Signals (dynamic counters) ─────────────────────── */}
        <TrustSignals />

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section id="how-it-works" className="py-14 md:py-16 border-b border-brand/10">
          <span className="caps-tracking opacity-40 block mb-8">How it works</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 md:gap-12">
            {[
              {
                icon: <BookOpen size={20} />,
                title: 'Choose a category',
                body: 'Icebreakers, deep-talk, team-building, date night — 7 categories ranging from playful to profound.',
              },
              {
                icon: <Zap size={20} />,
                title: 'Get your question',
                body: 'One beautifully curated question, served daily. Shuffle for something fresh, or let AI surprise you.',
              },
              {
                icon: <Heart size={20} />,
                title: 'Save & share',
                body: 'Favorite the ones that sparked the best conversations. Share elegant cards to social or your group chat.',
              },
            ].map(f => (
              <div key={f.title}>
                <div className="opacity-40 mb-4">{f.icon}</div>
                <h3 className="font-serif text-lg italic mb-2">{f.title}</h3>
                <p className="text-sm leading-relaxed opacity-60">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Sample questions ─────────────────────────────────────────────── */}
        <section className="py-14 md:py-16 border-b border-brand/10">
          <span className="caps-tracking opacity-40 block mb-8">A few favourites</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-brand/10">
            {SAMPLE_QUESTIONS.map((q, i) => (
              <div key={i} className="bg-paper p-6 md:p-8">
                <span className="caps-tracking opacity-20 block mb-3">{String(i + 1).padStart(2, '0')}</span>
                <p className="font-serif text-xl italic leading-relaxed text-brand">{q}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Premium category teaser ──────────────────────────────────────── */}
        <section className="py-14 md:py-16 border-b border-brand/10">
          <div className="flex items-baseline gap-4 mb-2">
            <span className="caps-tracking opacity-40">Go deeper with Premium</span>
            <span className="h-[1px] flex-grow bg-brand/10" />
            <span className="caps-tracking opacity-30 flex items-center gap-1.5">
              <Star size={10} className="fill-accent/40 text-accent/40" /> From $2 / month
            </span>
          </div>
          <p className="text-sm opacity-50 mb-8 max-w-lg">
            The free tier covers the basics. Upgrade to unlock 3 deeper categories, 500 questions/month,
            and curated packs for specific occasions.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {PREMIUM_CATEGORIES.map(cat => (
              <div
                key={cat.name}
                className="border border-brand/10 p-6 md:p-8 hover:border-brand/25 transition-colors group cursor-pointer"
                onClick={onSignIn}
              >
                <span className="text-2xl mb-4 block">{cat.emoji}</span>
                <h3 className="font-serif text-lg italic mb-1 group-hover:text-accent transition-colors">{cat.name}</h3>
                <p className="text-xs caps-tracking opacity-40 mb-3">{cat.tagline}</p>
                <p className="text-sm opacity-55 leading-relaxed mb-5">{cat.desc}</p>
                <span className="inline-flex items-center gap-1.5 caps-tracking text-[10px] opacity-40 group-hover:opacity-80 transition-opacity">
                  <Lock size={9} /> Premium only
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Social proof ─────────────────────────────────────────────────── */}
        <section className="py-14 md:py-16 border-b border-brand/10">
          <span className="caps-tracking opacity-40 block mb-8">What people are saying</span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="border border-brand/10 p-8 hover:border-brand/20 transition-colors">
                <p className="font-serif text-lg italic leading-relaxed text-brand mb-5">
                  "{t.quote}"
                </p>
                <span className="caps-tracking text-[10px] opacity-40">— {t.who}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pricing ──────────────────────────────────────────────────────── */}
        <section className="py-14 md:py-16 border-b border-brand/10">
          <span className="caps-tracking opacity-40 block mb-2">Plans</span>
          <p className="text-sm opacity-50 mb-8">Less than a coffee. Cancel in two clicks.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

            {/* Free */}
            <div className="border border-brand/10 p-8 space-y-4">
              <div>
                <span className="caps-tracking opacity-40">Free</span>
                <p className="font-serif text-4xl italic mt-1">$0</p>
                <p className="text-sm opacity-50 mt-1">forever</p>
              </div>
              <ul className="space-y-2 text-sm opacity-70">
                {['4 categories', 'Daily questions', '25 questions to start'].map(f => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-brand/40 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={onSignIn}
                className="w-full caps-tracking border border-brand/20 py-3 hover:bg-brand hover:text-paper transition-all mt-4"
              >
                Get started
              </button>
            </div>

            {/* Monthly */}
            <div className="border-2 border-brand p-8 space-y-4 relative">
              <span className="absolute top-4 right-4 text-[9px] caps-tracking bg-brand text-paper px-2 py-1">
                Most popular
              </span>
              <div>
                <span className="caps-tracking opacity-40">Monthly</span>
                <p className="font-serif text-4xl italic mt-1">$3</p>
                <p className="text-sm opacity-50 mt-1">per month</p>
              </div>
              <ul className="space-y-2 text-sm opacity-70">
                {['All 7 categories', 'Curated packs', '100 questions/month', 'Favorites & history'].map(f => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-brand/60 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={onSignIn}
                className="w-full caps-tracking bg-brand text-paper py-3 hover:bg-opacity-90 transition-all mt-4"
              >
                Start monthly
              </button>
            </div>

            {/* Yearly */}
            <div className="border border-brand/10 p-8 space-y-4 relative">
              <span className="absolute top-4 right-4 text-[9px] caps-tracking bg-accent/10 text-accent px-2 py-1">
                Save 33%
              </span>
              <div>
                <span className="caps-tracking opacity-40">Yearly</span>
                <p className="font-serif text-4xl italic mt-1">$2</p>
                <p className="text-sm opacity-50 mt-1">per month · billed $24/yr</p>
              </div>
              <ul className="space-y-2 text-sm opacity-70">
                {['Everything in Monthly', '500 questions/month', 'AI-generated questions', 'Early feature access'].map(f => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-brand/40 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={onSignIn}
                className="w-full caps-tracking border border-brand/20 py-3 hover:bg-brand hover:text-paper transition-all mt-4"
              >
                Save with yearly
              </button>
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <section className="py-14 md:py-16 border-b border-brand/10">
          <span className="caps-tracking opacity-40 block mb-8">Common questions</span>
          <div className="max-w-2xl space-y-0">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="border-b border-brand/10 last:border-b-0">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between py-5 text-left group focus:outline-none focus:ring-2 focus:ring-brand/20"
                  aria-expanded={openFaq === i}
                >
                  <h3 className="font-serif italic text-lg text-brand group-hover:text-accent transition-colors pr-4">
                    {item.q}
                  </h3>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 opacity-40 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`}
                  />
                </button>
                {openFaq === i && (
                  <p className="text-sm opacity-60 leading-relaxed pb-5">
                    {item.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Live Session CTA ─────────────────────────────────────────────── */}
        <section className="py-14 md:py-16 border-b border-brand/10 text-center">
          <span className="caps-tracking opacity-40 block mb-4">New</span>
          <h2 className="font-serif text-3xl md:text-4xl italic text-brand mb-4 leading-tight">
            Live Sessions
          </h2>
          <p className="text-sm opacity-50 mb-6 max-w-md mx-auto">
            Host a Kahoot-style round at your dinner party. Everyone answers,
            then reveal answers one by one — the best conversations start with laughter.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link
              to="/play"
              className="inline-flex items-center gap-2 border border-brand/20 caps-tracking px-6 py-3 hover:bg-brand hover:text-paper transition-all"
            >
              Join a Session <ArrowRight size={12} />
            </Link>
            <button
              onClick={onSignIn}
              className="inline-flex items-center gap-2 bg-brand text-paper caps-tracking px-6 py-3 hover:bg-opacity-90 transition-all"
            >
              Host a Session <ArrowRight size={12} />
            </button>
          </div>
          <p className="text-[10px] caps-tracking opacity-35 mt-4">
            1 free session per week &middot; Unlimited with Premium
          </p>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section className="py-16 md:py-24 text-center">
          <span className="caps-tracking opacity-40 block mb-6">Ready to start the conversation?</span>
          <h2 className="font-serif text-4xl md:text-5xl italic text-brand mb-4 leading-tight">
            What will you ask tonight?
          </h2>
          <p className="text-sm opacity-50 mb-8 max-w-sm mx-auto">
            25 free questions to get you started. No card, no catch.
            Upgrade any time for the full archive.
          </p>
          <button
            onClick={onSignIn}
            className="inline-flex items-center gap-2 bg-brand text-paper caps-tracking px-10 py-5 hover:bg-opacity-90 transition-all focus:outline-none focus:ring-2 focus:ring-brand/40"
          >
            Sign in with Google — It's free <ArrowRight size={12} />
          </button>
          <p className="text-[10px] caps-tracking opacity-40 mt-5">
            Secure · No spam · Cancel premium anytime
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-brand/10 px-6 py-8 md:px-12 w-full">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <Logo size={24} className="text-brand opacity-50" />
              <p className="caps-tracking opacity-40">© {new Date().getFullYear()} Dinner Table Cards</p>
            </div>
            <div className="flex items-center gap-6 caps-tracking opacity-40">
              <Link to="/privacy" className="hover:opacity-100 transition-opacity">Privacy</Link>
              <Link to="/terms" className="hover:opacity-100 transition-opacity">Terms</Link>
              <button onClick={onSignIn} className="hover:opacity-100 transition-opacity">Sign In</button>
              <a
                href="https://x.com/hegdedarsh/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-100 transition-opacity"
                aria-label="Follow us on X (Twitter)"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="mailto:contentcreatordarsh@gmail.com"
                className="hover:opacity-100 transition-opacity"
                aria-label="Contact us via email"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </a>
            </div>
          </div>
          <p className="text-[10px] caps-tracking opacity-35 text-center sm:text-left">
            Invite a friend after you join →{' '}
            <button onClick={onSignIn} className="underline hover:opacity-60 transition-opacity">
              you both earn 50 bonus questions free
            </button>
          </p>
        </div>
      </footer>
    </div>
  );
}
