"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useState } from "react";
import { EASE, Reveal, SplitWords, headingClass } from "@/components/home/motion";
import { cn } from "@/lib/site";

const FAQS = [
  {
    q: "Does VidyaAI replace faculty judgment?",
    a: "No. It removes the clerical work around outcome-based education. Teachers can override any CO-PO correlation weight, edit any generated question and adjust any AI-evaluated score, and those overrides are stored alongside the original.",
  },
  {
    q: "Which syllabus formats can it read?",
    a: "PDF, PNG, JPG, JPEG, WEBP, DOCX, TXT and Markdown. Photos and scans go through vision OCR, large images are compressed in the browser before upload, and multi-page scans are merged into clean sequential units.",
  },
  {
    q: "What happens if an AI provider goes down mid-generation?",
    a: "Requests run through a four-tier fallback chain: NVIDIA, then Groq, then Anthropic, then OpenAI. A circuit breaker isolates any provider that errors or stalls past 12 seconds and reroutes automatically, so the job finishes without anyone retrying by hand.",
  },
  {
    q: "Will the tutor just hand students the answers?",
    a: "It is built not to. The tutor follows a Socratic framework with guardrails that favour leading questions, step-by-step hints and concept checks, grounded in the lesson plan and outcomes the teacher assigned.",
  },
  {
    q: "How is each institution's data kept separate?",
    a: "Every organisation is its own tenant with partitioned data, quotas and an audit trail. Access is tiered across four roles (super admin, admin, teacher and student) and cross-tenant protection is covered by automated tests.",
  },
  {
    q: "Can we host it ourselves?",
    a: "Yes. VidyaAI is MIT licensed and ships with Docker Compose for self-hosting, a Render blueprint for a managed deployment, and a split option with the frontend on Vercel and the API on Render or Railway.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="px-5 pb-24 sm:pb-32">
      <div className="mx-auto max-w-3xl">
        <h2 className={cn(headingClass, "text-center")}>
          <SplitWords text="Frequently asked *questions*" />
        </h2>

        <div className="mt-12 space-y-3 sm:mt-16">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={f.q} delay={i * 0.05} y={18}>
                <div className="rounded-[22px] bg-[#faf6f1] shadow-[inset_0_1px_0_#fff,0_1px_0_rgb(16_17_20/0.05),0_10px_20px_-14px_rgb(16_17_20/0.25)]">
                  <h3>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`faq-${i}`}
                      onClick={() => setOpen(isOpen ? null : i)}
                      className="flex w-full items-center justify-between gap-6 rounded-[22px] px-6 py-5 text-left text-[17px] font-medium tracking-[-0.02em] sm:text-[18px]"
                    >
                      {f.q}
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-full transition-[transform,background-color,color] duration-300 ease-out-strong",
                          isOpen ? "rotate-45 bg-ink text-white" : "bg-black/[0.06] text-ink",
                        )}
                      >
                        <Plus className="size-4" strokeWidth={2.4} />
                      </span>
                    </button>
                  </h3>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        id={`faq-${i}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <p className="px-6 pb-6 pr-16 text-[15.5px] leading-relaxed text-mute">{f.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
