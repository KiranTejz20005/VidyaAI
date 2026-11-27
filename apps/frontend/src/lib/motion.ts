/**
 * Shared motion primitives. Transform + opacity only.
 * Values mirror the CSS tokens in globals.css (--ease-out, --dur-*).
 */
import { useReducedMotion, type Transition, type Variants } from 'framer-motion';

export const easeOut = [0.23, 1, 0.32, 1] as const;
export const easeInOut = [0.77, 0, 0.175, 1] as const;

export const duration = { fast: 0.15, base: 0.2, slow: 0.25 } as const;

/** Interruptible springs. Keep bounce low; UI is not a toy. */
export const springs = {
  /** Panels, drawers, sidebar. */
  panel: { type: 'spring', duration: 0.4, bounce: 0.1 } as Transition,
  /** Small controls, indicators. */
  snappy: { type: 'spring', duration: 0.28, bounce: 0.15 } as Transition,
} as const;

export const STAGGER_MS = 40;
export const STAGGER_MAX = 8; // never stagger past 8 items

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: duration.base, ease: easeOut } },
};

export const rise: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: easeOut } },
};

export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER_MS / 1000, delayChildren: 0.02 } },
};

/** Per-item delay (seconds), capped so long lists do not feel slow. */
export function staggerDelay(index: number): number {
  return Math.min(index, STAGGER_MAX) * (STAGGER_MS / 1000);
}

/** Reduced-motion variant: opacity only, no movement. */
export function useMotionVariants(): { item: Variants; container: Variants; reduced: boolean } {
  const reduced = !!useReducedMotion();
  return {
    reduced,
    container: reduced ? { hidden: {}, show: {} } : staggerContainer,
    item: reduced ? fade : rise,
  };
}

export { useReducedMotion };
