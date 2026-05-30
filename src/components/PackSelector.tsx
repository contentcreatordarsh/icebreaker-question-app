import React, { useRef } from 'react';
import { motion } from 'motion/react';
import { Lock, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { QuestionPack } from '../types';
import { cn } from '../lib/utils';

interface PackSelectorProps {
  packs: QuestionPack[];
  activePack: QuestionPack | null;
  packIndex: number;
  isPremium: boolean;
  onSelectPack: (pack: QuestionPack) => void;
  onExitPack: () => void;
  onPackNext: () => void;
  onPackPrev: () => void;
  onUpgrade: () => void;
}

export default function PackSelector({
  packs,
  activePack,
  packIndex,
  isPremium,
  onSelectPack,
  onExitPack,
  onPackNext,
  onPackPrev,
  onUpgrade,
}: PackSelectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === 'right' ? 260 : -260, behavior: 'smooth' });
  };

  return (
    <div className="w-full px-4 md:px-8 mb-10">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4 max-w-4xl mx-auto">
        <span className="caps-tracking opacity-30 text-[10px]">Question Packs</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => scroll('left')}
            className="p-1 opacity-30 hover:opacity-80 transition-opacity"
            aria-label="Scroll left"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => scroll('right')}
            className="p-1 opacity-30 hover:opacity-80 transition-opacity"
            aria-label="Scroll right"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Active pack progress bar */}
      {activePack && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto mb-4 flex items-center gap-4 bg-brand/5 border border-brand/10 rounded-sm px-5 py-3"
        >
          <span className="text-lg">{activePack.emoji}</span>
          <div className="flex-1">
            <div className="flex justify-between mb-1.5">
              <span className="caps-tracking text-[10px]">{activePack.name}</span>
              <span className="caps-tracking text-[10px] opacity-40">
                {packIndex + 1} / {activePack.questions.length}
              </span>
            </div>
            <div className="h-[2px] bg-brand/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand/40 transition-all duration-300"
                style={{ width: `${((packIndex + 1) / activePack.questions.length) * 100}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onPackPrev}
              disabled={packIndex === 0}
              className="p-1.5 opacity-40 hover:opacity-100 disabled:opacity-20 transition-opacity"
              aria-label="Previous question"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={onPackNext}
              disabled={packIndex >= activePack.questions.length - 1}
              className="p-1.5 opacity-40 hover:opacity-100 disabled:opacity-20 transition-opacity"
              aria-label="Next question"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={onExitPack}
              className="p-1.5 opacity-40 hover:opacity-100 transition-opacity ml-1"
              aria-label="Exit pack"
            >
              <X size={13} />
            </button>
          </div>
        </motion.div>
      )}

      {/* Pack cards — horizontal scroll */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 no-scrollbar max-w-4xl mx-auto"
      >
        {packs.map((pack) => {
          const isLocked = pack.isPremium && !isPremium;
          const isActive = activePack?.id === pack.id;

          return (
            <button
              key={pack.id}
              onClick={() => {
                if (isLocked) { onUpgrade(); return; }
                if (isActive) { onExitPack(); return; }
                onSelectPack(pack);
              }}
              className={cn(
                'flex-shrink-0 w-44 sm:w-52 text-left rounded-sm border transition-all group relative overflow-hidden',
                isActive
                  ? 'border-brand/40 shadow-md scale-[1.02]'
                  : 'border-brand/10 hover:border-brand/30 hover:shadow-sm',
                isLocked && 'opacity-70',
              )}
              style={{ background: pack.gradient }}
            >
              {/* Decorative glow */}
              <div
                className="absolute top-0 right-0 w-16 h-16 opacity-20 pointer-events-none"
                style={{ background: `radial-gradient(circle at 100% 0%, ${pack.accent}, transparent 70%)` }}
              />

              <div className="relative p-5">
                {/* Emoji + badges */}
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl leading-none">{pack.emoji}</span>
                  <div className="flex flex-col items-end gap-1">
                    {pack.isPremium ? (
                      isLocked ? (
                        <span className="flex items-center gap-1 text-[9px] caps-tracking bg-white/60 px-2 py-0.5 rounded-sm">
                          <Lock size={7} /> Pro
                        </span>
                      ) : (
                        <span className="text-[9px] caps-tracking bg-white/60 px-2 py-0.5 rounded-sm" style={{ color: pack.accent }}>
                          Pro
                        </span>
                      )
                    ) : (
                      <span className="text-[9px] caps-tracking bg-white/60 px-2 py-0.5 rounded-sm text-brand/50">
                        Free
                      </span>
                    )}
                    {isActive && (
                      <span className="text-[9px] caps-tracking bg-brand text-white px-2 py-0.5 rounded-sm">
                        Active
                      </span>
                    )}
                  </div>
                </div>

                {/* Name + tagline */}
                <h3 className="font-serif text-base text-brand mb-1 leading-tight">{pack.name}</h3>
                <p className="caps-tracking text-[10px] opacity-50 mb-3 leading-relaxed">{pack.tagline}</p>

                {/* Question count */}
                <div className="flex items-center justify-between">
                  <span className="caps-tracking text-[10px] opacity-40">
                    {pack.questions.length} questions
                  </span>
                  <span
                    className="caps-tracking text-[10px] group-hover:opacity-100 opacity-50 transition-opacity"
                    style={{ color: pack.accent }}
                  >
                    {isActive ? 'Exit →' : isLocked ? 'Unlock' : 'Start →'}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
