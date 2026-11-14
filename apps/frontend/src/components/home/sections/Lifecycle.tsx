"use client";

import { AnimatePresence, motion, useInView } from "framer-motion";
import { Check, Download, ShieldAlert, Zap } from "lucide-react";
import { useRef } from "react";
import { EASE, Eyebrow, Reveal, SplitWords, headingClass, useLoopStep } from "@/components/home/motion";
import { cn } from "@/lib/site";

const PHASES = [
  { title: "Draft created", event: "POST /api/assignments", note: "Assignment saved with its blueprint" },
  { title: "Enqueued in BullMQ", event: "generation:queued", note: "queuePosition: 1" },
  { title: "Document extraction", event: "generation:progress", note: "Text pulled from PDF, DOCX and images" },
  { title: "Generation planning", event: "generation:progress", note: "Sections spread across Bloom levels" },
  { title: "Parallel AI batches", event: "generation:progress", note: "Chunks dispatched to the fallback chain" },
  { title: "Schema validation", event: "generation:progress", note: "Zod check with JSON auto-repair" },
  { title: "Answer key compiled", event: "generation:completed", note: "Rubrics and expected keywords" },
  { title: "A4 PDF rendered", event: "generation:pdf_ready", note: "Headless Chromium export" },
];

const QUESTIONS = [
  { w: 88, tag: "CO1 · L2" },
  { w: 72, tag: "CO2 · L3" },
  { w: 94, tag: "CO3 · L4" },
  { w: 66, tag: "CO3 · L3" },
  { w: 80, tag: "CO4 · L4" },
  { w: 58, tag: "CO5 · L5" },
];

const PROVIDERS = [
  { name: "NVIDIA NIM", tier: "Primary", fail: "429 rate-limit" },
  { name: "Groq Cloud", tier: "Fallback tier 1", fail: "timeout > 12s" },
  { name: "Anthropic Claude", tier: "Fallback tier 2", fail: "provider error" },
  { name: "OpenAI GPT-4o", tier: "Fallback tier 3", fail: "" },
];

