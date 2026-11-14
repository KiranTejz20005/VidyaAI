/**
 * Brand strings and outbound links for the marketing home page.
 * Auth and contact routes match the VidyaAI frontend app.
 */
export const site = {
  name: "VidyaAI",
  title: "VidyaAI — Outcome-Based Education & Exam Generation Platform",
  description:
    "VidyaAI turns raw syllabi into CO-PO matrices, Bloom-balanced exam papers, answer keys and NBA SAR reports, with a real-time Socratic AI tutor for every student.",
  year: 2026,
  links: {
    getStarted: "/register",
    signIn: "/login",
    contact: "/contact",
    github: "https://github.com/KiranTejz20005/VidyaAI",
    license: "https://opensource.org/licenses/MIT",
  },
} as const;

export const nav = [
  { label: "Platform", href: "#platform" },
  { label: "OBE Suite", href: "#pipeline" },
  { label: "Exam Engine", href: "#engine" },
  { label: "AI Tutor", href: "#tutor" },
  { label: "FAQ", href: "#faq" },
] as const;

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** True for same-origin app routes (use Next.js Link for client transitions). */
export function isInternalHref(href: string) {
  return href.startsWith("/") && !href.startsWith("//");
}
