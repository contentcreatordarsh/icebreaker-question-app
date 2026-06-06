import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-paper text-brand">
      <div className="max-w-2xl mx-auto px-6 py-12 md:py-20">
        <Link to="/" className="inline-flex items-center gap-1.5 text-[11px] caps-tracking opacity-50 hover:opacity-100 transition-opacity mb-10">
          <ChevronLeft size={14} /> Back to Dinner Table Cards
        </Link>

        <h1 className="font-serif text-3xl md:text-4xl italic mb-2">Privacy Policy</h1>
        <p className="text-[11px] caps-tracking opacity-40 mb-10">Last updated May 2026</p>

        <div className="space-y-6 text-sm leading-relaxed opacity-80">
          <section>
            <h2 className="font-serif text-lg italic mb-2">What we collect</h2>
            <p>When you sign in with Google, we store your account identifier and email address to create your profile. We also keep app activity tied to your account: how many questions you've viewed, your streak, your saved favorites and history, and your referral activity.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg italic mb-2">How we use it</h2>
            <p>Your data powers the features you use — saving favorites, tracking streaks and usage limits, attributing referrals, and managing your subscription. We do not sell your personal information.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg italic mb-2">Payments</h2>
            <p>Payments are processed by Stripe. We never see or store your full card details. We store a Stripe customer identifier so you can manage your subscription.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg italic mb-2">Analytics</h2>
            <p>We use privacy-first, cookieless analytics to understand aggregate usage (such as page views). This does not track you across other sites.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg italic mb-2">Your choices</h2>
            <p>You can view and manage your data from your <Link to="/account" className="underline">account page</Link>, including deleting your account, which permanently removes your profile, favorites, and history.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg italic mb-2">Contact</h2>
            <p>Questions about privacy? Email <a href="mailto:contentcreatordarsh@gmail.com" className="underline">contentcreatordarsh@gmail.com</a> or reach out on <a href="https://x.com/hegdedarsh" target="_blank" rel="noopener noreferrer" className="underline">X (@hegdedarsh)</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
