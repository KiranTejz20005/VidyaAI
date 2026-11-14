"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Check, FileImage, FileText, FileType2, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { EASE, Eyebrow, Reveal, SplitWords, Spotlight, headingClass } from "@/components/home/motion";
import { cn } from "@/lib/site";

export function Modules() {
  return (
    <section id="platform" className="relative px-5 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <Reveal>
            <Eyebrow>The VidyaAI platform</Eyebrow>
          </Reveal>
          <h2 className={cn(headingClass, "mx-auto mt-4 max-w-4xl")}>
            <SplitWords text="Everything an institution needs, in one *connected* platform." />
          </h2>
          <Reveal delay={0.15}>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-[17px] leading-relaxed text-mute">
              Five modules that share one data model, so an outcome defined once follows the
              course from planning to assessment to audit.
            </p>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-4 sm:mt-20 md:grid-cols-6">
          <Card
            n="01"
            href="#pipeline"
            className="md:col-span-3"
            title="OBE & NBA automation"
            body="Syllabus planning, CO-PO synthesis, exam blueprints and SAR Criterion 3 reports in one continuous chain."
          >
            <ChainVisual />
          </Card>

          <Card
            n="02"
            href="#pipeline"
            delay={0.08}
            className="md:col-span-3"
            title="Syllabus extractor & OCR"
            body="Eight file formats, three concurrent workers, automatic retry on an alternate vision model when a page fails."
          >
            <QueueVisual />
          </Card>

          <Card
            n="03"
            href="#engine"
            className="md:col-span-2"
            title="Exam paper generator"
            body="MCQs to case studies, each mapped to a Bloom level, with answer keys, rubrics and print-ready A4 PDFs."
          >
            <TypesVisual />
          </Card>

          <Card
            n="04"
            href="#tutor"
            delay={0.08}
            className="md:col-span-2"
            title="Socratic AI tutor"
            body="Streams its first token in under 800 ms and guides with questions instead of handing over answers."
          >
            <TutorVisual />
          </Card>

          <Card
            n="05"
            href="#roles"
            delay={0.16}
            className="md:col-span-2"
            title="Multi-tenant access control"
            body="Four role tiers with organisation-level data partitioning, quotas, custom branding and audit trails."
          >
            <RolesVisual />
          </Card>
        </div>
      </div>
    </section>
  );
}

