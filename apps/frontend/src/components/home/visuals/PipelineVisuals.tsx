"use client";

import { motion } from "framer-motion";
import { Check, Download, MousePointer2, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Counter, EASE } from "@/components/home/motion";
import { cn } from "@/lib/site";
import { Matrix } from "./Matrix";

/**
 * Each visual is a Stage: one in-view trigger on the root, children animate through variants.
 * Bars start at scale 0 (zero size), so they could never observe themselves entering the viewport.
 */
function Stage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const rise = (delay: number) => ({
  variants: {
    hidden: { opacity: 0, transform: "translateY(14px)" },
    show: {
      opacity: 1,
      transform: "translateY(0px)",
      transition: { duration: 0.6, delay, ease: EASE },
    },
  },
});

const grow = (delay: number, duration = 1) => ({
  variants: {
    hidden: { transform: "scaleX(0)" },
    show: { transform: "scaleX(1)", transition: { duration, delay, ease: EASE } },
  },
});

/* ------------------------------ 1. Extraction ------------------------------ */

const UNITS = [
  { n: 1, title: "Arrays, Stacks & Queues", bloom: "L2 Understand", co: "CO1" },
  { n: 2, title: "Linked Lists", bloom: "L3 Apply", co: "CO2" },
  { n: 3, title: "Trees & Heaps", bloom: "L4 Analyze", co: "CO3" },
  { n: 4, title: "Graph Algorithms", bloom: "L4 Analyze", co: "CO4" },
  { n: 5, title: "Hashing & Complexity", bloom: "L5 Evaluate", co: "CO5" },
];

const CORNERS = [
  "left-3 top-3 rounded-tl-xl border-l-[3px] border-t-[3px]",
  "right-3 top-3 rounded-tr-xl border-r-[3px] border-t-[3px]",
  "bottom-3 left-3 rounded-bl-xl border-b-[3px] border-l-[3px]",
  "bottom-3 right-3 rounded-br-xl border-b-[3px] border-r-[3px]",
];

export function ExtractVisual() {
  return (
    <Stage className="grid h-full gap-4 sm:grid-cols-[0.9fr_1.1fr] sm:gap-5">
      {/* Scanned page */}
      <div className="relative grid min-h-64 place-items-center overflow-hidden rounded-2xl bg-[#f3efe7] p-6">
        {CORNERS.map((c) => (
          <span key={c} aria-hidden className={cn("absolute size-7 border-brand", c)} />
        ))}
        <div className="relative w-[84%] -rotate-2 rounded-md bg-white p-4 shadow-[0_16px_34px_-16px_rgb(16_17_20/0.35)]">
          <div className="mb-3 flex items-center justify-between font-mono text-[8px] text-black/30 line-through decoration-red-400">
            <span>9:41</span>
            <span>5G ▮▮▮ 82%</span>
          </div>
          <span className="block h-2 w-2/3 rounded-full bg-black/25" />
          <div className="mt-3 space-y-[7px]">
            {[92, 78, 85, 60, 88, 72, 80, 50, 86, 64, 76].map((w, i) => (
              <span key={i} className="block h-1 rounded-full bg-black/12" style={{ width: `${w}%` }} />
            ))}
          </div>
          <span className="mt-3 block font-mono text-[8px] text-black/35 line-through decoration-red-400">
            Revision of Mid-1 · Seminar 3
          </span>
        </div>
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1/4 animate-scan border-b-2 border-brand bg-linear-to-b from-transparent to-brand/20"
        />
      </div>

      {/* Structured output */}
      <div className="flex flex-col">
        <motion.div {...rise(0.1)} className="flex flex-wrap gap-1.5">
          {["pdf", "png", "jpg", "webp", "docx", "txt", "md"].map((f) => (
            <span
              key={f}
              className="rounded-md bg-black/[0.05] px-2 py-1 font-mono text-[10px] font-medium text-ink-soft"
            >
              .{f}
            </span>
          ))}
        </motion.div>
        <ul className="mt-4 flex-1 space-y-2">
          {UNITS.map((u, i) => (
            <motion.li
              key={u.n}
              {...rise(0.25 + i * 0.09)}
              className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-tint font-mono text-xs font-semibold text-brand">
                {u.n}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{u.title}</span>
              <span className="hidden font-mono text-[10px] text-mute md:block">{u.bloom}</span>
              <span className="rounded-md bg-night px-1.5 py-0.5 font-mono text-[10px] font-medium text-white">
                {u.co}
              </span>
            </motion.li>
          ))}
        </ul>
        <motion.p {...rise(0.8)} className="mt-3 flex items-center gap-2 text-[11px] text-mute">
          <Check className="size-3.5 shrink-0 text-emerald-600" strokeWidth={3} />
          Status bars, AI preambles and calendar noise stripped
        </motion.p>
      </div>
    </Stage>
  );
}