export function Lifecycle() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const tick = useLoopStep(PHASES.length + 3, 1500, inView);
  const step = Math.min(tick, PHASES.length - 1);
  const pct = Math.round(((step + 1) / PHASES.length) * 100);

  return (
    <section id="engine" className="relative px-2 sm:px-4">
      <div className="relative overflow-hidden rounded-[36px] bg-night px-5 py-24 text-white sm:rounded-[48px] sm:py-32">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="grid-lines-dark absolute inset-0" />
          <div className="absolute left-1/2 top-[-20%] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-brand/30 blur-[140px]" />
        </div>

        <div className="relative mx-auto max-w-6xl">
          <div className="text-center">
            <Reveal>
              <Eyebrow dark>The exam engine</Eyebrow>
            </Reveal>
            <h2 className={cn(headingClass, "mx-auto mt-4 max-w-4xl")}>
              <SplitWords text="Watch a question paper *build* *itself.*" />
            </h2>
            <Reveal delay={0.15}>
              <p className="mx-auto mt-5 max-w-xl text-pretty text-[17px] leading-relaxed text-white/60">
                Generation runs in background workers and reports every phase over WebSockets, so
                faculty see progress live instead of a spinner.
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.1} className="mt-14 sm:mt-20">
            <div ref={ref} className="grid gap-4 lg:grid-cols-[1fr_1.05fr]">
              {/* Timeline */}
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className="relative flex size-2">
                      <span className="absolute inset-0 animate-ping-soft rounded-full bg-emerald-400" />
                      <span className="relative size-2 rounded-full bg-emerald-400" />
                    </span>
                    Live telemetry
                  </span>
                  <span className="font-mono text-xs tabular-nums text-white/50">{pct}%</span>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full w-full origin-left rounded-full bg-linear-to-r from-brand-soft to-sun transition-transform duration-700 ease-out-strong"
                    style={{ transform: `scaleX(${pct / 100})` }}
                  />
                </div>

                <ol className="mt-6 space-y-1">
                  {PHASES.map((p, i) => {
                    const state = i < step || tick >= PHASES.length ? "done" : i === step ? "active" : "todo";
                    return (
                      <li
                        key={p.title}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2 transition-[background-color,opacity] duration-300",
                          state === "active" && "bg-white/[0.07]",
                          state === "todo" && "opacity-35",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-300",
                            state === "done" ? "bg-emerald-400 text-night" : "bg-white/10",
                          )}
                        >
                          {state === "done" && <Check className="size-3" strokeWidth={3.5} />}
                          {state === "active" && <span className="size-2 animate-blink rounded-full bg-brand-soft" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-medium tracking-[-0.01em]">{p.title}</span>
                          <span className="block truncate text-[12px] text-white/45">{p.note}</span>
                        </span>
                        <span className="hidden shrink-0 rounded-md bg-white/[0.07] px-2 py-1 font-mono text-[10.5px] text-white/60 sm:block">
                          {p.event}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* Paper */}
              <div className="relative grid place-items-center rounded-[28px] border border-white/10 bg-white/[0.04] p-6 sm:p-10">
                <div className="relative w-full max-w-[400px]">
                  {/* Answer key sheet slides out from behind */}
                  <div
                    aria-hidden
                    className={cn(
                      "absolute inset-0 rounded-lg bg-[#fde3d6] transition-[transform,opacity] duration-700 ease-out-strong",
                      step >= 6 ? "translate-x-5 translate-y-3 rotate-3 opacity-100" : "opacity-0",
                    )}
                  >
                    <span className="absolute right-3 top-3 font-mono text-[9px] font-semibold text-brand">
                      ANSWER KEY
                    </span>
                  </div>

                  <div className="relative aspect-[1/1.3] rounded-lg bg-white p-6 text-ink shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8)] sm:p-7">
                    <div className="border-b border-black/10 pb-3 text-center">
                      <span className="mx-auto mb-2 block size-7 rounded-full border-2 border-ink/70" />
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.12em]">
                        Department of Computer Science
                      </span>
                      <span className="mt-0.5 block text-[10px] text-mute">
                        Mid-Semester Examination · CS301 Data Structures
                      </span>
                      <span className="mt-1.5 flex justify-between font-mono text-[9px] text-mute">
                        <span>Time: 90 min</span>
                        <span>Max marks: 50</span>
                      </span>
                    </div>

                    <span className="mt-4 block text-[10px] font-semibold">Part A · 10 × 2 marks</span>
                    <ul className="mt-2.5 space-y-2.5">
                      {QUESTIONS.map((q, i) => {
                        const visible = step >= 4 ? true : step === 3 ? i < 2 : false;
                        const validated = step >= 5;
                        return (
                          <li
                            key={i}
                            className={cn(
                              "flex items-center gap-2 transition-[opacity,transform] duration-500 ease-out-strong",
                              visible ? "opacity-100" : "translate-y-1.5 opacity-0",
                            )}
                            style={{ transitionDelay: visible ? `${i * 70}ms` : "0ms" }}
                          >
                            <span className="w-4 font-mono text-[9px] text-mute">{i + 1}.</span>
                            <span className="flex-1">
                              <span className="block h-1.5 rounded-full bg-black/15" style={{ width: `${q.w}%` }} />
                              {i % 2 === 0 && <span className="mt-1 block h-1.5 w-2/5 rounded-full bg-black/10" />}
                            </span>
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 font-mono text-[8.5px] font-medium transition-colors duration-300",
                                validated ? "bg-emerald-500/12 text-emerald-700" : "bg-brand-tint text-brand",
                              )}
                            >
                              {q.tag}
                            </span>
                          </li>
                        );
                      })}
                    </ul>

                    <AnimatePresence>
                      {step >= 7 && (
                        <motion.div
                          initial={{ opacity: 0, transform: "scale(0.9) rotate(-10deg)" }}
                          animate={{ opacity: 1, transform: "scale(1) rotate(-6deg)" }}
                          exit={{ opacity: 0, transform: "scale(0.95) rotate(-6deg)" }}
                          transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
                          className="absolute bottom-6 right-5 flex items-center gap-2 rounded-full bg-emerald-500 py-2 pl-2.5 pr-4 text-[12px] font-semibold text-white shadow-[0_14px_30px_-10px_rgb(16_185_129/0.8)]"
                        >
                          <span className="grid size-6 place-items-center rounded-full bg-white/25">
                            <Download className="size-3.5" />
                          </span>
                          PDF ready
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          <FallbackChain />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Inference fallback chain                                                    */
/* -------------------------------------------------------------------------- */

function FallbackChain() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15% 0px" });
  const hop = useLoopStep(PROVIDERS.length + 1, 2100, inView);
  const active = Math.min(hop, PROVIDERS.length - 1);

  return (
    <Reveal className="mt-4">
      <div ref={ref} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-lg">
            <h3 className="text-2xl font-medium tracking-[-0.03em] sm:text-[28px]">
              Four gateways. One answer, every time.
            </h3>
            <p className="mt-2 text-[15px] leading-relaxed text-white/55">
              A circuit breaker isolates any provider that errors or stalls past 12 seconds and
              routes the request to the next tier.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3 py-1.5 font-mono text-[11px] text-white/70">
            <Zap className="size-3.5 text-sun" fill="currentColor" strokeWidth={0} />
            designed for 99.9% uptime
          </span>
        </div>

        <ol className="mt-8 grid gap-3 md:grid-cols-4">
          {PROVIDERS.map((p, i) => {
            const tripped = i < active;
            const serving = i === active;
            return (
              <li
                key={p.name}
                className={cn(
                  "relative rounded-2xl border p-4 transition-[background-color,border-color,opacity] duration-500 ease-out-strong",
                  serving && "border-emerald-400/50 bg-emerald-400/[0.08]",
                  tripped && "border-red-400/30 bg-red-400/[0.06]",
                  !serving && !tripped && "border-white/10 opacity-50",
                )}
              >
                <span className="flex items-center justify-between">
                  <span className="font-mono text-[10.5px] uppercase tracking-wider text-white/45">{p.tier}</span>
                  <span
                    className={cn(
                      "size-2 rounded-full transition-colors duration-300",
                      serving ? "bg-emerald-400" : tripped ? "bg-red-400" : "bg-white/25",
                    )}
                  />
                </span>
                <span className="mt-2 block text-[17px] font-medium tracking-[-0.02em]">{p.name}</span>
                <span className="mt-2 flex h-5 items-center gap-1.5 text-[12px]">
                  {serving && (
                    <motion.span
                      key="ok"
                      initial={{ opacity: 0, transform: "translateY(4px)" }}
                      animate={{ opacity: 1, transform: "translateY(0px)" }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="flex items-center gap-1.5 text-emerald-300"
                    >
                      <Check className="size-3.5" strokeWidth={3} /> Serving request
                    </motion.span>
                  )}
                  {tripped && (
                    <motion.span
                      key="bad"
                      initial={{ opacity: 0, transform: "translateY(4px)" }}
                      animate={{ opacity: 1, transform: "translateY(0px)" }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="flex items-center gap-1.5 font-mono text-[11px] text-red-300"
                    >
                      <ShieldAlert className="size-3.5" /> circuit open · {p.fail}
                    </motion.span>
                  )}
                  {!serving && !tripped && <span className="text-white/40">Standing by</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </Reveal>
  );
}
