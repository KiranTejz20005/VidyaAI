'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useReducedMotion } from '@/lib/motion';

/**
 * Page enter transition (opacity + 6px rise, 200ms ease-out) via WAAPI.
 * No remount (layout state survives), interruptible, skipped on first paint
 * and for reduced motion (opacity only).
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const first = useRef(true);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    const anim = el.animate(
      reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: 'translateY(6px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
      { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
    );
    return () => anim.cancel();
  }, [pathname, reduced]);

  return <div ref={ref}>{children}</div>;
}