/* -------------------------------- 2. Matrix -------------------------------- */

export function MatrixVisual() {
  return (
    <Stage className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">CO–PO correlation · CS301</span>
        <span className="flex items-center gap-3 text-[11px] text-mute">
          <span className="flex items-center gap-1.5">
            <i className="size-2.5 rounded bg-brand/15" />1 Low
          </span>
          <span className="flex items-center gap-1.5">
            <i className="size-2.5 rounded bg-brand/50" />2 Medium
          </span>
          <span className="flex items-center gap-1.5">
            <i className="size-2.5 rounded bg-brand" />3 High
          </span>
        </span>
      </div>
      <div className="relative mt-5 flex-1">
        <Matrix size="lg" highlight={[2, 3]} />
        <motion.div
          variants={{
            // Kept small on x: a larger offset pushes the label past a phone viewport before it settles.
            hidden: { opacity: 0, transform: "translate(12px, 36px)" },
            show: {
              opacity: 1,
              transform: "translate(0px, 0px)",
              transition: { duration: 0.9, delay: 1.2, ease: EASE },
            },
          }}
          className="pointer-events-none absolute left-[58%] top-[49%] flex items-start gap-1 sm:left-[62%]"
        >
          <MousePointer2 className="size-5 fill-ink text-white" />
          <span className="mt-3 whitespace-nowrap rounded-full bg-sun px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg">
            Faculty override
          </span>
        </motion.div>
      </div>
      <motion.p {...rise(1)} className="mt-4 text-[12px] text-mute">
        Weights are synthesised from topic keywords and Bloom distribution. Any cell can be set to
        1, 2, 3 or left unmapped.
      </motion.p>
    </Stage>
  );
}

/* ------------------------------- 3. Blueprint ------------------------------ */

const SECTIONS = [
  { part: "Part A", desc: "10 × 2 marks · Short Answer", marks: 20, w: 40 },
  { part: "Part B", desc: "3 × 10 marks · Long Essay · internal choice", marks: 30, w: 60 },
];
const BLOOM_MIX = [
  { l: "L1–L2", w: 30, c: "bg-brand/20" },
  { l: "L3", w: 30, c: "bg-brand/45" },
  { l: "L4", w: 25, c: "bg-brand/70" },
  { l: "L5–L6", w: 15, c: "bg-brand" },
];
const CO_COVER = [20, 20, 24, 20, 16];

