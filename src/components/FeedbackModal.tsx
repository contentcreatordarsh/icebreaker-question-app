import { useState } from 'react';
import { cn } from '../lib/utils';

interface FeedbackModalProps {
  onClose: () => void;
  sessionCode?: string;
  questionText?: string;
}

/**
 * Feedback modal — allows players and hosts to submit feedback
 * after a session. No auth required (guests can submit).
 */
export default function FeedbackModal({ onClose, sessionCode, questionText }: FeedbackModalProps) {
  const [text, setText] = useState('');
  const [rating, setRating] = useState(0);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!text.trim()) {
      setError('Please write some feedback');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          rating: rating || undefined,
          email: email.trim() || undefined,
          sessionCode,
          questionText,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to submit' }));
        throw new Error((data as { error?: string }).error || 'Failed to submit');
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl" onClick={e => e.stopPropagation()}>
          <p className="mb-2 text-4xl">🙏</p>
          <h3 className="mb-2 text-lg font-light italic text-[#1A1A1A]" style={{ fontFamily: 'Georgia, serif' }}>
            Thank you!
          </h3>
          <p className="mb-6 text-sm text-[#1A1A1A]/50">
            Your feedback helps us make Dinner Table Cards better for everyone.
          </p>
          <button
            onClick={onClose}
            className="rounded-full bg-[#5A5A40] px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-[#F5F2ED]"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-light italic text-[#1A1A1A]" style={{ fontFamily: 'Georgia, serif' }}>
            Send Feedback
          </h3>
          <button onClick={onClose} className="text-[#1A1A1A]/30 hover:text-[#1A1A1A]/60 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Star rating */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-[#1A1A1A]/40">
            How was your experience?
          </label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className={cn(
                  'text-2xl transition-transform hover:scale-110',
                  star <= rating ? 'opacity-100' : 'opacity-20',
                )}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        {/* Text */}
        <div className="mb-4">
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setError(''); }}
            maxLength={1000}
            rows={3}
            placeholder="What did you like? What could be better?"
            className="w-full resize-none rounded-lg border border-[#1A1A1A]/10 p-3 text-sm text-[#1A1A1A] outline-none placeholder:text-[#1A1A1A]/20 focus:border-[#5A5A40]"
            style={{ fontFamily: 'Georgia, serif' }}
          />
        </div>

        {/* Optional email */}
        <div className="mb-4">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Your email (optional, for follow-up)"
            className="w-full rounded-lg border border-[#1A1A1A]/10 p-3 text-sm text-[#1A1A1A] outline-none placeholder:text-[#1A1A1A]/20 focus:border-[#5A5A40]"
          />
        </div>

        {/* Error */}
        {error && <p className="mb-3 text-center text-sm text-red-500">{error}</p>}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !text.trim()}
          className={cn(
            'w-full rounded-full py-3 text-xs uppercase tracking-[0.2em] transition-all',
            'bg-[#5A5A40] text-[#F5F2ED] hover:bg-[#4A4A34]',
            'disabled:cursor-not-allowed disabled:opacity-40',
          )}
        >
          {submitting ? 'Sending...' : 'Submit Feedback'}
        </button>
      </div>
    </div>
  );
}
