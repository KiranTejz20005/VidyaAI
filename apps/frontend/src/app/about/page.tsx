'use client';

import React, { useState } from 'react';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';
import ContactModal from '@/components/landing/ContactModal';
import { motion } from 'framer-motion';
import { 
  Sparkles, 
  ShieldCheck, 
  Award, 
  Users, 
  Target, 
  CheckCircle2 
} from 'lucide-react';
import Link from 'next/link';

export default function AboutPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"meeting" | "contact">("contact");

  const pillars = [
    {
      icon: <Users className="w-5 h-5 text-[#e05934]" />,
      title: "Teacher-First Philosophy",
      desc: "AI should never replace educator empathy or contextual wisdom. Vidya AI automates repetitive grading, paperwork, and rubric drafting so teachers can invest time where it matters: mentoring students."
    },
    {
      icon: <Target className="w-5 h-5 text-[#e05934]" />,
      title: "Pedagogical Rigor (NEP 2020 & OBE)",
      desc: "Engineered from the ground up to follow National Curriculum Framework standards and Bloom's Revised Taxonomy levels (Remembering through Creating), not generic internet scraping."
    },
    {
      icon: <ShieldCheck className="w-5 h-5 text-[#e05934]" />,
      title: "Zero-Knowledge Data Privacy",
      desc: "Student answer scripts and examination question papers are sacred intellectual property. We implement 256-bit encryption and never train public models on institutional data."
    },
    {
      icon: <Award className="w-5 h-5 text-[#e05934]" />,
      title: "Algorithmic Fairness & Transparency",
      desc: "Every grade recommendation comes with verifiable step-by-step reasoning tied to your central marking scheme. No black-box decisions; teachers retain full moderation authority."
    }
  ];

  const milestones = [
    { number: "2,500+", label: "Educators & Institutions Onboarded" },
    { number: "180,000+", label: "Exam Questions Calibrated" },
    { number: "80%", label: "Average Evaluation Time Recovered" },
    { number: "99.4%", label: "Curriculum Standard Accuracy" },
  ];

  const openInquiryModal = (type: "meeting" | "contact") => {
    setModalType(type);
    setModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#fcfbf9] text-[#1e1e1a] selection:bg-[#e05934]/20 selection:text-[#e05934] overflow-x-hidden">
      <Header onContactClick={() => openInquiryModal("contact")} />

      {/* Hero Section */}
      <section className="relative pt-24 pb-16 lg:pt-36 lg:pb-24 border-b border-[#f3ede4] overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-orange-100/30 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-4 max-w-3xl mx-auto"
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-50 border border-orange-200/60 rounded-full text-xs font-mono font-semibold text-[#e05934] uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" /> Our Mission & Vision
            </span>
            <h1 className="font-display font-medium text-3xl sm:text-4xl lg:text-5xl text-gray-950 tracking-tight leading-tight">
              Transforming Assessment into Academic Growth
            </h1>
            <p className="font-sans text-sm sm:text-base text-gray-600 leading-relaxed max-w-2xl mx-auto">
              Vidya AI was founded with a singular purpose: to relieve educators from the crushing burden of administrative evaluation while providing students with fair, constructive, and actionable feedback.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats Ribbon */}
      <section className="py-12 bg-white border-b border-[#f3ede4]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
            {milestones.map((milestone, idx) => (
              <div key={idx} className="space-y-1 p-4 rounded-xl bg-[#fcfbf9] border border-[#f3ede4]">
                <div className="font-display font-bold text-2xl sm:text-3xl text-gray-950">{milestone.number}</div>
                <div className="font-sans text-xs text-gray-500">{milestone.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Core Pillars */}
      <section className="py-20 bg-[#FAF7F2] border-b border-[#f3ede4]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
            <span className="text-xs font-mono font-bold tracking-widest text-[#e05934] uppercase">Foundational Pillars</span>
            <h2 className="font-display font-medium text-2xl sm:text-3.5xl text-gray-950 tracking-tight">
              Why Institutional Leaders Trust Vidya AI
            </h2>
            <p className="font-sans text-xs sm:text-sm text-gray-600 leading-relaxed">
              We build academic software with deep respect for curriculum compliance, student fairness, and educational integrity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-5xl mx-auto">
            {pillars.map((pillar, pIdx) => (
              <div 
                key={pIdx}
                className="bg-white border border-[#f3ede4] rounded-2xl p-6 sm:p-8 space-y-3 shadow-xs hover:border-orange-200/80 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center">
                  {pillar.icon}
                </div>
                <h3 className="font-display font-semibold text-lg text-gray-950">{pillar.title}</h3>
                <p className="font-sans text-xs sm:text-sm text-gray-600 leading-relaxed">{pillar.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pedagogical Compliance */}
      <section className="py-20 bg-white border-b border-[#f3ede4]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-6 space-y-4">
              <span className="text-xs font-mono font-bold text-[#e05934] uppercase tracking-wider">Curricular Standards</span>
              <h3 className="font-display font-medium text-2xl sm:text-3xl text-gray-950">
                Calibrated for National & International Curricula
              </h3>
              <p className="font-sans text-xs sm:text-sm text-gray-600 leading-relaxed">
                Rather than treating all examinations like plain English text, Vidya AI parses exact syllabus blueprints, question typology matrices, and mark weighting distributions specified by education boards:
              </p>
              <div className="space-y-2 pt-2">
                {[
                  "CBSE & ICSE Senior Secondary frameworks with Case-Based & Assertion-Reason items",
                  "NEP 2020 competency-based learning and multi-disciplinary question styles",
                  "Outcome-Based Education (OBE) course outcome direct attainment calculations",
                  "Cambridge International (IGCSE/A-Levels) structured command words compliance"
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-xs text-gray-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-6">
              <div className="bg-[#FAF7F2] border border-[#f3ede4] rounded-2xl p-6 sm:p-8 space-y-4">
                <div className="font-mono text-xs text-gray-400 uppercase font-bold">INSTITUTIONAL COMMITMENT</div>
                <p className="font-sans text-xs sm:text-sm text-gray-700 italic leading-relaxed">
                  "Our goal is not to produce more tests; it is to make assessments diagnostically meaningful so that no student falls through the cracks and no teacher burns out."
                </p>
                <div className="pt-2 border-t border-[#f3ede4] flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-900">Vidya AI Academic Board</span>
                  <span className="text-[#e05934] font-mono">Pedagogy Division</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Bottom */}
      <section className="py-16 bg-[#fcfbf9]">
        <div className="max-w-3xl mx-auto px-4 text-center space-y-6">
          <h3 className="font-display font-medium text-2xl sm:text-3xl text-gray-950">
            Partner with Vidya AI for Your Institution
          </h3>
          <p className="font-sans text-xs sm:text-sm text-gray-600 max-w-xl mx-auto">
            Schedule a conversation with our curriculum consultants to discuss department rollout, teacher workshops, and custom LMS integrations.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => openInquiryModal("meeting")}
              className="px-6 py-3 rounded-full bg-[#1e1e1a] text-white hover:bg-black font-semibold text-xs sm:text-sm shadow-xs transition-colors"
            >
              Request Institutional Pilot
            </button>
            <Link
              href="/contact"
              className="px-6 py-3 rounded-full bg-white text-gray-800 border border-[#f3ede4] hover:border-gray-300 font-semibold text-xs sm:text-sm transition-colors"
            >
              Contact Us Directly
            </Link>
          </div>
        </div>
      </section>

      <Footer onContactClick={() => openInquiryModal("contact")} onNavigate={() => {}} />

      <ContactModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialType={modalType}
      />
    </div>
  );
}
