import { useEffect, useRef, useState, useCallback } from 'react';
import { Download, Share2, Check } from 'lucide-react';
import type { LeaderboardEntry } from '../../types';

interface RecapCardProps {
  questionsPlayed: number;
  playerCount: number;
  leaderboard: LeaderboardEntry[];
  roomCode: string;
}

// Brand palette (matches the app).
const CREAM = '#F5F2ED';
const INK = '#1A1A1A';
const OLIVE = '#5A5A40';
const GOLD = '#B8932F';

const SIZE = 1080; // square — versatile for X and Instagram

/**
 * Draws the branded recap onto a canvas at full resolution. Pure function of its
 * inputs so it can run once on mount (and again if data changes).
 */
function drawRecap(
  ctx: CanvasRenderingContext2D,
  { questionsPlayed, playerCount, leaderboard, roomCode }: RecapCardProps,
) {
  const sorted = [...leaderboard].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  // Background.
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Subtle border frame.
  ctx.strokeStyle = 'rgba(26,26,26,0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 48, SIZE - 96, SIZE - 96);

  ctx.textAlign = 'center';

  // Wordmark / kicker.
  ctx.fillStyle = 'rgba(26,26,26,0.45)';
  ctx.font = '600 26px Georgia, serif';
  ctx.fillText('D I N N E R   T A B L E   C A R D S', SIZE / 2, 150);

  // Title.
  ctx.fillStyle = INK;
  ctx.font = 'italic 84px Georgia, serif';
  ctx.fillText('Session Recap', SIZE / 2, 268);

  // Stat trio.
  const stats: Array<[string, string]> = [
    [String(questionsPlayed), questionsPlayed === 1 ? 'QUESTION' : 'QUESTIONS'],
    [String(playerCount), playerCount === 1 ? 'PLAYER' : 'PLAYERS'],
    [roomCode || '—', 'ROOM'],
  ];
  const colW = (SIZE - 200) / 3;
  stats.forEach(([big, small], i) => {
    const cx = 100 + colW * i + colW / 2;
    ctx.fillStyle = OLIVE;
    ctx.font = '700 72px Georgia, serif';
    ctx.fillText(big, cx, 410);
    ctx.fillStyle = 'rgba(26,26,26,0.4)';
    ctx.font = '600 24px Georgia, serif';
    ctx.fillText(small.split('').join(' '), cx, 452);
  });

  // Divider.
  ctx.strokeStyle = 'rgba(26,26,26,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(140, 510);
  ctx.lineTo(SIZE - 140, 510);
  ctx.stroke();

  // Podium (top 3).
  const medals = ['🥇', '🥈', '🥉'];
  const top3 = sorted.slice(0, 3);
  let y = 600;
  ctx.textAlign = 'left';
  top3.forEach((entry, i) => {
    // Row background for #1.
    if (i === 0) {
      ctx.fillStyle = 'rgba(184,147,47,0.10)';
      ctx.fillRect(140, y - 52, SIZE - 280, 84);
    }
    ctx.textAlign = 'left';
    ctx.font = '54px Georgia, serif';
    ctx.fillText(medals[i], 170, y + 4);

    ctx.fillStyle = INK;
    ctx.font = `${i === 0 ? '600 ' : ''}46px Georgia, serif`;
    const avatar = entry.avatar ? `${entry.avatar} ` : '';
    const name = `${avatar}${entry.name}`;
    const maxNameW = SIZE - 280 - 260;
    let display = name;
    while (ctx.measureText(display).width > maxNameW && display.length > 1) {
      display = display.slice(0, -2) + '…';
    }
    ctx.fillText(display, 250, y + 4);

    ctx.textAlign = 'right';
    ctx.fillStyle = i === 0 ? GOLD : 'rgba(26,26,26,0.55)';
    ctx.font = '600 46px Georgia, serif';
    ctx.fillText(`${entry.score} pts`, SIZE - 170, y + 4);

    y += 104;
  });

  // MVP banner (if there's a winner).
  ctx.textAlign = 'center';
  if (winner) {
    ctx.fillStyle = 'rgba(26,26,26,0.5)';
    ctx.font = 'italic 34px Georgia, serif';
    ctx.fillText(`🏆  MVP of the table: ${winner.name}`, SIZE / 2, y + 30);
  }

  // Footer CTA.
  ctx.fillStyle = OLIVE;
  ctx.font = '600 30px Georgia, serif';
  ctx.fillText('Play free  ·  dinnertablecards.xyz/play', SIZE / 2, SIZE - 90);
}

