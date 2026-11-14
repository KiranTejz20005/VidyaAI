"use client";

import { motion, useInView } from "framer-motion";
import { BookMarked, HelpCircle, LineChart, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/home/Logo";
import { EASE, Eyebrow, Reveal, SplitWords, headingClass } from "@/components/home/motion";
import { cn } from "@/lib/site";

type Msg = { who: "student" | "tutor"; text: string };

const SCRIPT: Msg[] = [
  { who: "student", text: "Can you just tell me the time complexity of binary search?" },
  { who: "tutor", text: "Let's find it together. After each comparison, how much of the array is still left to search?" },
  { who: "student", text: "Half of it?" },
  { who: "tutor", text: "Exactly. Starting from n elements, how many times can you halve before only one remains?" },
  { who: "student", text: "log₂ n times… so it's O(log n)!" },
  { who: "tutor", text: "You derived that yourself. Now, what has to be true about the array for this to work at all?" },
];

const POINTS = [
  { icon: Timer, title: "Under 800 ms to first token", body: "Responses stream over WebSockets, so the conversation never stalls." },
  { icon: HelpCircle, title: "Guides, never spoon-feeds", body: "Pedagogical guardrails favour leading questions, hints and concept checks." },
  { icon: BookMarked, title: "Grounded in your course", body: "Answers draw on the syllabus, lecture notes and assigned outcomes." },
  { icon: LineChart, title: "Visible to faculty", body: "Engagement metrics, topic difficulty heatmaps and session summaries." },
];

export function Tutor() {
  return (
    <section id="tutor" className="relative overflow-clip px-5 py-24 sm:py-32">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-full bg-linear-to-b from-paper via-[#fbeee6] to-paper" />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        <div>
          <Reveal>
            <Eyebrow>Socratic AI tutor</Eyebrow>
          </Reveal>
          <h2 className={cn(headingClass, "mt-4")}>
            <SplitWords text="A tutor that asks *before* it tells." />
          </h2>
          <Reveal delay={0.15}>
            <p className="mt-5 max-w-lg text-pretty text-[17px] leading-relaxed text-mute">
              Students get a learning companion that builds understanding step by step, in real
              time, inside the lessons their teachers assigned.
            </p>
          </Reveal>

          <div className="mt-9 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {POINTS.map((p, i) => (
              <Reveal key={p.title} delay={0.1 + i * 0.06}>
                <span className="grid size-10 place-items-center rounded-xl bg-night text-white shadow-button">
                  <p.icon className="size-4.5" />
                </span>
                <h3 className="mt-3.5 text-[16px] font-medium tracking-[-0.02em]">{p.title}</h3>
                <p className="mt-1 text-[14.5px] leading-relaxed text-mute">{p.body}</p>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={0.1}>
          <Chat />
        </Reveal>
      </div>
    </section>
  );
}

function Chat() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(window.setTimeout(resolve, ms));
      });

    (async () => {
      while (!cancelled) {
        setMsgs([]);
        setTyping(false);
        for (const m of SCRIPT) {
          if (m.who === "student") {
            await wait(1100);
            if (cancelled) return;
            setMsgs((prev) => [...prev, m]);
          } else {
            await wait(350);
            if (cancelled) return;
            setTyping(true);
            await wait(620);
            if (cancelled) return;
            setTyping(false);
            const words = m.text.split(" ");
            setMsgs((prev) => [...prev, { who: "tutor", text: "" }]);
            for (let i = 1; i <= words.length; i++) {
              await wait(48);
              if (cancelled) return;
              const text = words.slice(0, i).join(" ");
              setMsgs((prev) => [...prev.slice(0, -1), { who: "tutor", text }]);
            }
          }
        }
        await wait(5000);
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [inView]);

  return (
    <div ref={ref} className="relative">
      <div aria-hidden className="absolute -inset-8 rounded-[50px] bg-brand/20 blur-3xl" />
      <div className="relative overflow-hidden rounded-[32px] border border-black/[0.06] bg-white shadow-float">
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <span className="flex items-center gap-3">
            <LogoMark size={36} />
            <span>
              <span className="block text-[15px] font-semibold tracking-[-0.02em]">Vidya Tutor</span>
              <span className="block text-xs text-mute">Unit 2 · Searching & Sorting</span>
            </span>
          </span>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] font-medium text-emerald-700">
            TTFT &lt; 800 ms
          </span>
        </header>

        <div className="flex h-[400px] flex-col justify-end gap-2.5 overflow-hidden p-5" aria-live="off">
          {msgs.map((m, i) => (
            <motion.div
              key={i}
              layout="position"
              initial={{ opacity: 0, transform: "translateY(10px) scale(0.98)" }}
              animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
              transition={{ duration: 0.35, ease: EASE }}
              className={cn(
                "max-w-[82%] rounded-[20px] px-4 py-2.5 text-[15px] leading-snug tracking-[-0.01em]",
                m.who === "student"
                  ? "self-end rounded-br-md bg-night text-white"
                  : "self-start rounded-bl-md bg-[#f8f3ee] text-ink",
              )}
            >
              {m.text}
              {m.who === "tutor" && i === msgs.length - 1 && m.text.length < SCRIPT[i]?.text.length && (
                <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-caret bg-brand" />
              )}
            </motion.div>
          ))}
          {typing && (
            <motion.div
              initial={{ opacity: 0, transform: "translateY(8px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              transition={{ duration: 0.25, ease: EASE }}
              className="flex w-fit items-center gap-1 self-start rounded-[20px] rounded-bl-md bg-[#f8f3ee] px-4 py-3.5"
            >
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="size-1.5 animate-blink rounded-full bg-brand"
                  style={{ animationDelay: `${d * 0.18}s` }}
                />
              ))}
            </motion.div>
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-line px-5 py-3.5">
          <span className="flex-1 rounded-full bg-black/[0.04] px-4 py-2.5 text-sm text-mute">
            Ask about this lesson…
          </span>
          <span className="rounded-md bg-black/[0.05] px-2 py-1 font-mono text-[10.5px] text-mute">
            tutor:token
          </span>
        </footer>
      </div>
    </div>
  );
}
