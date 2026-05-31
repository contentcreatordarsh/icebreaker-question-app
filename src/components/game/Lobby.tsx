import type { GamePlayer } from '../../types';
import PlayerList from './PlayerList';
import RoomCodeDisplay from './RoomCodeDisplay';
import { cn } from '../../lib/utils';

interface LobbyProps {
  roomCode: string;
  players: GamePlayer[];
  currentPlayerId: string;
  isHost: boolean;
  onKick?: (playerId: string) => void;
  onStart?: () => void;
  className?: string;
}

export default function Lobby({
  roomCode,
  players,
  currentPlayerId,
  isHost,
  onKick,
  onStart,
  className,
}: LobbyProps) {
  const playerCount = players.length;
  const canStart = isHost && playerCount >= 2; // Need at least host + 1 player

  return (
    <div className={cn('flex flex-col items-center gap-8', className)}>
      {/* Room code */}
      <RoomCodeDisplay roomCode={roomCode} />

      {/* Player list */}
      <div className="w-full max-w-md">
        <div className="mb-3 flex items-center justify-between">
          <h3
            className="text-sm uppercase tracking-[0.2em] text-[#1A1A1A]/50"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            Players
          </h3>
          <span className="rounded-full bg-[#F5F2ED] px-2 py-0.5 text-xs font-medium text-[#1A1A1A]/50">
            {playerCount} / 20
          </span>
        </div>

        <PlayerList
          players={players}
          currentPlayerId={currentPlayerId}
          onKick={isHost ? onKick : undefined}
          isHost={isHost}
        />
      </div>

      {/* Host controls */}
      {isHost ? (
        <div className="flex flex-col items-center gap-3">
          {canStart ? (
            <button
              onClick={onStart}
              className="rounded-full bg-[#5A5A40] px-8 py-3 text-xs uppercase tracking-[0.3em] text-[#F5F2ED] shadow-md transition-all hover:bg-[#4A4A34] hover:shadow-lg active:scale-[0.98]"
            >
              Start First Question
            </button>
          ) : (
            <p className="text-center text-sm italic text-[#1A1A1A]/40" style={{ fontFamily: 'Georgia, serif' }}>
              Waiting for at least 1 player to join...
            </p>
          )}
        </div>
      ) : (
        <div className="text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <p className="text-sm text-[#1A1A1A]/60" style={{ fontFamily: 'Georgia, serif' }}>
              Waiting for the host to start...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
