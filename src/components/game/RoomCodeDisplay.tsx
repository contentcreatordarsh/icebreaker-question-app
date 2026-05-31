import { useState, useCallback } from 'react';
import { cn } from '../../lib/utils';

interface RoomCodeDisplayProps {
  roomCode: string;
  className?: string;
}

/**
 * Large room code display with copy-to-clipboard and share button.
 * Used on the host lobby screen so players can see and join.
 */
export default function RoomCodeDisplay({ roomCode, className }: RoomCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const joinUrl = `${window.location.origin}/play/${roomCode}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback — select the code text
    }
  }, [joinUrl]);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my Dinner Table Cards session!',
          text: `Join with code: ${roomCode}`,
          url: joinUrl,
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopy();
    }
  }, [roomCode, joinUrl, handleCopy]);

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      {/* Label */}
      <p className="text-xs uppercase tracking-[0.3em] text-[#1A1A1A]/40" style={{ fontFamily: 'Georgia, serif' }}>
        Room Code
      </p>

      {/* Big code display */}
      <div className="flex gap-2">
        {roomCode.split('').map((char, i) => (
          <span
            key={i}
            className="flex h-16 w-14 items-center justify-center rounded-lg bg-[#1A1A1A] text-3xl font-bold tracking-wider text-[#F5F2ED] shadow-md sm:h-20 sm:w-16 sm:text-4xl"
            style={{ fontFamily: 'ui-monospace, monospace' }}
          >
            {char}
          </span>
        ))}
      </div>

      {/* Join URL */}
      <p className="text-sm text-[#1A1A1A]/50">
        or visit <span className="font-medium text-[#1A1A1A]/70">{window.location.host}/play/{roomCode}</span>
      </p>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 rounded-full border border-[#1A1A1A]/10 px-4 py-2 text-xs uppercase tracking-wider text-[#1A1A1A]/60 transition-colors hover:bg-[#1A1A1A]/5"
        >
          {copied ? (
            <>
              <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy link
            </>
          )}
        </button>

        <button
          onClick={handleShare}
          className="flex items-center gap-2 rounded-full bg-[#5A5A40] px-4 py-2 text-xs uppercase tracking-wider text-[#F5F2ED] transition-colors hover:bg-[#4A4A34]"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          Share
        </button>
      </div>
    </div>
  );
}
