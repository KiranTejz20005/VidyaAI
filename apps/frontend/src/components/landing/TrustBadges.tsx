import React from "react";
import { 
  GraduationCap, 
  Award, 
  BookOpen, 
  ShieldCheck, 
  CheckCircle2, 
  School, 
  Building2 
} from "lucide-react";

export default function TrustBadges() {
  const partners = [
    { 
      name: "CBSE Affiliated Schools", 
      icon: Award,
      badge: "Curriculum Aligned"
    },
    { 
      name: "ICSE & ISC Board Standards", 
      icon: BookOpen,
      badge: "Rubric Verified"
    },
    { 
      name: "NEP 2020 Competency Framework", 
      icon: CheckCircle2,
      badge: "Compliant"
    },
    { 
      name: "Delhi Public School Society", 
      icon: GraduationCap,
      badge: "Partner Schools"
    },
    { 
      name: "Kendriya Vidyalaya Network", 
      icon: Building2,
      badge: "Academic Suite"
    },
    { 
      name: "Cambridge Assessment International", 
      icon: ShieldCheck,
      badge: "Secondary & IGCSE"
    },
    { 
      name: "DAV Public Schools Network", 
      icon: School,
      badge: "Institutional Pilot"
    },
    { 
      name: "IB World School Framework", 
      icon: Award,
      badge: "MYP & DP Ready"
    },
  ];

  // Duplicate items within track to ensure ample width on all screen resolutions
  const trackItems = [...partners, ...partners];

  return (
    <section className="py-10 border-t border-b border-[#f3ede4] bg-[#fcfbf9]/60 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-4">
        <p className="text-center text-[10px] sm:text-xs font-mono tracking-widest text-[#e05934] uppercase font-bold">
          Trusted by Leading Schools & Aligned with Major Boards
        </p>
      </div>

      {/* Seamless Infinite Marquee Wrapper */}
      <div className="relative flex overflow-hidden w-full marquee-container select-none">
        
        {/* Track 1: Translates from 0% to -100% */}
        <div className="flex shrink-0 items-center gap-6 sm:gap-8 pr-6 sm:pr-8 animate-marquee">
          {trackItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={`track1-${index}`}
                className="inline-flex items-center space-x-2.5 px-3.5 py-2 rounded-full bg-white border border-[#f3ede4] text-gray-700 hover:text-black hover:border-orange-200/80 transition-all cursor-pointer shrink-0 shadow-3xs"
              >
                <span className="p-1 rounded-md bg-orange-50 text-[#e05934] shrink-0">
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="font-display font-semibold text-xs sm:text-sm tracking-tight">
                  {item.name}
                </span>
                <span className="hidden sm:inline-block text-[9px] font-mono text-gray-400 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded">
                  {item.badge}
                </span>
              </div>
            );
          })}
        </div>

        {/* Track 2: Identical twin track that follows Track 1 seamlessly */}
        <div className="flex shrink-0 items-center gap-6 sm:gap-8 pr-6 sm:pr-8 animate-marquee" aria-hidden="true">
          {trackItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={`track2-${index}`}
                className="inline-flex items-center space-x-2.5 px-3.5 py-2 rounded-full bg-white border border-[#f3ede4] text-gray-700 hover:text-black hover:border-orange-200/80 transition-all cursor-pointer shrink-0 shadow-3xs"
              >
                <span className="p-1 rounded-md bg-orange-50 text-[#e05934] shrink-0">
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="font-display font-semibold text-xs sm:text-sm tracking-tight">
                  {item.name}
                </span>
                <span className="hidden sm:inline-block text-[9px] font-mono text-gray-400 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded">
                  {item.badge}
                </span>
              </div>
            );
          })}
        </div>

        {/* Gradient edge masks for smooth entrance/exit */}
        <div className="absolute top-0 bottom-0 left-0 w-20 sm:w-32 bg-gradient-to-r from-[#fcfbf9] to-transparent pointer-events-none z-10" />
        <div className="absolute top-0 bottom-0 right-0 w-20 sm:w-32 bg-gradient-to-l from-[#fcfbf9] to-transparent pointer-events-none z-10" />
      </div>
    </section>
  );
}
