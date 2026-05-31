import { useCallback, useRef } from 'react';

/**
 * Lightweight sound effects via Web Audio API (no external files needed).
 * Respects `prefers-reduced-motion` and localStorage mute toggle.
 * Call `play('join')`, `play('submit')`, etc. to trigger.
 */
export function useSoundEffects() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getContext = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return ctxRef.current;
  }, []);

  const isMuted = useCallback(() => {
    if (typeof window === 'undefined') return true;
    // Check user preference
    if (localStorage.getItem('dtc-sound-muted') === 'true') return true;
    // Check prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    return false;
  }, []);

  const playTone = useCallback((frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) => {
    if (isMuted()) return;
    try {
      const ctx = getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio not available
    }
  }, [getContext, isMuted]);

  const play = useCallback((sound: 'join' | 'submit' | 'reveal' | 'vote' | 'win' | 'tick') => {
    switch (sound) {
      case 'join':
        // Soft rising chime
        playTone(523, 0.15, 'sine', 0.1);
        setTimeout(() => playTone(659, 0.2, 'sine', 0.12), 100);
        break;
      case 'submit':
        // Quick confirmation blip
        playTone(880, 0.1, 'sine', 0.08);
        break;
      case 'reveal':
        // Gentle pop
        playTone(440, 0.08, 'triangle', 0.12);
        setTimeout(() => playTone(660, 0.12, 'triangle', 0.1), 60);
        break;
      case 'vote':
        // Soft click
        playTone(1200, 0.05, 'square', 0.05);
        break;
      case 'win':
        // Celebratory ascending notes
        playTone(523, 0.15, 'sine', 0.12);
        setTimeout(() => playTone(659, 0.15, 'sine', 0.12), 120);
        setTimeout(() => playTone(784, 0.25, 'sine', 0.14), 240);
        break;
      case 'tick':
        // Subtle tick for timer
        playTone(1000, 0.03, 'square', 0.03);
        break;
    }
  }, [playTone]);

  const toggleMute = useCallback(() => {
    const current = localStorage.getItem('dtc-sound-muted') === 'true';
    localStorage.setItem('dtc-sound-muted', String(!current));
    return !current; // returns new muted state
  }, []);

  const getMuted = useCallback(() => {
    return localStorage.getItem('dtc-sound-muted') === 'true';
  }, []);

  return { play, toggleMute, getMuted };
}
