"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { useRef, useState, type ComponentType } from "react";
import { EASE, Eyebrow, Reveal, SplitWords, headingClass } from "@/components/home/motion";
import {
  BlueprintVisual,
  ExtractVisual,
  MatrixVisual,
  SarVisual,
} from "@/components/home/visuals/PipelineVisuals";
import { cn } from "@/lib/site";

const STEPS: Array<{ k: string; title: string; body: string; Visual: ComponentType }> = [
  {
    k: "01",
    title: "Syllabus units, extracted",
    body: "Upload a PDF, a Word file or a phone photo. Vision OCR pulls out units, topics, lecture hours and Bloom levels, then merges multi-page scans into clean sequential units.",
    Visual: ExtractVisual,
  },
  {
    k: "02",
    title: "CO-PO matrix, synthesised",
    body: "Course outcomes are correlated to program outcomes with weighted levels drawn from topic keywords and Bloom distribution. Faculty can override any cell.",
    Visual: MatrixVisual,
  },
  {
    k: "03",
    title: "Paper blueprint, balanced",
    body: "Set section-wise marks, internal choices and question types. The blueprint holds every paper to its CO coverage and Bloom allocation targets.",
    Visual: BlueprintVisual,
  },
  {
    k: "04",
    title: "NBA SAR report, exported",
    body: "Direct attainment is computed against target as results arrive, then compiled into printable Criterion 3 documentation.",
    Visual: SarVisual,
  },
];

export function Pipeline() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setActive(Math.min(STEPS.length - 1, Math.max(0, Math.floor(v * STEPS.length))));
  });

  const Active = STEPS[active].Visual;

  return (
    <section id="pipeline" className="relative bg-[#faf6f1]">
      <div className="mx-auto max-w-6xl px-5 pt-24 text-center sm:pt-32">
        <Reveal>
          <Eyebrow>The OBE suite</Eyebrow>
        </Reveal>
        <h2 className={cn(headingClass, "mx-auto mt-4 max-w-4xl")}>
          <SplitWords text="One flow, from the first syllabus scan to the *final* *SAR.*" />
        </h2>
        <Reveal delay={0.15}>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-[17px] leading-relaxed text-mute">
            Four steps that used to live in four different files now feed each other automatically.
          </p>
        </Reveal>
      </div>

      {/* Desktop: pinned scrollytelling */}
      <div ref={ref} className="relative hidden h-[340vh] lg:block">
        <div className="sticky top-0 flex h-screen items-center">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-[0.82fr_1.18fr] items-center gap-14 px-5">
            <div className="relative pl-8">
              <span aria-hidden className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-black/[0.07]" />
              <motion.span
                aria-hidden
                style={{ scaleY: scrollYProgress }}
                className="absolute bottom-2 left-0 top-2 w-[3px] origin-top rounded-full bg-linear-to-b from-brand to-sun"
              />
              <ol className="space-y-2">
                {STEPS.map((s, i) => {
                  const on = i === active;
                  return (
                    <li
                      key={s.k}
                      className={cn(
                        "rounded-3xl px-6 py-5 transition-[background-color,box-shadow,opacity] duration-500 ease-out-strong",
                        on ? "bg-white shadow-card" : "opacity-45",
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <span
                          className={cn(
                            "font-mono text-xs font-medium transition-colors duration-300",
                            on ? "text-brand" : "text-mute",
                          )}
                        >
                          {s.k}
                        </span>
                        <h3 className="text-[22px] font-medium tracking-[-0.03em]">{s.title}</h3>
                      </div>
                      <div
                        className={cn(
                          "grid transition-[grid-template-rows,opacity] duration-500 ease-out-strong",
                          on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                        )}
                      >
                        <p className="overflow-hidden text-[15px] leading-relaxed text-mute">
                          <span className="block pl-9 pt-2.5">{s.body}</span>
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="relative">
              <div aria-hidden className="absolute -inset-6 rounded-[44px] bg-linear-to-br from-brand/15 via-transparent to-sun/15 blur-2xl" />
              <div className="relative h-[470px] rounded-[32px] border border-black/[0.06] bg-white/85 p-7 shadow-float backdrop-blur">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active}
                    initial={{ opacity: 0, transform: "translateY(16px) scale(0.985)" }}
                    animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
                    exit={{ opacity: 0, transform: "translateY(-10px) scale(0.985)" }}
                    transition={{ duration: 0.32, ease: EASE }}
                    className="h-full"
                  >
                    <Active />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile / tablet: stacked */}
      <div className="mx-auto max-w-2xl space-y-6 px-5 pb-24 pt-12 lg:hidden">
        {STEPS.map((s) => (
          <Reveal key={s.k}>
            <article className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-card">
              <span className="font-mono text-xs font-medium text-brand">{s.k}</span>
              <h3 className="mt-1 text-xl font-medium tracking-[-0.03em]">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-mute">{s.body}</p>
              <div className="mt-5 rounded-2xl bg-[#faf6f1] p-4">
                <s.Visual />
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
