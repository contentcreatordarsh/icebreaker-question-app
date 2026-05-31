import type { LeaderboardEntry } from '../../types';
import { cn } from '../../lib/utils';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentPlayerId?: string;
  className?: string;
}

/**
 * Leaderboard display showing player scores ranked highest to lowest.
 * Shows between rounds and at session end.
 */
export default function Leaderboard({ entries, currentPlayerId, className }: LeaderboardProps) {
  const sorted = [...entries].sort((a, b) => b.score - a.score);

  if (sorted.length === 0) return null;

  return (
    <div className={cn('w-full max-w-sm mx-auto', className)}>
      <h3
        className="mb-4 text-center text-sm uppercase tracking-wider text-[#1A1A1A]/40"
      >
        🏆 Leaderboard
      </h3>
      <div className="space-y-2">
        {sorted.map((entry, i) => {
          const isYou = entry.playerId === currentPlayerId;
          const rank = i + 1;

          return (
            <div
              key={entry.playerId}
              className={cn(
                'flex items-center gap-3 rounded-xl px-4 py-3 transition-all',
                rank === 1 ? 'bg-amber-50 border border-amber-200' :
                rank === 2 ? 'bg-slate-50 border border-slate-200' :
                rank === 3 ? 'bg-orange-50/50 border border-orange-200/50' :
                'bg-white border border-[#1A1A1A]/5',
                isYou && 'ring-2 ring-[#5A5A40]/30',
              )}
            >
              {/* Rank */}
              <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold">
                {rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`}
              </span>

              {/* Avatar + Name */}
              <div className="flex flex-1 items-center gap-2">
                {entry.avatar && <span className="text-lg">{entry.avatar}</span>}
                <span className="text-sm font-medium text-[#1A1A1A]">
                  {entry.name}
                  {isYou && <span className="ml-1 text-[10px] opacity-40">(you)</span>}
                </span>
              </div>

              {/* Score */}
              <span className={cn(
                'text-sm font-bold',
                rank === 1 ? 'text-amber-700' : 'text-[#1A1A1A]/60',
              )}>
                {entry.score} pts
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
