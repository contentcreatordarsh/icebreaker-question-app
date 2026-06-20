/**
 * Shared framer-motion animation variants and presets.
 * Import these across game components and pages for consistent motion.
 */

// Parent container that staggers children
export const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

// Fade up — great for text and cards entering
export const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

// Pop in with spring — for buttons, badges, avatars
export const pop = {
  hidden: { scale: 0.8, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 20 },
  },
};

// Slide in from left
export const slideInLeft = {
  hidden: { x: -30, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
};

// Slide in from right
export const slideInRight = {
  hidden: { x: 30, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
};

// Scale fade — for modals and overlays
export const scaleFade = {
  hidden: { scale: 0.95, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  exit: {
    scale: 0.95,
    opacity: 0,
    transition: { duration: 0.15, ease: 'easeIn' },
  },
};

// Count up animation config
export const countUp = {
  duration: 1.5,
  ease: [0.25, 0.46, 0.45, 0.94] as const,
};

// Hover lift — apply with whileHover
export const hoverLift = {
  y: -4,
  transition: { duration: 0.2, ease: 'easeOut' },
};

// Tap scale — apply with whileTap
export const tapScale = {
  scale: 0.97,
};

// Pulse animation for attention-grabbing elements
export const pulse = {
  scale: [1, 1.05, 1],
  transition: {
    duration: 2,
    repeat: Infinity,
    ease: 'easeInOut',
  },
};
