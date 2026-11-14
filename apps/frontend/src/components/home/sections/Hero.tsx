"use client";

import { motion, useInView, useScroll, useTransform } from "framer-motion";
import {
  Bell,
  BookOpenCheck,
  Check,
  FileCheck2,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Library,
  LineChart,
  MessagesSquare,
  Sparkles,
  Target,
} from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/home/Button";
import { Logo } from "@/components/home/Logo";
import { Counter, EASE, Magnetic, SplitWords, useLoopStep } from "@/components/home/motion";
import { Matrix } from "@/components/home/visuals/Matrix";
import { cn, site } from "@/lib/site";

const PHASES = [
  "Queued in BullMQ",
  "Extracting syllabus",
  "Planning Bloom mix",
  "Parallel AI batches",
  "Schema validation",
  "Compiling answer key",
  "Rendering A4 PDF",
];

const BLOOM = [
  { label: "Remember", short: "L1", v: 38 },
  { label: "Understand", short: "L2", v: 62 },
  { label: "Apply", short: "L3", v: 88 },
  { label: "Analyze", short: "L4", v: 74 },
  { label: "Evaluate", short: "L5", v: 46 },
  { label: "Create", short: "L6", v: 30 },
];

export function Hero() {
  const { scrollY } = useScroll();
  const rotateX = useTransform(scrollY, [0, 620], [14, 0]);
  const scale = useTransform(scrollY, [0, 620], [0.94, 1]);
  const lift = useTransform(scrollY, [0, 620], [0, -28]);
  const floatA = useTransform(scrollY, [0, 900], [0, -110]);
  const floatB = useTransform(scrollY, [0, 900], [0, -190]);

  return (
    <section id="top" className="noise relative overflow-clip pb-10 pt-36 sm:pt-44">
      {/* Atmosphere */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="aurora absolute inset-x-[-10%] top-[-18%] h-[95vh] opacity-80" />
        <div className="grid-lines absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-linear-to-b from-transparent to-paper" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 text-center">
        <motion.div
          initial={{ opacity: 0, transform: "translateY(12px) scale(0.96)" }}
          animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
          transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
          className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/70 py-1.5 pl-2 pr-3.5 text-[12px] font-medium text-ink-soft shadow-card backdrop-blur sm:gap-2.5 sm:pr-4 sm:text-[13px]"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-2.5 py-0.5 text-[12px] font-semibold text-brand">
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 animate-ping-soft rounded-full bg-brand" />
              <span className="relative size-1.5 rounded-full bg-brand" />
            </span>
            OBE
          </span>
          <span>
            Built for NBA, NAAC <span className="sm:hidden">&amp;</span>
            <span className="hidden sm:inline">and</span> Washington Accord
            <span className="hidden sm:inline"> workflows</span>
          </span>
        </motion.div>

        <h1 className="mx-auto mt-7 max-w-5xl text-[clamp(2.9rem,8.6vw,6.6rem)] font-medium leading-[0.98] tracking-[-0.055em]">
          <SplitWords text="Syllabus in." onMount delay={0.2} className="block" />
          <motion.span
            initial={{ opacity: 0, transform: "translateY(26px) scale(0.96) rotate(-1.5deg)" }}
            animate={{ opacity: 1, transform: "translateY(0px) scale(1) rotate(0deg)" }}
            transition={{ duration: 0.9, delay: 0.42, ease: EASE }}
            className="relative mt-2 inline-block rounded-[0.28em] bg-brand-tint px-[0.22em] pb-[0.1em] text-brand shadow-[inset_0_0_0_1px_rgb(224_89_52/0.12)] sm:mt-3"
          >
            <span className="font-serif font-normal italic tracking-[-0.02em]">Accreditation</span> out.
            <Sparkles
              aria-hidden
              className="absolute -right-3 -top-3 size-[0.42em] animate-float text-sun sm:-right-5 sm:-top-4"
              fill="currentColor"
              strokeWidth={0}
            />
          </motion.span>
        </h1>

        <motion.p
          initial={{ opacity: 0, transform: "translateY(16px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          transition={{ duration: 0.8, delay: 0.62, ease: EASE }}
          className="mx-auto mt-7 max-w-2xl text-pretty text-[17px] leading-relaxed text-ink-soft sm:text-lg"
        >
          {site.name} turns raw syllabi into CO-PO matrices, Bloom-balanced exam papers, answer
          keys and NBA SAR reports. A Socratic AI tutor keeps every student learning in between.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, transform: "translateY(16px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          transition={{ duration: 0.8, delay: 0.74, ease: EASE }}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <Magnetic>
            <Button href={site.links.getStarted} arrow>
              Get started
            </Button>
          </Magnetic>
          <Magnetic>
            <Button href="#pipeline" variant="secondary">
              See how it works
            </Button>
          </Magnetic>
        </motion.div>

        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.95 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[13px] text-mute"
        >
          {["Open source, MIT licensed", "Self-hostable", "179+ passing tests"].map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5">
              <Check aria-hidden className="size-3.5 text-brand" strokeWidth={3} />
              {t}
            </li>
          ))}
        </motion.ul>
      </div>

      {/* Product mock with scroll-driven tilt */}
      <div className="relative mx-auto mt-16 max-w-[1120px] px-3 [perspective:1600px] sm:mt-20 sm:px-5">
        <motion.div
          initial={{ opacity: 0, transform: "translateY(60px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          transition={{ duration: 1.1, delay: 0.55, ease: EASE }}
        >
          <motion.div style={{ rotateX, scale, y: lift }} className="origin-top will-change-transform">
            <Dashboard />
          </motion.div>
        </motion.div>

        {/* Floating telemetry cards */}
        <motion.div
          style={{ y: floatA }}
          className="pointer-events-none absolute -left-6 top-[34%] hidden xl:block"
        >
          <motion.div
            initial={{ opacity: 0, transform: "translateX(-24px)" }}
            animate={{ opacity: 1, transform: "translateX(0px)" }}
            transition={{ duration: 0.9, delay: 1.2, ease: EASE }}
            className="flex animate-float items-center gap-3 rounded-2xl border border-black/[0.06] bg-white/90 p-3 pr-5 shadow-float backdrop-blur"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/12 text-emerald-600">
              <FileCheck2 className="size-5" />
            </span>
            <span className="text-left">
              <span className="block font-mono text-[11px] text-mute">generation:pdf_ready</span>
              <span className="block text-sm font-semibold tracking-[-0.01em]">
                CS301 Mid-Sem paper exported
              </span>
            </span>
          </motion.div>
        </motion.div>

        <motion.div
          style={{ y: floatB }}
          className="pointer-events-none absolute -right-4 top-[62%] hidden xl:block"
        >
          <motion.div
            initial={{ opacity: 0, transform: "translateX(24px)" }}
            animate={{ opacity: 1, transform: "translateX(0px)" }}
            transition={{ duration: 0.9, delay: 1.35, ease: EASE }}
            className="animate-float rounded-2xl border border-black/[0.06] bg-white/90 p-3.5 shadow-float backdrop-blur [animation-delay:-3s]"
          >
            <span className="block font-mono text-[11px] text-mute">CO3 → PO3</span>
            <span className="mt-1 flex items-center gap-2 text-sm font-semibold tracking-[-0.01em]">
              <span className="grid size-6 place-items-center rounded-md bg-brand font-mono text-xs text-white">
                3
              </span>
              High correlation
            </span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Dashboard mock                                                              */
/* -------------------------------------------------------------------------- */

const SIDE = [
  { icon: LayoutDashboard, label: "Overview" },
  { icon: Target, label: "OBE Suite", active: true },
  { icon: FileText, label: "Exam Papers" },
  { icon: Library, label: "Library" },
  { icon: LineChart, label: "Insights" },
  { icon: MessagesSquare, label: "AI Tutor" },
];

function Dashboard() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-5% 0px" });
  const tick = useLoopStep(PHASES.length + 3, 1250, inView);
  const step = Math.min(tick, PHASES.length - 1);
  const done = tick >= PHASES.length;
  const pct = done ? 100 : Math.round(((step + 0.6) / PHASES.length) * 100);

  return (
    <div
      ref={ref}
      className="rounded-[28px] border border-black/[0.07] bg-[#efeae4]/80 p-2 shadow-float backdrop-blur sm:rounded-[34px] sm:p-3"
    >
      <div className="grid gap-2 text-left sm:gap-3 lg:grid-cols-[212px_1fr]">
        {/* Sidebar */}
        <aside className="hidden flex-col rounded-[22px] bg-white p-4 lg:flex">
          <Logo />
          <span className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-ink text-[13px] font-medium text-white shadow-[inset_0_0_0_1.5px_rgb(240_138_98/0.7)]">
            <Sparkles className="size-3.5" /> New exam paper
          </span>
          <ul className="mt-6 space-y-1">
            {SIDE.map((s) => (
              <li
                key={s.label}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium",
                  s.active ? "bg-black/[0.05] text-ink" : "text-mute",
                )}
              >
                <s.icon className="size-4" /> {s.label}
              </li>
            ))}
          </ul>
          <div className="mt-auto flex items-center gap-2.5 rounded-2xl bg-black/[0.04] p-3">
            <span className="grid size-9 place-items-center rounded-full bg-white text-brand shadow-card">
              <GraduationCap className="size-4.5" />
            </span>
            <span>
              <span className="block text-xs font-semibold">Dept. of CSE</span>
              <span className="block text-[11px] text-mute">Semester V</span>
            </span>
          </div>
        </aside>

        <div className="min-w-0 space-y-2 sm:space-y-3">
          {/* Top bar */}
          <div className="flex items-center justify-between rounded-[18px] bg-white/70 px-4 py-2.5">
            <span className="flex min-w-0 items-center gap-2 text-[13px] text-mute">
              <BookOpenCheck className="size-4 shrink-0" />
              <span className="truncate">
                OBE Suite <span className="mx-1 text-black/20">/</span>
                <span className="font-medium text-ink">CS301 Data Structures</span>
              </span>
            </span>
            <span className="flex items-center gap-3 text-mute">
              <span className="relative">
                <Bell className="size-4" />
                <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-sun" />
              </span>
              <span className="grid size-7 place-items-center rounded-full bg-ink text-[11px] font-semibold text-white">
                AR
              </span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-12">
            {/* Attainment */}
            <div className="col-span-2 flex items-center gap-4 rounded-[22px] bg-night p-4 text-white md:col-span-4 md:flex-col md:items-start md:gap-2">
              <span className="hidden text-xs font-medium text-white/60 md:block">
                Course attainment
              </span>
              <div className="relative mx-auto size-24 shrink-0 md:size-28">
                <svg viewBox="0 0 100 100" className="size-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#ffffff1a" strokeWidth="9" />
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="url(#gauge)"
                    strokeWidth="9"
                    strokeLinecap="round"
                    pathLength={1}
                    initial={{ strokeDasharray: "0 1" }}
                    whileInView={{ strokeDasharray: "0.78 1" }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.8, delay: 1, ease: EASE }}
                  />
                  <defs>
                    <linearGradient id="gauge" x1="0" y1="0" x2="1" y2="1">
                      <stop stopColor="#f08a62" />
                      <stop offset="1" stopColor="#f7a531" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className="absolute inset-0 grid place-items-center text-2xl font-semibold tracking-[-0.04em]">
                  <span>
                    <Counter to={78} duration={2.4} />
                    <span className="text-sm text-white/50">%</span>
                  </span>
                </span>
              </div>
              <div className="md:w-full">
                <span className="block text-xs font-medium text-white/60 md:hidden">
                  Course attainment
                </span>
                <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                  <Check className="size-3" strokeWidth={3} /> Above 70% target
                </span>
              </div>
            </div>

            {/* Mini tiles */}
            <div className="col-span-2 hidden grid-cols-2 gap-2 sm:gap-3 md:col-span-3 md:grid">
              {[
                { v: "6/6", l: "COs mapped", c: "text-ink" },
                { v: "42", l: "Questions", c: "text-ink" },
                { v: "L4", l: "Median Bloom", c: "text-brand" },
                { v: "A4", l: "PDF ready", c: "text-emerald-600" },
              ].map((t) => (
                <div key={t.l} className="grid place-items-center rounded-[18px] bg-white p-2 text-center">
                  <span>
                    <span className={cn("block text-xl font-semibold tracking-[-0.04em]", t.c)}>
                      {t.v}
                    </span>
                    <span className="block text-[10px] font-medium text-mute">{t.l}</span>
                  </span>
                </div>
              ))}
            </div>

            {/* Generation telemetry */}
            <div className="col-span-2 rounded-[22px] bg-white p-4 md:col-span-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Generation telemetry</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-mono text-[10px] font-medium transition-colors duration-300",
                    done ? "bg-emerald-500/12 text-emerald-600" : "bg-brand-tint text-brand",
                  )}
                >
                  {done ? "generation:pdf_ready" : "generation:progress"}
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                <div
                  className="h-full w-full origin-left rounded-full bg-linear-to-r from-brand to-brand-soft transition-transform duration-700 ease-out-strong"
                  style={{ transform: `scaleX(${pct / 100})` }}
                />
              </div>
              <ul className="mt-3 space-y-1.5">
                {[0, 1, 2, 3, 4].map((i) => {
                  const idx = step > 4 ? i + 2 : i;
                  const label = PHASES[idx];
                  const state = done || idx < step ? "done" : idx === step ? "active" : "todo";
                  return (
                    <li
                      key={i}
                      className={cn(
                        "flex items-center gap-2 text-[11.5px] transition-colors duration-300",
                        state === "todo" ? "text-black/30" : "text-ink-soft",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-3.5 shrink-0 place-items-center rounded-full transition-colors duration-300",
                          state === "done" && "bg-emerald-500 text-white",
                          state === "active" && "bg-brand/15",
                          state === "todo" && "bg-black/[0.06]",
                        )}
                      >
                        {state === "done" && <Check className="size-2.5" strokeWidth={4} />}
                        {state === "active" && (
                          <span className="size-1.5 animate-blink rounded-full bg-brand" />
                        )}
                      </span>
                      <span className={cn(state === "active" && "font-medium text-ink")}>{label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* CO-PO matrix */}
            <div className="col-span-2 rounded-[22px] bg-white p-4 md:col-span-7">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold">CO–PO correlation matrix</span>
                <span className="flex items-center gap-2 text-[10px] text-mute">
                  <i className="size-2 rounded-sm bg-brand/15" /> Low
                  <i className="size-2 rounded-sm bg-brand/50" /> Med
                  <i className="size-2 rounded-sm bg-brand" /> High
                </span>
              </div>
              <Matrix />
            </div>

            {/* Bloom distribution */}
            <div className="col-span-2 hidden flex-col rounded-[22px] bg-white p-4 md:col-span-5 md:flex">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Bloom distribution</span>
                <span className="text-[10px] text-mute">Remember → Create</span>
              </div>
              <motion.div
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.4 }}
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.3 } } }}
                className="mt-3 flex flex-1 items-end gap-2"
              >
                {BLOOM.map((b, i) => (
                  <div key={b.short} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <div className="flex h-full min-h-20 w-full items-end overflow-hidden rounded-lg bg-black/[0.035]">
                      <motion.div
                        variants={{
                          hidden: { transform: "scaleY(0)" },
                          show: { transform: "scaleY(1)", transition: { duration: 0.9, ease: EASE } },
                        }}
                        style={{ height: `${b.v}%` }}
                        className={cn(
                          "w-full origin-bottom rounded-lg",
                          i === 2 ? "bg-linear-to-t from-brand to-brand-soft" : "bg-brand/25",
                        )}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-mute">{b.short}</span>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
