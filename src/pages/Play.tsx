import type { KeyboardEvent as ReactKeyboardEvent, ClipboardEvent as ReactClipboardEvent } from 'react';
import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import CreateSessionButton from '../components/game/CreateSessionButton';
import { auth, signInWithGoogle } from '../lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import AvatarPicker, { getDefaultAvatar } from '../components/game/AvatarPicker';
import type { PlayerGender } from '../types';

const CODE_LENGTH = 4;

/**
 * /play — Combined join/host page for live sessions.
 * Top section: host a new session (requires auth).
 * Bottom section: join with a room code (no auth needed).
 */
export default function Play() {
  const navigate = useNavigate();
  const [user] = useAuthState(auth);
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [name, setName] = useState('');
  const [gender, setGender] = useState<PlayerGender>('male');
  const [avatar, setAvatar] = useState(getDefaultAvatar('male'));
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const fullCode = code.join('');

  const handleCodeInput = useCallback((index: number, value: string) => {
    const char = value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(-1);
    setError('');

    setCode(prev => {
      const next = [...prev];
      next[index] = char;
      return next;
    });

    // Auto-focus next input
    if (char && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleKeyDown = useCallback((index: number, e: ReactKeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setCode(prev => {
        const next = [...prev];
        next[index - 1] = '';
        return next;
      });
    }
  }, [code]);

  const handlePaste = useCallback((e: ReactClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, CODE_LENGTH);
    if (pasted.length > 0) {
      setCode(prev => {
        const next = [...prev];
        for (let i = 0; i < pasted.length; i++) {
          next[i] = pasted[i];
        }
        return next;
      });
      const focusIndex = Math.min(pasted.length, CODE_LENGTH - 1);
      inputRefs.current[focusIndex]?.focus();
    }
  }, []);

  const handleJoin = useCallback(async () => {
    const trimmedName = name.trim();
    if (fullCode.length !== CODE_LENGTH) {
      setError('Enter a 4-character room code');
      return;
    }
    if (!trimmedName) {
      setError('Enter your display name');
      return;
    }

    setChecking(true);
    setError('');

    try {
      const res = await fetch(`/api/session/lookup?code=${encodeURIComponent(fullCode)}`);
      const data = await res.json() as { exists: boolean; status?: string };

      if (!data.exists) {
        setError('Room not found. Check the code and try again.');
        setChecking(false);
        return;
      }

      if (data.status === 'ended') {
        setError('This session has already ended.');
        setChecking(false);
        return;
      }

      navigate(`/play/${fullCode}`, { state: { playerName: trimmedName, gender, avatar } });
    } catch {
      setError('Could not connect. Please try again.');
      setChecking(false);
    }
  }, [fullCode, name, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F5F0]">
      {/* ── Host Section ─────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center border-b border-[#1A1A1A]/10 px-6 py-16">
        <p className="mb-3 text-[10px] uppercase tracking-[0.4em] text-[#1A1A1A]/30">
          Dinner Table Cards
        </p>
        <h1
          className="mb-3 text-3xl font-light italic text-[#1A1A1A] sm:text-4xl"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          Live Sessions
        </h1>
        <p
          className="mb-8 max-w-md text-center text-sm leading-relaxed text-[#1A1A1A]/50"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          Host a round at your dinner party. Everyone answers the same question,
          then reveal responses one by one.
        </p>
        <CreateSessionButton
          variant="primary"
          isAuthenticated={!!user}
          onNeedAuth={signInWithGoogle}
        >
          Host a New Session
        </CreateSessionButton>
        <p className="mt-3 text-[10px] uppercase tracking-wider text-[#1A1A1A]/30">
          {user ? '1 free session per week · Unlimited with Premium' : 'Sign in to host'}
        </p>
      </section>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-4 px-6 py-4">
        <div className="h-px flex-1 bg-[#1A1A1A]/10" />
        <span className="text-xs uppercase tracking-wider text-[#1A1A1A]/30">or join a session</span>
        <div className="h-px flex-1 bg-[#1A1A1A]/10" />
      </div>

      {/* ── Join Section ─────────────────────────────────────────────────── */}
      <section className="flex flex-1 flex-col items-center px-6 py-8">
        <h2
          className="mb-6 text-xl font-light italic text-[#1A1A1A]"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          Enter Room Code
        </h2>

        {/* Code input */}
        <div className="mb-6 flex gap-3" onPaste={handlePaste}>
          {Array.from({ length: CODE_LENGTH }).map((_, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="text"
              maxLength={1}
              value={code[i]}
              onChange={e => handleCodeInput(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              className={cn(
                'h-16 w-14 rounded-lg border-2 bg-white text-center text-2xl font-bold uppercase tracking-wider text-[#1A1A1A] shadow-sm outline-none transition-all sm:h-20 sm:w-16 sm:text-3xl',
                'focus:border-[#5A5A40] focus:ring-2 focus:ring-[#5A5A40]/20',
                error ? 'border-red-300' : 'border-[#1A1A1A]/10',
              )}
              style={{ fontFamily: 'ui-monospace, monospace' }}
            />
          ))}
        </div>

        {/* Name input */}
        <div className="mb-4 w-full max-w-xs">
          <label
            htmlFor="player-name"
            className="mb-1.5 block text-xs uppercase tracking-wider text-[#1A1A1A]/40"
          >
            Your Name
          </label>
          <input
            id="player-name"
            type="text"
            maxLength={30}
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
            placeholder="e.g. Alex"
            className="w-full rounded-lg border-2 border-[#1A1A1A]/10 bg-white px-4 py-3 text-[#1A1A1A] shadow-sm outline-none transition-all placeholder:text-[#1A1A1A]/20 focus:border-[#5A5A40] focus:ring-2 focus:ring-[#5A5A40]/20"
            style={{ fontFamily: 'Georgia, serif' }}
          />
        </div>

        {/* Avatar picker */}
        <div className="mb-6 w-full max-w-xs">
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-[#1A1A1A]/40">
            Choose Your Avatar
          </label>
          <AvatarPicker
            selectedGender={gender}
            selectedAvatar={avatar}
            onGenderChange={setGender}
            onAvatarChange={setAvatar}
          />
        </div>

        {/* Error */}
        {error && (
          <p className="mb-4 text-center text-sm text-red-600">{error}</p>
        )}

        {/* Join button */}
        <button
          onClick={handleJoin}
          disabled={checking || fullCode.length !== CODE_LENGTH || !name.trim()}
          className={cn(
            'rounded-full px-10 py-3.5 text-xs uppercase tracking-[0.3em] shadow-md transition-all',
            'bg-[#5A5A40] text-[#F5F2ED] hover:bg-[#4A4A34] hover:shadow-lg active:scale-[0.98]',
            'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none',
          )}
        >
          {checking ? 'Checking...' : 'Join Session'}
        </button>

        {/* Back link */}
        <a
          href="/"
          className="mt-8 text-xs uppercase tracking-wider text-[#1A1A1A]/30 transition-colors hover:text-[#1A1A1A]/60"
        >
          Back to Dinner Table Cards
        </a>
      </section>
    </div>
  );
}
