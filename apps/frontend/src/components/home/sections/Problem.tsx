"use client";

import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import {
  ArrowDown,
  Clock3,
  FileQuestion,
  FileSpreadsheet,
  Gauge,
  ScanLine,
  Shuffle,
  UserRoundX,
  X,
} from "lucide-react";
import { useRef, type ReactNode } from "react";
import { EASE, Eyebrow, Reveal, ScrollWords, SplitWords, headingClass } from "@/components/home/motion";
import { cn } from "@/lib/site";

const PAINS = [
  { text: "CO-PO matrices rebuilt by hand in spreadsheets, every single semester.", icon: FileSpreadsheet },
  { text: "Question papers with no check on Bloom level or outcome coverage.", icon: Shuffle },
  { text: "Syllabi trapped in scans, phone photos and PDFs nobody can search.", icon: ScanLine },
  { text: "Attainment calculated after the fact, never while there is time to act.", icon: Gauge },
  { text: "Students handed answers when what they needed was understanding.", icon: UserRoundX },
];

export function Problem() {
  const chaos = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: chaos, offset: ["start end", "end start"] });

  return (
    <section className="relative px-5 pb-24 pt-16 sm:pb-32 sm:pt-24">
      <div className="mx-auto max-w-5xl text-center">
        <Reveal>
          <Eyebrow>The problem</Eyebrow>
        </Reveal>
        <h2 className={cn(headingClass, "mx-auto mt-4 max-w-4xl")}>
          <SplitWords text="Accreditation season shouldn't cost you *a* *semester.*" />
        </h2>

        {/* Paper chaos: the "before" picture, drifting at different depths */}
        <Reveal delay={0.1} className="mt-12 sm:mt-16">
          <div
            ref={chaos}
            className="noise relative mx-auto h-[380px] max-w-4xl overflow-hidden rounded-[32px] border border-black/[0.06] bg-linear-to-br from-[#f6efe6] via-[#f3ece4] to-[#f9e6da] shadow-card sm:h-[480px]"
          >
            <Drift progress={scrollYProgress} depth={70} className="left-[6%] top-[12%] -rotate-6">
              <SheetCard title="CO-PO_final_v7 (2).xlsx" tone="emerald">
                <div className="grid grid-cols-5 gap-1">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-3 rounded-[3px]",
                        [3, 7, 8, 14].includes(i) ? "bg-red-400/60" : "bg-black/[0.07]",
                      )}
                    />
                  ))}
                </div>
              </SheetCard>
            </Drift>

            <Drift progress={scrollYProgress} depth={130} className="right-[7%] top-[9%] rotate-[5deg]">
              <SheetCard title="IMG_2291.jpg" tone="amber">
                <div className="space-y-1.5 [filter:blur(0.6px)]">
                  {[90, 70, 82, 55, 76].map((w, i) => (
                    <span key={i} className="block h-1.5 rounded-full bg-black/20" style={{ width: `${w}%` }} />
                  ))}
                </div>
                <span className="mt-2 block text-[10px] text-mute">Syllabus photo, page 2 of ?</span>
              </SheetCard>
            </Drift>

            <Drift progress={scrollYProgress} depth={40} className="left-[30%] top-[38%] rotate-2 sm:left-[34%]">
              <SheetCard title="QP_Mid1_draft_NEW.docx" tone="sky" wide>
                <div className="space-y-2">
                  {[1, 2, 3].map((q) => (
                    <div key={q} className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-mute">Q{q}.</span>
                      <span className="h-1.5 flex-1 rounded-full bg-black/10" />
                      <span className="rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-[9px] font-medium text-red-500">
                        CO?
                      </span>
                    </div>
                  ))}
                </div>
              </SheetCard>
            </Drift>

            <Drift progress={scrollYProgress} depth={160} className="bottom-[10%] left-[9%] rotate-[4deg]">
              <div className="w-40 rounded-md bg-[#ffe27a] p-3 text-left shadow-[0_14px_30px_-12px_rgb(120_90_0/0.45)]">
                <span className="block font-serif text-xl italic leading-tight text-[#5b4300]">
                  NBA visit Monday!!
                </span>
                <span className="mt-1 block text-[11px] text-[#5b4300]/70">attainment sheets??</span>
              </div>
            </Drift>

            <Drift progress={scrollYProgress} depth={100} className="bottom-[13%] right-[8%] -rotate-3">
              <div className="flex items-center gap-2.5 rounded-full bg-night py-2 pl-2 pr-4 text-white shadow-float">
                <span className="grid size-8 place-items-center rounded-full bg-white/10">
                  <Clock3 className="size-4" />
                </span>
                <span className="text-left">
                  <span className="block text-[10px] text-white/50">Still mapping outcomes</span>
                  <span className="block font-mono text-sm font-medium">11:48 PM</span>
                </span>
              </div>
            </Drift>

            <Drift progress={scrollYProgress} depth={190} className="right-[30%] top-[14%] hidden rotate-[8deg] sm:block">
              <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-card">
                <FileQuestion className="size-4 text-red-500" />
                <span className="font-mono text-xs font-medium">Attainment = ???</span>
              </div>
            </Drift>
          </div>
        </Reveal>

        <ScrollWords
          className="mx-auto mt-14 max-w-3xl text-[clamp(1.5rem,3.4vw,2.35rem)] font-medium leading-[1.22] tracking-[-0.03em] sm:mt-20"
          text="Faculty lose weeks mapping outcomes in spreadsheets, hand-building question papers and rebuilding attainment numbers the night before an audit."
        />

        <Reveal className="my-8 flex justify-center">
          <span className="grid size-11 animate-float place-items-center rounded-full bg-sun text-white shadow-[0_12px_28px_-10px_rgb(224_89_52/0.8)]">
            <ArrowDown className="size-5" strokeWidth={2.6} />
          </span>
        </Reveal>

        <ScrollWords
          className="mx-auto max-w-3xl text-[clamp(1.5rem,3.4vw,2.35rem)] font-medium leading-[1.22] tracking-[-0.03em]"
          text="And after all that effort, the evidence still lives in scattered files that nobody fully trusts."
        />
      </div>

      <ul className="mx-auto mt-14 max-w-3xl space-y-3 sm:mt-20">
        {PAINS.map((p, i) => (
          <motion.li
            key={p.text}
            initial={{ opacity: 0, transform: "translateY(22px) scale(0.98)" }}
            whileInView={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
            viewport={{ once: true, margin: "0px 0px -10% 0px" }}
            transition={{ duration: 0.7, delay: i * 0.07, ease: EASE }}
            className="group flex items-center gap-4 rounded-full border border-sun/50 bg-white py-3.5 pl-4 pr-6 text-left shadow-[0_8px_24px_-14px_rgb(224_89_52/0.55)] sm:py-5 sm:pl-6 sm:pr-8"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink text-ink">
              <X className="size-4" strokeWidth={3} />
            </span>
            <span className="flex-1 text-[15px] font-medium tracking-[-0.015em] sm:text-lg">{p.text}</span>
            <p.icon aria-hidden className="hidden size-7 shrink-0 text-black/35 sm:block" strokeWidth={1.6} />
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

/** Absolutely-positioned layer that parallaxes on scroll. Higher depth moves further. */
function Drift({
  children,
  progress,
  depth,
  className,
}: {
  children: ReactNode;
  progress: MotionValue<number>;
  depth: number;
  className?: string;
}) {
  const y = useTransform(progress, [0, 1], [depth * 0.5, -depth * 0.5]);
  return (
    <motion.div style={{ y }} className="absolute inset-0 will-change-transform">
      <div className={cn("absolute", className)}>{children}</div>
    </motion.div>
  );
}

function SheetCard({
  title,
  tone,
  wide = false,
  children,
}: {
  title: string;
  tone: "emerald" | "amber" | "sky";
  wide?: boolean;
  children: ReactNode;
}) {
  const dot = { emerald: "bg-emerald-500", amber: "bg-amber-500", sky: "bg-sky-500" }[tone];
  return (
    <div
      className={cn(
        "rounded-xl bg-white p-3 text-left shadow-[0_18px_40px_-16px_rgb(16_17_20/0.3)]",
        wide ? "w-56 sm:w-64" : "w-40 sm:w-48",
      )}
    >
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className={cn("size-2 rounded-full", dot)} />
        <span className="truncate font-mono text-[10px] font-medium text-ink-soft">{title}</span>
      </div>
      {children}
    </div>
  );
}
