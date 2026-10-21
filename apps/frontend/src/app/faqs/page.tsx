'use client';

import React, { useState } from 'react';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';
import ContactModal from '@/components/landing/ContactModal';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, 
  Sparkles, 
  Search, 
  HelpCircle, 
  Mail, 
  ArrowRight,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import Link from 'next/link';

interface FAQItem {
  question: string;
  answer: string;
  category: "Curriculum & Blueprint" | "Grading & Rubrics" | "Security & Data" | "Implementation";
}

export default function FAQsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"meeting" | "contact">("contact");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const categories = [
    "All",
    "Curriculum & Blueprint",
    "Grading & Rubrics",
    "Security & Data",
    "Implementation"
  ];

  const faqList: FAQItem[] = [
    {
      category: "Curriculum & Blueprint",
      question: "How does Vidya AI ensure generated question papers match board blueprints?",
      answer: "Vidya AI is trained on official curriculum matrices (CBSE, ICSE, State Boards, Cambridge, and NEP 2020 guidelines). When teachers specify a subject, grade, and chapter weightage, the system creates balanced papers with exact distributions of MCQs, Short Answers, Case Studies, and Long Questions mapped across Bloom's Taxonomy cognitive levels."
    },
    {
      category: "Curriculum & Blueprint",
      question: "Can teachers edit or replace individual questions after generation?",
      answer: "Absolutely. Teachers maintain 100% editorial authority. You can swap any individual question with one click, modify the difficulty rating, adjust marks, reorder sections, or insert proprietary questions from your personal institutional library."
    },
    {
      category: "Grading & Rubrics",
      question: "How does the subjective evaluation engine handle handwritten student answer scripts?",
      answer: "Our proprietary handwriting OCR recognizes cursive and variable student handwriting, diagrams, and numerical steps. The AI applies your institution's central rubric step-by-step, allocating partial marks with transparent rationale that teachers can approve, override, or refine."
    },
    {
      category: "Grading & Rubrics",
      question: "Does Vidya AI eliminate evaluator bias across different sections?",
      answer: "Yes. By evaluating every script against identical, calibrated rubric criteria, Vidya AI eliminates subjective discrepancies between lenient and strict evaluators, ensuring uniform, verifiable standard deviation across multiple class sections."
    },
    {
      category: "Security & Data",
      question: "Is student data protected and compliant with data privacy laws?",
      answer: "Student privacy is foundational. All examination records, scans, and grading results are encrypted using AES-256 at rest and TLS 1.3 in transit. We comply with Indian Digital Personal Data Protection (DPDP) standards and never use institutional student submissions to train public AI models."
    },
    {
      category: "Security & Data",
      question: "Can an institution host or isolate its examination question papers privately?",
      answer: "Yes. Enterprise plans support private tenant isolation, custom VPC peering, role-based access control (RBAC), and automated data purging schedules according to your university or school board retention policies."
    },
    {
      category: "Implementation",
      question: "How quickly can a school or university department roll out Vidya AI?",
      answer: "A single teacher or small department can begin generating question papers in under five minutes. For campus-wide deployments with LMS integration (Moodle, Canvas, Google Classroom), onboarding and faculty orientation typically takes 2 to 3 business days."
    },
    {
      category: "Implementation",
      question: "Does Vidya AI support Outcome-Based Education (OBE) and NBA accreditation reports?",
      answer: "Yes. Our Higher Education edition automatically calculates Course Outcome (CO) and Program Outcome (PO) attainment percentages, providing ready-to-submit criteria reports for NBA SAR and NAAC evaluation."
    }
  ];

  const filteredFaqs = faqList.filter((item) => {
    const matchesCategory = activeCategory === "All" || item.category === activeCategory;
    const matchesSearch = item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

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

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-4"
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-50 border border-orange-200/60 rounded-full text-xs font-mono font-semibold text-[#e05934] uppercase tracking-wider">
              <HelpCircle className="w-3.5 h-3.5" /> Frequently Asked Questions
            </span>
            <h1 className="font-display font-medium text-3xl sm:text-4xl lg:text-5xl text-gray-950 tracking-tight leading-tight">
              Everything You Need to Know About Vidya AI
            </h1>
            <p className="font-sans text-sm sm:text-base text-gray-600 leading-relaxed max-w-xl mx-auto">
              Find detailed answers about curriculum compatibility, grading precision, data security, and institutional rollout.
            </p>
          </motion.div>

          {/* Search Bar */}
          <div className="max-w-md mx-auto relative pt-4">
            <Search className="w-4 h-4 text-gray-400 absolute left-4.5 top-7.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search questions (e.g. rubrics, CBSE, privacy)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white border border-[#f3ede4] rounded-full text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e05934] focus:ring-2 focus:ring-[#e05934]/10 shadow-xs transition-all"
            />
          </div>
        </div>
      </section>

      {/* Filter Tabs & FAQ List */}
      <section className="py-16 lg:py-24 bg-[#fdfcfb]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          
          {/* Category Filter Pills */}
          <div className="flex items-center justify-center gap-2 overflow-x-auto pb-2 no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
                  activeCategory === cat
                    ? "bg-[#1e1e1a] text-white shadow-xs"
                    : "bg-white border border-[#f3ede4] text-gray-600 hover:text-black hover:border-gray-300"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* FAQ Accordion List */}
          <div className="space-y-4">
            {filteredFaqs.length > 0 ? (
              filteredFaqs.map((faq, index) => {
                const isOpen = openIndex === index;
                return (
                  <div
                    key={index}
                    className="bg-white border border-[#f3ede4] rounded-2xl overflow-hidden shadow-xs hover:border-orange-200/70 transition-all"
                  >
                    <button
                      onClick={() => setOpenIndex(isOpen ? null : index)}
                      className="w-full px-6 py-5 flex items-center justify-between text-left focus:outline-none"
                    >
                      <div className="pr-4 space-y-1">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#e05934]">
                          {faq.category}
                        </span>
                        <h4 className="font-display font-medium text-sm sm:text-base text-gray-950">
                          {faq.question}
                        </h4>
                      </div>
                      <ChevronDown
                        className={`w-5 h-5 text-gray-400 shrink-0 transition-transform duration-300 ${
                          isOpen ? "rotate-180 text-[#e05934]" : ""
                        }`}
                      />
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden border-t border-[#f3ede4]"
                        >
                          <div className="px-6 py-5 bg-[#fcfbf9]/60 font-sans text-xs sm:text-sm text-gray-600 leading-relaxed">
                            {faq.answer}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 bg-white border border-[#f3ede4] rounded-2xl p-8 space-y-3">
                <p className="font-sans text-sm text-gray-500">No questions found matching "{searchQuery}".</p>
                <button
                  onClick={() => { setSearchQuery(""); setActiveCategory("All"); }}
                  className="text-xs font-semibold text-[#e05934] hover:underline"
                >
                  Clear search filters
                </button>
              </div>
            )}
          </div>

          {/* Need More Help Box */}
          <div className="bg-[#FAF7F2] border border-[#f3ede4] rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center sm:text-left">
              <h4 className="font-display font-semibold text-base text-gray-950">
                Have a specific institutional question?
              </h4>
              <p className="font-sans text-xs sm:text-sm text-gray-600">
                Our curriculum team is happy to review your syllabus blueprint or discuss custom enterprise deployments.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <a
                href="mailto:info.vidhyaai@gmail.com"
                className="px-5 py-2.5 rounded-full bg-white border border-gray-200 hover:border-[#e05934] text-gray-800 text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5 text-[#e05934]" />
                <span>Email Us</span>
              </a>
              <button
                onClick={() => openInquiryModal("contact")}
                className="px-5 py-2.5 rounded-full bg-[#1e1e1a] hover:bg-black text-white text-xs font-semibold shadow-xs transition-colors"
              >
                Inquiry Form
              </button>
            </div>
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
