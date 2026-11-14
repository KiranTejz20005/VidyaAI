import type { Metadata } from "next";
import { LandingProviders } from "@/components/home/Providers";
import { Faq } from "@/components/home/sections/Faq";
import { Cta, Footer } from "@/components/home/sections/Footer";
import { Hero } from "@/components/home/sections/Hero";
import { Lifecycle } from "@/components/home/sections/Lifecycle";
import { Marquee } from "@/components/home/sections/Marquee";
import { Modules } from "@/components/home/sections/Modules";
import { Nav } from "@/components/home/sections/Nav";
import { Pipeline } from "@/components/home/sections/Pipeline";
import { Problem } from "@/components/home/sections/Problem";
import { Roles } from "@/components/home/sections/Roles";
import { Stats } from "@/components/home/sections/Stats";
import { Tutor } from "@/components/home/sections/Tutor";
import { Why } from "@/components/home/sections/Why";
import { constructMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata: Metadata = constructMetadata({
  title: "Outcome-Based Education & Exam Generation Platform",
  description: site.description,
  path: "",
});

export default function Home() {
  return (
    <LandingProviders>
      <div className="min-h-screen bg-paper text-ink selection:bg-brand selection:text-white">
        <Nav />
        <main>
          <Hero />
          <Marquee />
          <Problem />
          <Pipeline />
          <Modules />
          <Lifecycle />
          <Tutor />
          <Why />
          <Roles />
          <Stats />
          <Faq />
          <Cta />
        </main>
        <Footer />
      </div>
    </LandingProviders>
  );
}
