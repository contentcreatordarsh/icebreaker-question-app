import { memo } from 'react';
import { motion } from 'motion/react';
import type { RevealedAnswer } from '../../types';
import { cn } from '../../lib/utils';

export interface AnswerCardProps {
  answer: RevealedAnswer;
  index: number;
  isNew?: boolean;
  className?: string;
}

const CARD_COLORS = [
  'from-amber-50 to-amber-100 border-amber-200',
  'from-emerald-50 to-emerald-100 border-emerald-200',
  'from-sky-50 to-sky-100 border-sky-200',
  'from-violet-50 to-violet-100 border-violet-200',
  'from-rose-50 to-rose-100 border-rose-200',
  'from-orange-50 to-orange-100 border-orange-200',
  'from-teal-50 to-teal-100 border-teal-200',
  'from-indigo-50 to-indigo-100 border-indigo-200',
];

/**
 * A single revealed answer card with a spring entrance animation.
 * Uses framer-motion for smooth, staggered reveal.
 */
const AnswerCard = memo(function AnswerCard({ answer, index, isNew, className }: AnswerCardProps) {
  const colorClass = CARD_COLORS[index % CARD_COLORS.length];

  return (
    <motion.div
      className={cn('', className)}
      initial={isNew ? { opacity: 0, y: 30, scale: 0.95 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 25,
        delay: isNew ? 0.1 : 0,
      }}
    >
      <div
        className={cn(
          'rounded-xl border bg-gradient-to-br p-4 shadow-sm transition-shadow hover:shadow-md',
          colorClass,
        )}
      >
        <p className="mb-2 text-base leading-relaxed text-[#1A1A1A]" style={{ fontFamily: 'Georgia, serif' }}>
          "{answer.answer}"
        </p>
        <div className="flex items-center justify-end gap-1.5">
          {answer.avatar && <span className="text-sm">{answer.avatar}</span>}
          <p className="text-xs font-medium uppercase tracking-wider text-[#1A1A1A]/50">
            — {answer.name}
          </p>
        </div>
      </div>
    </motion.div>
  );
});

export default AnswerCard;
