'use client';

import React, { useState } from 'react';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';
import ContactModal from '@/components/landing/ContactModal';
import { motion } from 'framer-motion';
import { 
  Building2, 
  GraduationCap, 
  BookOpen, 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  ShieldCheck, 
  BarChart3, 
  FileText,
  Brain
} from 'lucide-react';
import Link from 'next/link';

export default function SolutionsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"meeting" | "contact">("contact");

  const solutions = [
    {
      id: "schools",
      badge: "K-12 & School Networks",
      title: "CBSE, ICSE & State Board Assessment Suite",
      description: "Empower school teachers to create balanced, curriculum-aligned exam papers in minutes while automating subjective grading with step-by-step rubric evaluation.",
      icon: <GraduationCap className="w-6 h-6 text-[#e05934]" />,
      stats: [
        { label: "Grading Hours Saved", value: "80%" },
        { label: "Curriculum Alignment", value: "100% NEP 2020" },
        { label: "Rubric Accuracy", value: "99.2%" },
      ],
      features: [
        "Automatic Blueprint & Section Partitioning (MCQs, Short Answer, Long Essay)",
        "CBSE/ICSE Competency-based questions with real-life case studies",
        "Handwritten answer script OCR with line-by-line step marking",
        "Instant parent-ready diagnostic reports highlighting learning gaps"
      ],
      ctaText: "Explore K-12 Assessment",
      ctaLink: "/contact"
    },
    {
      id: "colleges",
      badge: "Colleges & Higher Education",
      title: "Outcome-Based Education (OBE) & NBA SAR Automation",
      description: "Designed for universities and engineering/degree colleges to seamlessly map course outcomes (COs) and program outcomes (POs) directly to exam questions.",
      icon: <Building2 className="w-6 h-6 text-[#e05934]" />,
      stats: [
        { label: "SAR Report Prep Time", value: "< 2 Hours" },
        { label: "Bloom's Level Mapping", value: "L1 through L6" },
        { label: "Accreditation Readiness", value: "Instant" },
      ],
      features: [
        "Direct Bloom's Taxonomy cognitive level classification on every question",
        "One-click Course Outcome (CO) attainment matrix generation",
        "Department-level moderation and paper review governance workflows",
        "NBA / NAAC criterion compliance reports exportable to PDF & Excel"
      ],
      ctaText: "View Higher Ed Solutions",
      ctaLink: "/solutions/colleges"
    },
    {
      id: "coaching",
      badge: "Coaching & Test Prep Institutes",
      title: "High-Volume Mock Test Generation & Diagnostics",
      description: "Scale your test series for competitive exams (JEE, NEET, CUET, Foundation) with instant multi-set paper variations and detailed student performance forensics.",
      icon: <BookOpen className="w-6 h-6 text-[#e05934]" />,
      stats: [
        { label: "Unique Sets Generated", value: "10+ Sets / Run" },
        { label: "Question Leak Protection", value: "Unique Parameterization" },
        { label: "Turnaround Time", value: "< 60 Seconds" },
      ],
      features: [
        "Numerical parameter randomization to eliminate cheating across batches",
        "Comprehensive question difficulty distribution (Easy, Moderate, Challenging)",
        "Step-by-step solution keys with conceptual hints and alternative methods",
        "Batch-wide weakness cluster analytics for targeted faculty revision"
      ],
      ctaText: "Scale Mock Assessments",
      ctaLink: "/contact"
    }
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
              <Sparkles className="w-3.5 h-3.5" /> Institutional Solutions
            </span>
            <h1 className="font-display font-medium text-3xl sm:text-4xl lg:text-5xl text-gray-950 tracking-tight leading-tight">
              AI Assessment Infrastructure Built for Every Level of Education
            </h1>
            <p className="font-sans text-sm sm:text-base text-gray-600 leading-relaxed max-w-2xl mx-auto">
              Whether you administer a CBSE school network, an autonomous engineering college, or a competitive coaching enterprise, Vidya AI delivers calibrated, tamper-proof academic intelligence.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Solutions Cards Section */}
      <section className="py-20 lg:py-28 bg-[#fdfcfb]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16 lg:space-y-24">
          {solutions.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className={`grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center ${
                index % 2 === 1 ? "lg:flex-row-reverse" : ""
              }`}
            >
              {/* Content Column */}
              <div className={`lg:col-span-7 space-y-6 ${index % 2 === 1 ? "lg:order-2" : ""}`}>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-stone-100 border border-stone-200/70 rounded-full text-xs font-mono font-bold text-gray-700 uppercase">
                  {item.icon}
                  <span>{item.badge}</span>
                </div>
                
                <h2 className="font-display font-medium text-2xl sm:text-3xl text-gray-950 tracking-tight">
                  {item.title}
                </h2>
                
                <p className="font-sans text-sm sm:text-base text-gray-600 leading-relaxed">
                  {item.description}
                </p>

                {/* Features List */}
                <div className="space-y-3 pt-2">
                  {item.features.map((feature, fIdx) => (
                    <div key={fIdx} className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span className="font-sans text-xs sm:text-sm text-gray-700 leading-snug">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Action Button */}
                <div className="pt-4">
                  <Link
                    href={item.ctaLink}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#1e1e1a] text-white hover:bg-black font-semibold text-xs sm:text-sm tracking-wide shadow-sm hover:shadow transition-all duration-200 group"
                  >
                    <span>{item.ctaText}</span>
                    <ArrowRight className="w-4 h-4 text-[#e05934] group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </div>

              {/* Stats Card Column */}
              <div className={`lg:col-span-5 ${index % 2 === 1 ? "lg:order-1" : ""}`}>
                <div className="bg-white border border-[#f3ede4] rounded-2xl p-6 sm:p-8 shadow-xs hover:border-orange-200/70 transition-all space-y-6">
                  <h4 className="font-mono text-xs uppercase tracking-wider text-gray-400 font-bold border-b border-gray-100 pb-3">
                    Key Performance Metrics
                  </h4>
                  <div className="space-y-4">
                    {item.stats.map((stat, sIdx) => (
                      <div key={sIdx} className="bg-[#fcfbf9] border border-[#f3ede4] rounded-xl p-4 flex items-center justify-between">
                        <span className="font-sans text-xs sm:text-sm font-medium text-gray-600">{stat.label}</span>
                        <span className="font-display font-extrabold text-base sm:text-lg text-[#e05934]">{stat.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-medium">Strict ISO 27001 & DPDP compliance guaranteed.</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Institutional Consultation Banner */}
      <section className="py-16 bg-[#FAF7F2] border-t border-[#f3ede4]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <h3 className="font-display font-medium text-2xl sm:text-3xl text-gray-950">
            Looking for Custom Campus Integration?
          </h3>
          <p className="font-sans text-xs sm:text-sm text-gray-600 max-w-xl mx-auto leading-relaxed">
            Our engineering team connects Vidya AI directly to your existing ERP, LMS (Canvas, Moodle, Google Classroom), and central examination databases.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => openInquiryModal("meeting")}
              className="px-6 py-3 rounded-full bg-[#e05934] text-white hover:bg-orange-600 font-semibold text-xs sm:text-sm shadow-xs transition-colors"
            >
              Book Technical Consultation
            </button>
            <Link
              href="/contact"
              className="px-6 py-3 rounded-full bg-white text-gray-800 border border-[#f3ede4] hover:border-gray-300 font-semibold text-xs sm:text-sm transition-colors"
            >
              Contact Solutions Team
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
