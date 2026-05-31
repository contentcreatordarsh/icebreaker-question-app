import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';

interface QuestionVoteProps {
  questionText: string;
  className?: string;
}

/**
 * Thumbs up / down vote for a question.
 * Sends to /api/question-vote. One vote per render (resets between questions).
 */
export default function QuestionVote({ questionText, className }: QuestionVoteProps) {
  const [voted, setVoted] = useState<'up' | 'down' | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleVote(vote: 'up' | 'down') {
    if (voted || loading) return;
    setLoading(true);
    setVoted(vote); // optimistic

    try {
      await fetch('/api/question-vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionText, vote }),
      });
    } catch {
      // Non-critical — don't revert the UI
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <span className="mr-1 text-[9px] uppercase tracking-wider text-[#1A1A1A]/30">
        Rate this question
      </span>
      <button
        onClick={() => handleVote('up')}
        disabled={!!voted}
        className={`rounded-full p-1.5 transition-all ${
          voted === 'up'
            ? 'bg-emerald-100 text-emerald-600'
            : 'text-[#1A1A1A]/30 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-30'
        }`}
        aria-label="Good question"
      >
        <ThumbsUp size={12} />
      </button>
      <button
        onClick={() => handleVote('down')}
        disabled={!!voted}
        className={`rounded-full p-1.5 transition-all ${
          voted === 'down'
            ? 'bg-red-100 text-red-500'
            : 'text-[#1A1A1A]/30 hover:bg-red-50 hover:text-red-500 disabled:opacity-30'
        }`}
        aria-label="Not great"
      >
        <ThumbsDown size={12} />
      </button>
      {voted && (
        <span className="ml-1 text-[9px] text-[#1A1A1A]/30">Thanks!</span>
      )}
    </div>
  );
}
