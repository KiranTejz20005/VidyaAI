"use client";

import { motion } from "framer-motion";
import { Award, BookOpenText, FlaskConical, Globe2, Layers3, Scale } from "lucide-react";
import { LogoMark } from "@/components/home/Logo";
import { Counter, EASE, Reveal, SplitWords, headingClass } from "@/components/home/motion";
import { cn } from "@/lib/site";

const STATS = [
  {
    pre: "<",
    to: 800,
    decimals: 0,
    suf: " ms",
    label: "time to first token",
    note: "The Socratic tutor's WebSocket streaming target, enforced by a TTFT benchmark test.",
  },
  {
    pre: "",
    to: 100,
    decimals: 0,
    suf: "%",
    label: "top-3 recall in hybrid search",
    note: "Benchmark accuracy when vector and full-text rankings are fused with RRF.",
  },
  {
    pre: "",
    to: 0.35,
    decimals: 2,
    suf: " ms",
    label: "p95 retrieval latency",
    note: "Measured across 10,000 document chunks, against a 150 ms target.",
  },
  {
    pre: "",
    to: 179,
    decimals: 0,
    suf: "+",
    label: "passing tests in 30+ suites",
    note: "Covering OCR cleanup, failover, tenant isolation and role-based access.",
  },
];

const STANDARDS = [
  { icon: Award, name: "NBA", sub: "SAR Criterion 3 reports" },
  { icon: Layers3, name: "NAAC", sub: "Accreditation workflows" },
  { icon: Globe2, name: "Washington Accord", sub: "Outcome alignment" },
  { icon: BookOpenText, name: "Bloom's Taxonomy", sub: "Remember to Create" },
  { icon: Scale, name: "MIT License", sub: "Open source" },
];

export function Stats() {
  return (
    <section className="relative px-5 pb-24 pt-8 sm:pb-32">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className={cn(headingClass, "mx-auto max-w-3xl")}>
            <SplitWords text="Benchmarked, *not* promised." />
          </h2>
          <Reveal delay={0.15}>
            <p className="mx-auto mt-5 max-w-lg text-pretty text-[17px] leading-relaxed text-mute">
              Every number below comes from the test suite that ships with the platform.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.1} className="mt-14 sm:mt-16">
          <div className="grid gap-2 rounded-[36px] border border-black/[0.05] bg-white p-2 shadow-card lg:grid-cols-[1.15fr_1fr_1fr]">
            <div className="relative flex min-h-[420px] flex-col overflow-hidden rounded-[28px] bg-night p-8 text-white lg:row-span-2 sm:p-10">
              <div aria-hidden className="absolute -left-20 -top-24 size-72 rounded-full bg-brand/45 blur-[90px]" />
              <span className="relative flex items-center gap-3 text-2xl font-medium tracking-[-0.03em] sm:text-[28px]">
                <FlaskConical className="size-6 text-brand-soft" /> Proof over promises
              </span>
              <p className="relative mt-6 text-[17px] leading-relaxed text-white/60">
                We don&apos;t ask institutions to take performance on faith.{" "}
                <span className="text-white">Latency, recall and failover</span> are asserted in
                automated benchmarks on every change, alongside checks for{" "}
                <span className="text-white">tenant isolation</span> and{" "}
                <span className="text-white">role-based access</span>.
              </p>
              <LogoMark size={56} className="relative mt-auto" />
            </div>

            {STATS.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, transform: "translateY(20px)" }}
                whileInView={{ opacity: 1, transform: "translateY(0px)" }}
                viewport={{ once: true, margin: "0px 0px -10% 0px" }}
                transition={{ duration: 0.7, delay: 0.1 + i * 0.08, ease: EASE }}
                className={cn(
                  "flex min-h-[230px] flex-col rounded-[28px] p-7",
                  i === 1 || i === 2 ? "bg-[#f7efe6]" : "bg-[#fbf7f2]",
                )}
              >
                <span className="text-[clamp(2.6rem,4.6vw,3.6rem)] font-medium leading-none tracking-[-0.055em]">
                  {s.pre}
                  <Counter to={s.to} decimals={s.decimals} />
                  <span className="text-[0.55em] tracking-[-0.03em] text-ink-soft">{s.suf}</span>
                </span>
                <span className="mt-2 text-[16px] font-medium tracking-[-0.015em]">{s.label}</span>
                <span className="mt-auto pt-6 text-[13.5px] leading-snug text-mute">{s.note}</span>
              </motion.div>
            ))}
          </div>
        </Reveal>

        {/* Standards */}
        <div className="mt-24 text-center sm:mt-32">
          <h2 className={cn(headingClass, "mx-auto max-w-3xl")}>
            <SplitWords text="Built around the frameworks that *audit* you." />
          </h2>
          <ul className="mx-auto mt-14 grid max-w-5xl grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
            {STANDARDS.map((s, i) => (
              <motion.li
                key={s.name}
                initial={{ opacity: 0, transform: "translateY(24px) scale(0.94)" }}
                whileInView={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
                viewport={{ once: true, margin: "0px 0px -10% 0px" }}
                transition={{ duration: 0.8, delay: i * 0.08, ease: EASE }}
                className="group flex flex-col items-center"
              >
                <span className="relative grid size-20 place-items-center rounded-[26px] bg-linear-to-b from-white to-[#e9e7ee] text-ink shadow-[inset_0_1px_0_#fff,inset_0_-3px_6px_rgb(16_17_20/0.08),0_16px_30px_-14px_rgb(16_17_20/0.35)] transition-transform duration-300 ease-out-strong [@media(hover:hover)]:group-hover:-translate-y-1.5">
                  <s.icon className="size-8" strokeWidth={1.5} />
                </span>
                <span className="mt-5 text-[19px] font-medium tracking-[-0.03em]">{s.name}</span>
                <span className="mt-1 text-[14px] text-mute">{s.sub}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
