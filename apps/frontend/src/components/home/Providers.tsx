"use client";

import { MotionConfig, useReducedMotion } from "framer-motion";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import type { ReactNode } from "react";

/** Smooth scrolling + motion defaults for the marketing home page only. */
export function LandingProviders({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();

  return (
    <MotionConfig reducedMotion="user">
      {reduce ? (
        children
      ) : (
        <ReactLenis root options={{ lerp: 0.11, wheelMultiplier: 1, anchors: { offset: -84 } }}>
          {children}
        </ReactLenis>
      )}
    </MotionConfig>
  );
}
