import { useState } from 'react';
import { cn } from '../../lib/utils';
import type { PlayerGender } from '../../types';

const AVATARS: Record<string, string[]> = {
  male: ['👨', '🧔', '👦', '🧑‍💼', '🤵', '🧙‍♂️', '👨‍🎤', '🦸‍♂️'],
  female: ['👩', '👧', '💃', '🧑‍💼', '👩‍🎤', '🧝‍♀️', '🧙‍♀️', '🦸‍♀️'],
  other: ['🧑', '🤖', '🦊', '🐱', '🌟', '🎭', '👽', '🦄'],
};

interface AvatarPickerProps {
  selectedGender: PlayerGender;
  selectedAvatar: string;
  onGenderChange: (gender: PlayerGender) => void;
  onAvatarChange: (avatar: string) => void;
}

export default function AvatarPicker({
  selectedGender,
  selectedAvatar,
  onGenderChange,
  onAvatarChange,
}: AvatarPickerProps) {
  const genderTabs: { value: PlayerGender; label: string }[] = [
    { value: 'male', label: '♂ Male' },
    { value: 'female', label: '♀ Female' },
    { value: 'other', label: '✦ Other' },
  ];

  const currentAvatars = AVATARS[selectedGender] || AVATARS.other;

  return (
    <div className="space-y-3">
      {/* Gender tabs */}
      <div className="flex gap-1.5">
        {genderTabs.map(tab => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              onGenderChange(tab.value);
              // Auto-select first avatar of new gender if current isn't in list
              if (!AVATARS[tab.value].includes(selectedAvatar)) {
                onAvatarChange(AVATARS[tab.value][0]);
              }
            }}
            className={cn(
              'flex-1 rounded-full px-3 py-1.5 text-xs transition-all',
              selectedGender === tab.value
                ? 'bg-[#5A5A40] text-[#F5F2ED]'
                : 'bg-[#1A1A1A]/5 text-[#1A1A1A]/50 hover:bg-[#1A1A1A]/10',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Avatar grid */}
      <div className="grid grid-cols-4 gap-2">
        {currentAvatars.map(avatar => (
          <button
            key={avatar}
            type="button"
            onClick={() => onAvatarChange(avatar)}
            className={cn(
              'aspect-square flex items-center justify-center rounded-xl text-2xl transition-all',
              selectedAvatar === avatar
                ? 'bg-[#5A5A40]/10 ring-2 ring-[#5A5A40] scale-110'
                : 'bg-[#1A1A1A]/3 hover:bg-[#1A1A1A]/8 hover:scale-105',
            )}
          >
            {avatar}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Default avatar for a gender */
export function getDefaultAvatar(gender: PlayerGender): string {
  return AVATARS[gender]?.[0] ?? '🧑';
}
