import { useState } from 'react';
import { Share2, Check, Copy } from 'lucide-react';
import type { LeaderboardEntry } from '../../types';

interface ShareResultsProps {
  questionsPlayed: number;
  playerCount: number;
  leaderboard: LeaderboardEntry[];
  roomCode: string;
}

/**
 * "Share Results" button — uses Web Share API on mobile or copies to clipboard.
 * Shows a brief summary of the session for social sharing.
 */
export default function ShareResults({ questionsPlayed, playerCount, leaderboard, roomCode }: ShareResultsProps) {
  const [copied, setCopied] = useState(false);

  const winner = leaderboard.length > 0 ? leaderboard[0] : null;

  const shareText = [
    `🎉 Just had an amazing conversation game on Dinner Table Cards!`,
    ``,
    `📊 ${questionsPlayed} questions · ${playerCount} players · Room ${roomCode}`,
    winner ? `🏆 MVP: ${winner.name} (${winner.score} pts)` : '',
    ``,
    `Try it yourself 👉 https://dinnertablecards.xyz/play`,
  ].filter(Boolean).join('\n');

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Dinner Table Cards — Session Results',
          text: shareText,
          url: 'https://dinnertablecards.xyz/play',
        });
        return;
      } catch {
        // User cancelled or share failed — fall through to copy
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Cannot copy
    }
  }

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-2 rounded-full border border-[#1A1A1A]/10 px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-[#1A1A1A]/60 transition-all hover:border-[#5A5A40]/30 hover:bg-[#5A5A40]/5 hover:text-[#5A5A40]"
    >
      {copied ? (
        <>
          <Check size={12} className="text-emerald-600" />
          <span className="text-emerald-600">Copied!</span>
        </>
      ) : (
        <>
          <Share2 size={12} />
          Share Results
          {!navigator.share && <Copy size={10} className="opacity-40" />}
        </>
      )}
    </button>
  );
}
