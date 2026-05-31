import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface SoundToggleProps {
  onToggle: () => boolean; // returns new muted state
  getMuted: () => boolean;
}

/**
 * Mute/unmute toggle button for session sound effects.
 */
export default function SoundToggle({ onToggle, getMuted }: SoundToggleProps) {
  const [muted, setMuted] = useState(getMuted);

  function handleClick() {
    const newMuted = onToggle();
    setMuted(newMuted);
  }

  return (
    <button
      onClick={handleClick}
      className="rounded-full p-2 text-[#1A1A1A]/30 transition-colors hover:bg-[#1A1A1A]/5 hover:text-[#1A1A1A]/60"
      aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
      title={muted ? 'Unmute sounds' : 'Mute sounds'}
    >
      {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
    </button>
  );
}
