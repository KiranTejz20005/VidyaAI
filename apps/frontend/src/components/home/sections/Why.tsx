"use client";

import { motion } from "framer-motion";
import {
  Braces,
  Building2,
  Landmark,
  Network,
  PenLine,
  SearchCheck,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/home/Logo";
import { EASE, Eyebrow, Reveal, SplitWords, headingClass } from "@/components/home/motion";
import { cn } from "@/lib/site";

type Item = { icon: LucideIcon; title: string; body: string };

const LEFT: Item[] = [
  {
    icon: Landmark,
    title: "Accreditation-aligned by design",
    body: "Outcome mapping and attainment follow NBA SAR Criterion 3 and Washington Accord conventions from the first step.",
  },
  {
    icon: PenLine,
    title: "Faculty stay in control",
    body: "Override any CO-PO weight, any generated question and any AI-evaluated score. Every override is recorded.",
  },
  {
    icon: Braces,
    title: "Deterministic output",
    body: "Every generated paper is validated against Zod schemas, with automatic JSON repair before it reaches a teacher.",
  },
];

const RIGHT: Item[] = [
  {
    icon: Network,
    title: "Never blocked by one provider",
    body: "NVIDIA, Groq, Anthropic and OpenAI sit behind one fallback chain with automatic circuit breaking.",
  },
  {
    icon: SearchCheck,
    title: "Search that finds the right page",
    body: "Hybrid retrieval fuses pgvector similarity with PostgreSQL full-text ranking using Reciprocal Rank Fusion.",
  },
  {
    icon: Building2,
    title: "Isolated per institution",
    body: "Organisation-level data partitioning, quotas, custom branding and a full audit trail for every tenant.",
  },
];

// Bracket-shaped connectors drawn in a 96 x 300 box; rows sit at 1/6, 1/2 and 5/6 of the height.
const PATHS = [
  "M0 50 H36 Q48 50 48 62 V138 Q48 150 60 150 H96",
  "M0 150 H96",
  "M0 250 H36 Q48 250 48 238 V162 Q48 150 60 150 H96",
];

export function Why() {
  return (
    <section className="px-2 sm:px-4">
      <div className="rounded-[36px] bg-[#faf6f1] px-5 py-24 sm:rounded-[48px] sm:py-32">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <Reveal>
              <Eyebrow>Our principles</Eyebrow>
            </Reveal>
            <h2 className={cn(headingClass, "mx-auto mt-4 max-w-3xl")}>
              <SplitWords text="Why institutions *choose* VidyaAI" />
            </h2>
          </div>

          <div className="mt-14 grid items-stretch gap-4 sm:mt-20 lg:grid-cols-[1fr_96px_auto_96px_1fr] lg:gap-0">
            <Column items={LEFT} from="left" />
            <Connector />
            <div className="order-first grid place-items-center py-4 lg:order-none lg:py-0">
              <Reveal>
                <div className="relative grid place-items-center">
                  <span aria-hidden className="absolute size-28 animate-ping-soft rounded-[34px] bg-brand/25" />
                  <span aria-hidden className="absolute size-36 rounded-[40px] bg-brand/10 blur-xl" />
                  <LogoMark size={112} className="relative drop-shadow-[0_24px_40px_rgb(150_60_20/0.45)]" />
                </div>
              </Reveal>
            </div>
            <Connector flip />
            <Column items={RIGHT} from="right" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Column({ items, from }: { items: Item[]; from: "left" | "right" }) {
  const dx = from === "left" ? -28 : 28;
  return (
    <ul className="grid gap-4 lg:grid-rows-3 lg:gap-0">
      {items.map((it, i) => (
        <motion.li
          key={it.title}
          initial={{ opacity: 0, transform: `translateX(${dx}px)` }}
          whileInView={{ opacity: 1, transform: "translateX(0px)" }}
          viewport={{ once: true, margin: "0px 0px -12% 0px" }}
          transition={{ duration: 0.8, delay: i * 0.09, ease: EASE }}
          className="flex lg:py-3"
        >
          <div className="flex w-full items-start gap-4 rounded-[28px] border border-black/[0.05] bg-white p-5 shadow-card sm:p-6">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-night text-white shadow-button">
              <it.icon className="size-5" strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="text-[18px] font-medium tracking-[-0.03em]">{it.title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-mute">{it.body}</p>
            </div>
          </div>
        </motion.li>
      ))}
    </ul>
  );
}

function Connector({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 96 300"
      preserveAspectRatio="none"
      className={cn("hidden h-full w-full lg:block", flip && "-scale-x-100")}
      fill="none"
    >
      {PATHS.map((d, i) => (
        <g key={d}>
          <motion.path
            d={d}
            stroke="#e05934"
            strokeOpacity="0.35"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, margin: "0px 0px -15% 0px" }}
            transition={{ duration: 1.2, delay: 0.3 + i * 0.12, ease: EASE }}
          />
          <path
            d={d}
            pathLength={1}
            stroke="#f7a531"
            strokeWidth="2.5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="pulse-dash"
            style={{ animationDelay: `${i * -0.8}s` }}
          />
        </g>
      ))}
    </svg>
  );
}