/**
 * Post-game shareable recap card. Renders a branded square image to a canvas and
 * lets players Download it or Share it natively (as an image file where the Web
 * Share API supports files; falls back to download). This is the viral loop —
 * a screenshot-ready memento with the join URL baked in.
 */
export default function RecapCard(props: RecapCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shared, setShared] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [canShareFile, setCanShareFile] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawRecap(ctx, props);
    // Feature-detect file sharing for the Share button label.
    try {
      const probe = new File([''], 'x.png', { type: 'image/png' });
      setCanShareFile(!!navigator.canShare?.({ files: [probe] }));
    } catch {
      setCanShareFile(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.questionsPlayed, props.playerCount, props.roomCode, props.leaderboard]);

  const toBlob = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        canvasRef.current?.toBlob((b) => resolve(b), 'image/png');
      }),
    [],
  );

  const handleDownload = useCallback(async () => {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dinner-table-cards-recap-${props.roomCode || 'session'}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  }, [toBlob, props.roomCode]);

  const handleShare = useCallback(async () => {
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], `dinner-table-cards-recap.png`, { type: 'image/png' });
    // Session-summary URL so the link preview (FB/LinkedIn/iMessage) is dynamic —
    // the worker renders OG "We just played … N questions, P players" for /play?q&p.
    const recapUrl = `https://dinnertablecards.xyz/play?q=${props.questionsPlayed}&p=${props.playerCount}`;
    const shareData: ShareData = {
      title: 'Dinner Table Cards — Session Recap',
      text: `We just played Dinner Table Cards! ${props.questionsPlayed} questions, ${props.playerCount} players. Play free 👉 ${recapUrl}`,
    };
    // Prefer sharing the image file where supported.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ ...shareData, files: [file] });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
        return;
      } catch {
        /* cancelled — fall through */
      }
    }
    // Fallback: share text + link, or download the image.
    if (navigator.share) {
      try {
        await navigator.share({ ...shareData, url: recapUrl });
        return;
      } catch {
        /* cancelled */
      }
    }
    await handleDownload();
  }, [toBlob, handleDownload, props.questionsPlayed, props.playerCount]);

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        role="img"
        aria-label={`Session recap: ${props.questionsPlayed} questions, ${props.playerCount} players${
          props.leaderboard[0] ? `, MVP ${props.leaderboard[0].name}` : ''
        }`}
        className="w-full max-w-[280px] rounded-2xl border border-[#1A1A1A]/10 shadow-lg"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={handleShare}
          className="inline-flex items-center gap-2 rounded-full bg-[#5A5A40] px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-[#F5F2ED] shadow-md transition-all hover:bg-[#4A4A34] hover:shadow-lg active:scale-[0.98]"
        >
          {shared ? <Check size={13} /> : <Share2 size={13} />}
          {shared ? 'Shared!' : canShareFile ? 'Share Card' : 'Share'}
        </button>
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-2 rounded-full border border-[#1A1A1A]/10 px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-[#1A1A1A]/60 transition-all hover:border-[#5A5A40]/30 hover:bg-[#5A5A40]/5 hover:text-[#5A5A40]"
        >
          {downloaded ? <Check size={13} className="text-emerald-600" /> : <Download size={13} />}
          {downloaded ? 'Saved!' : 'Download'}
        </button>
      </div>
    </div>
  );
}
