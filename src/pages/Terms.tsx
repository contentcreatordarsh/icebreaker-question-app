import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export default function Terms() {
  return (
    <div className="min-h-screen bg-paper text-brand">
      <div className="max-w-2xl mx-auto px-6 py-12 md:py-20">
        <Link to="/" className="inline-flex items-center gap-1.5 text-[11px] caps-tracking opacity-50 hover:opacity-100 transition-opacity mb-10">
          <ChevronLeft size={14} /> Back to Dinner Table Cards
        </Link>

        <h1 className="font-serif text-3xl md:text-4xl italic mb-2">Terms of Service</h1>
        <p className="text-[11px] caps-tracking opacity-40 mb-10">Last updated May 2026</p>

        <div className="space-y-6 text-sm leading-relaxed opacity-80">
          <section>
            <h2 className="font-serif text-lg italic mb-2">The service</h2>
            <p>Dinner Table Cards generates conversation questions for you to use at gatherings. We offer a free tier with a usage limit and paid plans with higher limits. We may update or improve the questions and features over time.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg italic mb-2">Your account</h2>
            <p>You sign in with Google and are responsible for activity under your account. Please use the service for personal, lawful purposes. Don't attempt to bypass usage limits, abuse the referral system, or interfere with the service for others.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg italic mb-2">Subscriptions &amp; payments</h2>
            <p>Paid plans are billed through Stripe on a recurring basis until canceled. You can cancel anytime from your <Link to="/account" className="underline">account page</Link>; your plan remains active through the end of the current billing period. Prices may change with notice.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg italic mb-2">Referrals</h2>
            <p>Referral bonuses are granted for genuine sign-ups using your link. We may withhold or reverse bonuses we believe result from self-referral, automated activity, or other abuse.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg italic mb-2">Content</h2>
            <p>Questions are provided for entertainment. We make no guarantee that they are suitable for every audience — use your judgment about what to share at your table.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg italic mb-2">Disclaimer</h2>
            <p>The service is provided "as is" without warranties of any kind. To the extent permitted by law, we are not liable for indirect or incidental damages arising from your use of the service.</p>
          </section>

          <section>
            <h2 className="font-serif text-lg italic mb-2">Contact</h2>
            <p>Questions about these terms? Email <a href="mailto:contentcreatordarsh@gmail.com" className="underline">contentcreatordarsh@gmail.com</a> or reach out on <a href="https://x.com/hegdedarsh" target="_blank" rel="noopener noreferrer" className="underline">X (@hegdedarsh)</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
