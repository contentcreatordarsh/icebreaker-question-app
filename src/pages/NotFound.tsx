import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-paper text-brand flex items-center justify-center px-6">
      <div className="text-center">
        <p className="font-serif text-6xl md:text-7xl italic mb-4">404</p>
        <p className="text-sm leading-relaxed opacity-70 mb-8 max-w-sm mx-auto">
          This page seems to have left the table. Let's get you back to the conversation.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center text-[11px] caps-tracking border border-brand/30 rounded-full px-5 py-2.5 hover:bg-brand hover:text-paper transition-colors"
        >
          Back to Dinner Table Cards
        </Link>
      </div>
    </div>
  );
}
