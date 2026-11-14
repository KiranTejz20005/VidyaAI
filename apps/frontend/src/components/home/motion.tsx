"use client";

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/site";

/** Strong ease-out used for every entrance on the page. */
export const EASE = [0.23, 1, 0.32, 1] as const;

const VIEWPORT = { once: true, margin: "0px 0px -12% 0px" } as const;

/* -------------------------------------------------------------------------- */
/* Reveal: fade + rise when scrolled into view                                 */
/* -------------------------------------------------------------------------- */

export function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
  duration = 0.8,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, transform: `translateY(${reduce ? 0 : y}px)` }}
      whileInView={{ opacity: 1, transform: "translateY(0px)" }}
      viewport={VIEWPORT}
      transition={{ duration, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* SplitWords: headline words rise out of a clipped line                       */
/* Wrap a word in *asterisks* to set it in the serif italic accent.            */
/* -------------------------------------------------------------------------- */

export function SplitWords({
  text,
  className,
  delay = 0,
  stagger = 0.05,
  onMount = false,
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  /** Animate on mount instead of on scroll (for above-the-fold headlines). */
  onMount?: boolean;
}) {
  const reduce = useReducedMotion();
  const tokens = text.split(" ").map((raw) => {
    const m = /^\*(.+)\*$/.exec(raw);
    return { word: m ? m[1] : raw, accent: Boolean(m) };
  });
  const plain = tokens.map((t) => t.word).join(" ");

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren: delay } },
  };
  const child = {
    hidden: { opacity: reduce ? 0 : 1, transform: `translateY(${reduce ? 0 : 110}%)` },
    show: { opacity: 1, transform: "translateY(0%)", transition: { duration: 0.9, ease: EASE } },
  };

  return (
    <motion.span
      className={className}
      variants={container}
      initial="hidden"
      {...(onMount ? { animate: "show" } : { whileInView: "show", viewport: VIEWPORT })}
    >
      <span className="sr-only">{plain}</span>
      {tokens.map((t, i) => (
        <span
          key={i}
          aria-hidden
          className="-mb-[0.14em] inline-block overflow-hidden pb-[0.14em] align-bottom"
        >
          <motion.span
            variants={child}
            className={cn(
              "inline-block will-change-transform",
              t.accent && "pr-[0.06em] font-serif font-normal italic tracking-[-0.01em] text-brand",
            )}
          >
            {t.word}
            {i < tokens.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

/* -------------------------------------------------------------------------- */
/* ScrollWords: paragraph that inks itself in as you scroll through it         */
/* -------------------------------------------------------------------------- */

export function ScrollWords({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.88", "end 0.52"] });
  const words = text.split(" ");

  return (
    <p ref={ref} className={className}>
      <span className="sr-only">{text}</span>
      {words.map((word, i) => (
        <ScrollWord key={i} progress={scrollYProgress} from={i / words.length} to={(i + 1) / words.length}>
          {word}
        </ScrollWord>
      ))}
    </p>
  );
}

function ScrollWord({
  children,
  progress,
  from,
  to,
}: {
  children: string;
  progress: MotionValue<number>;
  from: number;
  to: number;
}) {
  const opacity = useTransform(progress, [from, to], [0.16, 1]);
  return (
    <motion.span aria-hidden style={{ opacity }} className="mr-[0.26em] inline-block">
      {children}
    </motion.span>
  );
}

/* -------------------------------------------------------------------------- */
/* Magnetic: element leans toward a fine pointer, springs back on leave        */
/* -------------------------------------------------------------------------- */

export function Magnetic({
  children,
  strength = 0.28,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { duration: 0.5, bounce: 0.2 });
  const sy = useSpring(y, { duration: 0.5, bounce: 0.2 });

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  }
  function onLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ x: sx, y: sy }}
      className={cn("inline-block", className)}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Counter: counts up once when it enters the viewport                         */
/* -------------------------------------------------------------------------- */

export function Counter({
  to,
  decimals = 0,
  duration = 1.8,
  className,
}: {
  to: number;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!inView || !el) return;
    if (reduce) {
      el.textContent = to.toFixed(decimals);
      return;
    }
    const controls = animate(0, to, {
      duration,
      ease: EASE,
      onUpdate: (v) => {
        el.textContent = v.toFixed(decimals);
      },
    });
    return () => controls.stop();
  }, [inView, reduce, to, decimals, duration]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {(0).toFixed(decimals)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Spotlight: card with a glow that follows the cursor                         */
/* -------------------------------------------------------------------------- */

export function Spotlight({
  children,
  className,
  dark = false,
}: {
  children: ReactNode;
  className?: string;
  dark?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  function onMove(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }
  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className={cn("spotlight relative", dark && "spotlight-dark", className)}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* useLoopStep: advance a step index on an interval while `active`             */
/* -------------------------------------------------------------------------- */

export function useLoopStep(count: number, ms: number, active: boolean) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % count), ms);
    return () => window.clearInterval(id);
  }, [count, ms, active]);
  return step;
}

/* -------------------------------------------------------------------------- */
/* Small shared pieces                                                         */
/* -------------------------------------------------------------------------- */

export function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.18em]",
        dark ? "border-white/15 bg-white/[0.06] text-brand-soft" : "border-brand/15 bg-brand-tint text-brand",
      )}
    >
      <span className="relative flex size-1.5">
        <span className="absolute inset-0 animate-ping-soft rounded-full bg-brand" />
        <span className="relative size-1.5 rounded-full bg-brand" />
      </span>
      {children}
    </span>
  );
}

export const headingClass =
  "text-balance text-[clamp(2.1rem,5.2vw,4.1rem)] font-medium leading-[1.04] tracking-[-0.04em]";
