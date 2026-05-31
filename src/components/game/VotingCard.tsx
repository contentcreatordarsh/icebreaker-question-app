import type { RevealedAnswer } from '../../types';
import { cn } from '../../lib/utils';

interface VotingCardProps {
  answer: RevealedAnswer;
  voteCount: number;
  hasVoted: boolean;
  isSelf: boolean;
  onVote: () => void;
}

/**
 * Answer card shown during the voting phase.
 * Players can tap to vote for their favorite answer (can't vote for own).
 */
export default function VotingCard({ answer, voteCount, hasVoted, isSelf, onVote }: VotingCardProps) {
  return (
    <div
      className={cn(
        'relative rounded-xl border bg-white p-4 shadow-sm transition-all',
        hasVoted ? 'opacity-60' : isSelf ? 'border-[#1A1A1A]/5 opacity-70' : 'border-[#1A1A1A]/10 hover:border-amber-300 hover:shadow-md cursor-pointer',
      )}
      onClick={() => {
        if (!hasVoted && !isSelf) onVote();
      }}
    >
      {/* Answer text */}
      <p className="mb-3 text-base leading-relaxed text-[#1A1A1A]" style={{ fontFamily: 'Georgia, serif' }}>
        "{answer.answer}"
      </p>

      {/* Footer with name and vote */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {answer.avatar && <span className="text-sm">{answer.avatar}</span>}
          <span className="text-xs font-medium uppercase tracking-wider text-[#1A1A1A]/50">
            — {answer.name}
          </span>
          {isSelf && <span className="text-[10px] opacity-40">(you)</span>}
        </div>

        {/* Vote button / count */}
        <div className="flex items-center gap-1.5">
          {voteCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700">
              {voteCount}
            </span>
          )}
          {!isSelf && !hasVoted && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] uppercase tracking-wider text-amber-600">
              Vote
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
