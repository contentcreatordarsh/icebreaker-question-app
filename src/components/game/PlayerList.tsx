import type { GamePlayer } from '../../types';
import { cn } from '../../lib/utils';

interface PlayerListProps {
  players: GamePlayer[];
  answeredPlayerIds?: Set<string>;
  currentPlayerId?: string;
  onKick?: (playerId: string) => void;
  isHost?: boolean;
  compact?: boolean;
  className?: string;
}

/** Initials avatar — picks a colour from a fixed palette based on the name hash. */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const AVATAR_COLORS = [
  'bg-amber-200 text-amber-800',
  'bg-emerald-200 text-emerald-800',
  'bg-sky-200 text-sky-800',
  'bg-violet-200 text-violet-800',
  'bg-rose-200 text-rose-800',
  'bg-orange-200 text-orange-800',
  'bg-teal-200 text-teal-800',
  'bg-indigo-200 text-indigo-800',
];

function getColorClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function PlayerList({
  players,
  answeredPlayerIds,
  currentPlayerId,
  onKick,
  isHost,
  compact,
  className,
}: PlayerListProps) {
  if (players.length === 0) {
    return (
      <p className={cn('text-sm italic opacity-40', className)}>
        No players yet...
      </p>
    );
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {players.map(player => {
        const hasAnswered = answeredPlayerIds?.has(player.id);
        const isYou = player.id === currentPlayerId;

        return (
          <div
            key={player.id}
            className={cn(
              'group relative flex items-center gap-2 rounded-full px-3 py-1.5 transition-all',
              hasAnswered
                ? 'bg-emerald-100 ring-1 ring-emerald-300'
                : 'bg-[#F5F2ED]',
              compact ? 'text-xs' : 'text-sm',
            )}
          >
            {/* Avatar */}
            {player.avatar ? (
              <span
                className={cn(
                  'flex items-center justify-center',
                  compact ? 'text-sm' : 'text-base',
                )}
              >
                {player.avatar}
              </span>
            ) : (
              <span
                className={cn(
                  'flex items-center justify-center rounded-full font-medium',
                  compact ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-xs',
                  getColorClass(player.name),
                )}
              >
                {getInitials(player.name)}
              </span>
            )}

            {/* Name */}
            <span className="font-medium text-[#1A1A1A]">
              {player.name}
              {isYou && <span className="ml-1 text-[10px] opacity-40">(you)</span>}
              {player.isHost && (
                <span className="ml-1 text-[10px] uppercase tracking-wider opacity-40">
                  host
                </span>
              )}
            </span>

            {/* Answer check */}
            {hasAnswered && (
              <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}

            {/* Kick button (host only, not self) */}
            {isHost && !player.isHost && onKick && (
              <button
                onClick={() => onKick(player.id)}
                className="ml-1 hidden rounded-full p-0.5 text-red-400 hover:bg-red-100 hover:text-red-600 group-hover:inline-flex"
                title={`Remove ${player.name}`}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