export function BlueprintVisual() {
  return (
    <Stage className="flex h-full flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Mid-Semester blueprint</span>
        <span className="rounded-full bg-black/[0.05] px-2.5 py-1 font-mono text-[11px] text-ink-soft">
          50 marks · 90 min
        </span>
      </div>

      <div className="space-y-3">
        {SECTIONS.map((s, i) => (
          <motion.div
            key={s.part}
            {...rise(0.1 + i * 0.1)}
            className="rounded-xl border border-line bg-white p-3.5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold">{s.part}</span>
              <span className="flex-1 truncate text-[12px] text-mute">{s.desc}</span>
              <span className="font-mono text-xs font-medium">{s.marks}</span>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-black/[0.05]">
              <motion.div
                {...grow(0.35 + i * 0.12)}
                style={{ width: `${s.w}%` }}
                className="h-full origin-left rounded-full bg-linear-to-r from-brand to-brand-soft"
              />
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div {...rise(0.4)}>
        <span className="text-[12px] font-medium text-ink-soft">Bloom level allocation</span>
        <div className="mt-2 flex h-9 gap-1 overflow-hidden rounded-xl">
          {BLOOM_MIX.map((b, i) => (
            <motion.div
              key={b.l}
              variants={{
                hidden: { opacity: 0, transform: "scaleX(0.6)" },
                show: {
                  opacity: 1,
                  transform: "scaleX(1)",
                  transition: { duration: 0.7, delay: 0.55 + i * 0.08, ease: EASE },
                },
              }}
              style={{ width: `${b.w}%` }}
              className={cn(
                "grid origin-left place-items-center rounded-lg font-mono text-[10px] font-medium",
                b.c,
                i > 1 ? "text-white" : "text-brand",
              )}
            >
              {b.l}
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div {...rise(0.55)} className="mt-auto">
        <span className="text-[12px] font-medium text-ink-soft">Target CO coverage</span>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {CO_COVER.map((v, i) => (
            <div key={i} className="rounded-lg bg-black/[0.04] px-2 py-2 text-center">
              <span className="block font-mono text-[10px] text-mute">CO{i + 1}</span>
              <span className="block text-sm font-semibold tracking-[-0.03em]">{v}%</span>
            </div>
          ))}
        </div>
      </motion.div>
    </Stage>
  );
}

/* ---------------------------------- 4. SAR --------------------------------- */

const ATTAIN = [72, 68, 64, 58, 71];
const TARGET = 60;

export function SarVisual() {
  return (
    <Stage className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="block font-mono text-[11px] text-brand">NBA SAR · Criterion 3</span>
          <span className="mt-0.5 block text-sm font-semibold">Direct course attainment</span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[11px] font-medium text-white">
          <Download className="size-3" /> Export PDF
        </span>
      </div>

      <ul className="mt-5 flex-1 space-y-3">
        {ATTAIN.map((v, i) => {
          const ok = v >= TARGET;
          return (
            <motion.li key={i} {...rise(0.1 + i * 0.08)} className="flex items-center gap-3">
              <span className="w-8 font-mono text-xs font-medium text-mute">CO{i + 1}</span>
              <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-black/[0.045]">
                <motion.div
                  {...grow(0.3 + i * 0.09, 1.1)}
                  style={{ width: `${v}%` }}
                  className={cn(
                    "h-full origin-left rounded-lg",
                    ok
                      ? "bg-linear-to-r from-brand to-brand-soft"
                      : "bg-linear-to-r from-amber-500 to-amber-400",
                  )}
                />
                <span
                  aria-hidden
                  className="absolute inset-y-0 w-px border-l-2 border-dashed border-ink/50"
                  style={{ left: `${TARGET}%` }}
                />
              </div>
              <span className="w-10 text-right font-mono text-xs font-semibold">{v}%</span>
              <span
                className={cn(
                  "hidden w-24 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium sm:inline-flex",
                  ok ? "bg-emerald-500/12 text-emerald-700" : "bg-amber-500/15 text-amber-700",
                )}
              >
                {ok ? <Check className="size-3" strokeWidth={3} /> : <TriangleAlert className="size-3" />}
                {ok ? "Attained" : "Below target"}
              </span>
            </motion.li>
          );
        })}
      </ul>

      <motion.div
        {...rise(0.7)}
        className="mt-5 flex items-center justify-between rounded-xl bg-night px-4 py-3 text-white"
      >
        <span className="text-[12px] text-white/60">
          Overall attainment
          <span className="ml-2 font-mono text-white/40">target {TARGET}%</span>
        </span>
        <span className="text-xl font-semibold tracking-[-0.04em]">
          <Counter to={66.6} decimals={1} duration={1.6} />%
        </span>
      </motion.div>
    </Stage>
  );
}
