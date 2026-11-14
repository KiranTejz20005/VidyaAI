import { Reveal } from "@/components/home/motion";

/** Infrastructure named in the platform's stack. Text only, no third-party logos. */
const STACK = [
  "NVIDIA NIM",
  "Groq Cloud",
  "Anthropic",
  "OpenAI",
  "PostgreSQL",
  "pgvector",
  "Redis",
  "BullMQ",
  "Socket.IO",
  "LiveKit",
  "Prisma",
  "Next.js",
];

export function Marquee() {
  return (
    <section aria-label="Technology stack" className="relative py-14 sm:py-20">
      <Reveal>
        <p className="text-center text-[15px] font-medium text-ink-soft">
          Engineered on infrastructure your IT team already trusts
        </p>
      </Reveal>
      <Reveal delay={0.1}>
        <div className="marquee mask-fade-x mx-auto mt-8 max-w-5xl overflow-hidden">
          <div className="marquee-track flex w-max animate-marquee">
            {[0, 1].map((dup) => (
              <ul key={dup} aria-hidden={dup === 1} className="flex shrink-0 items-center">
                {STACK.map((name) => (
                  <li
                    key={name}
                    className="flex items-center gap-10 whitespace-nowrap pl-10 text-[22px] font-semibold tracking-[-0.03em] text-black/35 transition-colors duration-200 hover:text-ink sm:gap-14 sm:pl-14"
                  >
                    {name}
                    <span aria-hidden className="size-1 rounded-full bg-black/15" />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