function Card({
  n,
  title,
  body,
  href,
  className,
  delay = 0,
  children,
}: {
  n: string;
  title: string;
  body: string;
  href: string;
  className?: string;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <Reveal delay={delay} className={className}>
      <a href={href} className="group block h-full rounded-[30px]">
        <Spotlight className="flex h-full flex-col overflow-hidden rounded-[30px] border border-black/[0.06] bg-white shadow-card transition-[transform,box-shadow] duration-300 ease-out-strong [@media(hover:hover)]:group-hover:-translate-y-1 [@media(hover:hover)]:group-hover:shadow-float">
          <div className="relative m-2 grid h-52 place-items-center overflow-hidden rounded-[22px] bg-[#faf6f1] p-5">
            <span className="absolute left-3 top-3 grid h-7 place-items-center rounded-full bg-night px-2.5 font-mono text-[11px] font-medium text-white">
              {n}
            </span>
            {children}
          </div>
          <div className="relative flex flex-1 items-end gap-4 p-6 pt-4">
            <div className="flex-1">
              <h3 className="text-[19px] font-medium tracking-[-0.03em]">{title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-mute">{body}</p>
            </div>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-black/[0.05] text-ink transition-[background-color,color,transform] duration-300 ease-out-strong [@media(hover:hover)]:group-hover:rotate-45 [@media(hover:hover)]:group-hover:bg-brand [@media(hover:hover)]:group-hover:text-white">
              <ArrowUpRight className="size-4" />
            </span>
          </div>
        </Spotlight>
      </a>
    </Reveal>
  );
}

/* ------------------------------- Mini visuals ------------------------------ */

function ChainVisual() {
  const nodes = ["Syllabus", "CO-PO", "Blueprint", "SAR"];
  return (
    <div className="relative w-full max-w-md">
      <div className="absolute inset-x-[10%] top-5 h-px bg-black/15" />
      <div
        aria-hidden
        className="absolute left-[10%] top-5 w-[80%] [--travel:100%]"
      >
        <span className="-mt-[5px] block w-full animate-travel">
          <span className="block size-2.5 rounded-full bg-brand shadow-[0_0_0_5px_rgb(224_89_52/0.18)]" />
        </span>
      </div>
      <ol className="relative grid grid-cols-4">
        {nodes.map((n, i) => (
          <li key={n} className="flex flex-col items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full border border-black/10 bg-white font-mono text-xs font-semibold shadow-card">
              {i + 1}
            </span>
            <span className="text-[12.5px] font-medium text-ink-soft">{n}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function QueueVisual() {
  const jobs = [
    { name: "syllabus_p1.jpg", icon: FileImage, dur: "2.4s", delay: "0s" },
    { name: "CS301_units.pdf", icon: FileText, dur: "3.4s", delay: "-1.2s" },
    { name: "lab_manual.docx", icon: FileType2, dur: "2.9s", delay: "-0.5s" },
  ];
  return (
    <div className="w-full max-w-sm space-y-2">
      {jobs.map((j) => (
        <div key={j.name} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 shadow-card">
          <j.icon className="size-4 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[11px] font-medium">{j.name}</span>
            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-black/[0.06]">
              <span
                className="block h-full w-full origin-left animate-work rounded-full bg-brand"
                style={{ animationDuration: j.dur, animationDelay: j.delay }}
              />
            </span>
          </div>
        </div>
      ))}
      <p className="pt-1 text-center font-mono text-[10.5px] text-mute">
        concurrency = 3 · 4 more queued
      </p>
    </div>
  );
}

function TypesVisual() {
  const types = [
    ["MCQ", "L1"],
    ["Short Answer", "L2"],
    ["Numerical", "L3"],
    ["Case Study", "L4"],
    ["Long Essay", "L5"],
    ["Code", "L6"],
  ];
  return (
    <div className="flex max-w-[260px] flex-wrap justify-center gap-2">
      {types.map(([t, l], i) => (
        <motion.span
          key={t}
          initial={{ opacity: 0, transform: "translateY(10px) scale(0.95)" }}
          whileInView={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 + i * 0.06, ease: EASE }}
          className="inline-flex items-center gap-1.5 rounded-full bg-white py-1.5 pl-3 pr-1.5 text-[12.5px] font-medium shadow-card"
        >
          {t}
          <span className="rounded-full bg-brand-tint px-1.5 py-0.5 font-mono text-[10px] text-brand">{l}</span>
        </motion.span>
      ))}
    </div>
  );
}

function TutorVisual() {
  return (
    <div className="w-full max-w-[250px] space-y-2">
      <div className="ml-auto w-fit rounded-2xl rounded-br-md bg-night px-3.5 py-2 text-[12.5px] text-white">
        Just give me the answer?
      </div>
      <div className="w-fit rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-[12.5px] shadow-card">
        What do you already know about it?
      </div>
      <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-md bg-white px-3.5 py-3 shadow-card">
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            className="size-1.5 animate-blink rounded-full bg-brand"
            style={{ animationDelay: `${d * 0.18}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function RolesVisual() {
  const roles = ["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT"];
  return (
    <ul className="w-full max-w-[230px] space-y-1.5">
      {roles.map((r, i) => (
        <motion.li
          key={r}
          initial={{ opacity: 0, transform: "translateX(-10px)" }}
          whileInView={{ opacity: 1, transform: "translateX(0px)" }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 + i * 0.07, ease: EASE }}
          style={{ marginLeft: i * 14 }}
          className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 font-mono text-[11px] font-medium shadow-card"
        >
          <span className="flex items-center gap-2">
            <Lock className="size-3 text-brand" />
            {r}
          </span>
          <Check className="size-3 text-emerald-600" strokeWidth={3} />
        </motion.li>
      ))}
    </ul>
  );
}
