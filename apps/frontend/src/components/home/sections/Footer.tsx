"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { GitBranch } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { Button } from "@/components/home/Button";
import { Logo, LogoMark } from "@/components/home/Logo";
import { EASE, Magnetic, Reveal, SplitWords } from "@/components/home/motion";
import { isInternalHref, site } from "@/lib/site";

const COLUMNS = [
  {
    title: "Platform",
    links: [
      { label: "Overview", href: "#platform" },
      { label: "OBE Suite", href: "#pipeline" },
      { label: "Exam Engine", href: "#engine" },
      { label: "AI Tutor", href: "#tutor" },
      { label: "Access Control", href: "#roles" },
    ],
  },
  {
    title: "Get started",
    links: [
      { label: "Create an account", href: site.links.getStarted },
      { label: "Sign in", href: site.links.signIn },
      { label: "Contact", href: site.links.contact },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "GitHub repository", href: site.links.github, external: true },
      { label: "Local quickstart", href: `${site.links.github}#readme`, external: true },
      { label: "MIT License", href: site.links.license, external: true },
    ],
  },
];

export function Cta() {
  return (
    <section id="contact" className="px-2 sm:px-4">
      <div className="relative overflow-hidden rounded-[36px] bg-night px-5 py-24 text-center text-white sm:rounded-[48px] sm:py-32">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="grid-lines-dark absolute inset-0" />
          <div className="aurora absolute inset-x-[-10%] bottom-[-70%] h-[120%] opacity-35" />
        </div>

        <div className="relative mx-auto max-w-3xl">
          <Reveal>
            <span className="relative mx-auto grid size-24 place-items-center">
              <span aria-hidden className="absolute inset-0 animate-ping-soft rounded-[30px] bg-brand/40" />
              <LogoMark size={96} className="relative drop-shadow-[0_20px_50px_rgb(224_89_52/0.7)]" />
            </span>
          </Reveal>
          <h2 className="mt-9 text-balance text-[clamp(2.3rem,6vw,4.6rem)] font-medium leading-[1.02] tracking-[-0.045em]">
            <SplitWords text="See VidyaAI run on *your* syllabus." />
          </h2>
          <Reveal delay={0.15}>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-[17px] leading-relaxed text-white/60">
              Upload one course, and watch it become a CO-PO matrix, a balanced question paper and
              an attainment report.
            </p>
          </Reveal>
          <Reveal delay={0.25}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Magnetic>
                <Button href={site.links.getStarted} variant="light" arrow>
                  Get started
                </Button>
              </Magnetic>
              <Magnetic>
                <Button href={site.links.contact} variant="ghost-dark">
                  Contact us
                </Button>
              </Magnetic>
              <Magnetic>
                <Button href={site.links.github} variant="ghost-dark" external>
                  <GitBranch className="size-4" /> View on GitHub
                </Button>
              </Magnetic>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const y = useTransform(scrollYProgress, [0, 1], ["32%", "0%"]);
  const letters = site.name.split("");

  return (
    <footer ref={ref} className="relative overflow-hidden pt-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 md:grid-cols-[1.3fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-[14.5px] leading-relaxed text-mute">
            The outcome-based education and exam generation platform for universities, colleges
            and schools.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h3 className="text-sm font-semibold tracking-[-0.01em]">{col.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => {
                const className =
                  "text-[14.5px] text-mute transition-colors duration-150 hover:text-ink";
                const external = "external" in l && l.external;
                return (
                  <li key={l.label}>
                    {external || !isInternalHref(l.href) ? (
                      <a
                        href={l.href}
                        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                        className={className}
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className={className}>
                        {l.label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        ))}
      </div>

      <div className="mx-auto mt-16 flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-line px-5 pt-6 text-[13px] text-mute">
        <span>
          © {site.year} {site.name}. Released under the MIT License.
        </span>
        <span>Designed for the future of outcome-based education.</span>
      </div>

      {/* Giant wordmark */}
      {/* The trigger lives on the container: letters start fully clipped, so they can't observe themselves. */}
      <motion.div
        aria-hidden
        style={{ y }}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
        className="pointer-events-none -mb-[0.2em] mt-6 select-none text-center text-[clamp(5rem,25.5vw,26rem)] font-semibold leading-[0.8] tracking-[-0.07em] text-black/[0.38]"
      >
        {letters.map((ch, i) => (
          <span key={i} className="inline-block overflow-x-visible overflow-y-clip pb-[0.04em]">
            <motion.span
              className="inline-block will-change-transform"
              variants={{
                hidden: { transform: "translateY(100%)" },
                show: { transform: "translateY(0%)", transition: { duration: 1, ease: EASE } },
              }}
            >
              {ch}
            </motion.span>
          </span>
        ))}
      </motion.div>
    </footer>
  );
}
