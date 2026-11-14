"use client";

import { motion, useReducedMotion } from "framer-motion";
import { GraduationCap, Presentation, ServerCog, University, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { LogoMark } from "@/components/home/Logo";
import { EASE, Eyebrow, Reveal, SplitWords, headingClass } from "@/components/home/motion";
import { cn } from "@/lib/site";

type Role = {
  code: string;
  who: string;
  body: string;
  icon: LucideIcon;
  /** Which side of the hub the card sits on (desktop). */
  side: "left" | "right";
  /** Desktop position on the 960 x 460 stage; the card is centred on `top`. */
  pos: string;
  /** Spoke from the hub centre (480, 230) to the card's inner edge. */
  spoke: string;
};

const ROLES: Role[] = [
  {
    code: "SUPER_ADMIN",
    who: "Platform owner",
    body: "Organisations, AI providers and system health.",
    icon: ServerCog,
    side: "left",
    pos: "lg:left-0 lg:top-[90px]",
    spoke: "M 480 230 C 388 171, 372 90, 292 90",
  },
  {
    code: "ADMIN",
    who: "Dean & institution",
    body: "Attainment across departments, quotas, audit trails.",
    icon: University,
    side: "right",
    pos: "lg:right-0 lg:top-[90px]",
    spoke: "M 480 230 C 572 171, 588 90, 668 90",
  },
  {
    code: "TEACHER",
    who: "Faculty",
    body: "OBE planning, paper generation, library, insights.",
    icon: Presentation,
    side: "left",
    pos: "lg:left-0 lg:top-[370px]",
    spoke: "M 480 230 C 388 289, 372 370, 292 370",
  },
  {
    code: "STUDENT",
    who: "Learner",
    body: "Assessments, lessons and a Socratic tutor.",
    icon: GraduationCap,
    side: "right",
    pos: "lg:right-0 lg:top-[370px]",
    spoke: "M 480 230 C 572 289, 588 370, 668 370",
  },
];

const IN_VIEW = { once: true, margin: "0px 0px -10% 0px" } as const;

export function Roles() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);

  return (
    <section id="roles" className="relative overflow-clip px-5 py-24 sm:py-32">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-b from-transparent to-[#fbe9df]/70" />

      <div className="relative mx-auto max-w-6xl">
        <div className="text-center">
          <Reveal>
            <Eyebrow>Built for every seat</Eyebrow>
          </Reveal>
          <h2 className={cn(headingClass, "mx-auto mt-4 max-w-3xl")}>
            <SplitWords text="One platform. *Four* vantage points." />
          </h2>
          <Reveal delay={0.15}>
            <p className="mx-auto mt-5 max-w-lg text-pretty text-[17px] leading-relaxed text-mute">
              Tiered roles mean everyone sees exactly what they are responsible for, and nothing
              from another institution.
            </p>
          </Reveal>
        </div>

        {/* Stage: a fixed 960 x 460 canvas on desktop so spokes and cards line up exactly */}
        <div className="relative mx-auto mt-12 lg:mt-14 lg:h-[460px] lg:w-[960px]">
          {/* Spokes from the hub to each role */}
          <svg
            aria-hidden
            viewBox="0 0 960 460"
            fill="none"
            className="pointer-events-none absolute inset-0 hidden size-full lg:block"
          >
            {ROLES.map((r, i) => (
              <g key={r.code}>
                <motion.path
                  d={r.spoke}
                  stroke="#e05934"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  initial={{ pathLength: reduce ? 1 : 0, opacity: 0 }}
                  whileInView={{ pathLength: 1, opacity: 1 }}
                  viewport={IN_VIEW}
                  transition={{ duration: 1.1, delay: 0.2 + i * 0.1, ease: EASE }}
                  className="transition-[stroke-opacity] duration-200"
                  style={{ strokeOpacity: active === i ? 0.75 : 0.26 }}
                />
                <motion.g
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={IN_VIEW}
                  transition={{ duration: 0.4, delay: 1.2 + i * 0.1 }}
                >
                  <path
                    d={r.spoke}
                    pathLength={1}
                    stroke="#f7a531"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="pulse-dash"
                    style={{ animationDelay: `${i * -0.65}s` }}
                  />
                </motion.g>
              </g>
            ))}
          </svg>

          {/* Hub */}
          <Reveal className="relative mx-auto grid size-[300px] place-items-center sm:size-[380px] lg:absolute lg:left-1/2 lg:top-1/2 lg:-ml-[145px] lg:-mt-[145px] lg:size-[290px]">
            <span
              aria-hidden
              className="absolute -inset-[14%] rounded-full bg-[radial-gradient(closest-side,rgb(224_89_52/0.12),transparent)]"
            />
            <span aria-hidden className="absolute inset-0 animate-orbit rounded-full border border-dashed border-brand/30">
            </span>
            <span aria-hidden className="absolute inset-[13%] animate-orbit-reverse rounded-full border border-brand/15 bg-white/50">
            </span>
            <span aria-hidden className="absolute inset-[27%] rounded-full bg-white shadow-float ring-1 ring-brand/10" />
            <LogoMark size={66} className="relative" />
          </Reveal>

          {/* Role cards */}
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:mt-0 lg:block">
            {ROLES.map((r, i) => (
              <li key={r.code} className={cn("lg:absolute lg:w-[300px] lg:-translate-y-1/2", r.pos)}>
                <motion.div
                  initial={{
                    opacity: 0,
                    transform: reduce ? "translateY(0px) scale(1)" : "translateY(20px) scale(0.97)",
                  }}
                  whileInView={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
                  viewport={IN_VIEW}
                  transition={{ duration: 0.8, delay: 0.3 + i * 0.1, ease: EASE }}
                  onPointerEnter={(e) => {
                    if (e.pointerType === "mouse") setActive(i);
                  }}
                  onPointerLeave={() => setActive(null)}
                  className={cn(
                    "relative flex h-full items-start gap-3.5 rounded-[22px] border bg-white p-4 shadow-card transition-colors duration-200",
                    active === i ? "border-brand/30" : "border-black/[0.05]",
                  )}
                >
                  {/* Port where the spoke meets the card */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-1/2 hidden size-2.5 -translate-y-1/2 rounded-full border-2 border-brand bg-white lg:block",
                      r.side === "left" ? "-right-[5px]" : "-left-[5px]",
                    )}
                  />
                  <span
                    className={cn(
                      "grid size-11 shrink-0 place-items-center rounded-xl transition-colors duration-200",
                      active === i ? "bg-brand-tint text-brand" : "bg-[#f8f1ea] text-ink",
                    )}
                  >
                    <r.icon className="size-5" strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[16px] font-medium tracking-[-0.02em]">{r.who}</span>
                      <span className="rounded-md bg-brand-tint px-1.5 py-0.5 font-mono text-[10px] font-medium text-brand">
                        {r.code}
                      </span>
                    </span>
                    <p className="mt-1 text-[13.5px] leading-snug text-mute">{r.body}</p>
                  </div>
                </motion.div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
