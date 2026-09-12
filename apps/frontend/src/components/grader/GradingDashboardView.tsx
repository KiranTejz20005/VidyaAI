import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  ChevronUp,
  Sparkles,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Layers,
  FileText,
  Eye,
  Edit3,
  Search,
  BookOpen,
  Check,
  ScanText,
  X,
  Copy,
} from 'lucide-react';
import { AssessmentData } from './graderTypes';
import { HandwrittenSheetRenderer } from './HandwrittenSheetRenderer';

interface DashboardViewProps {
  assessment: AssessmentData;
  onUpdateAssessment?: (updated: AssessmentData) => void;
  onOpenSummary?: () => void;
  onReset?: () => void;
  onBack?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  assessment,
  onUpdateAssessment,
  onOpenSummary,
  onReset,
  onBack,
}) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Currently selected / expanded question ID
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>(assessment.questions[0]?.id || 'q1');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set([assessment.questions[0]?.id || 'q1']));
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [highlightEnabled, setHighlightEnabled] = useState<boolean>(true);
  const [filterMode, setFilterMode] = useState<'all' | 'answered' | 'partial' | 'incorrect' | 'unanswered'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showOcrModal, setShowOcrModal] = useState<boolean>(false);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [copiedOcr, setCopiedOcr] = useState<boolean>(false);

  const leftPaneRef = useRef<HTMLDivElement>(null);
  const selectedCardRef = useRef<HTMLDivElement>(null);

  // Sync selected question whenever assessment changes
  useEffect(() => {
    if (assessment.questions.length > 0) {
      const firstQ = assessment.questions[0];
      setSelectedQuestionId(firstQ.id);
      setExpandedIds(new Set([firstQ.id]));
      if (firstQ.answerRegion?.page) {
        setCurrentPage(firstQ.answerRegion.page);
      } else {
        setCurrentPage(1);
      }
    }
  }, [assessment.id]);

  // Auto-scroll question list into view on the left whenever selectedQuestionId changes
  useEffect(() => {
    if (selectedQuestionId && selectedCardRef.current) {
      selectedCardRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedQuestionId]);

  // Auto-switch right page when selected question changes
  const handleSelectQuestion = (qId: string) => {
    setSelectedQuestionId(qId);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(qId);
      return next;
    });

    const question = assessment.questions.find((q) => q.id === qId);
    if (question?.answerRegion?.page) {
      setCurrentPage(question.answerRegion.page);
    }
  };

  const handleToggleExpand = (qId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) {
        next.delete(qId);
      } else {
        next.add(qId);
      }
      return next;
    });
    setSelectedQuestionId(qId);

    const question = assessment.questions.find((q) => q.id === qId);
    if (question?.answerRegion?.page) {
      setCurrentPage(question.answerRegion.page);
    }
  };

  // Filtered list of questions
  const filteredQuestions = assessment.questions.filter((q) => {
    if (filterMode === 'answered' && q.status !== 'answered') return false;
    if (filterMode === 'partial' && q.status !== 'partial') return false;
    if (filterMode === 'incorrect' && q.status !== 'incorrect') return false;
    if (filterMode === 'unanswered' && q.status !== 'unanswered') return false;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchNum = q.number.toLowerCase().includes(query);
      const matchText = q.text.toLowerCase().includes(query);
      const matchAi = q.aiFeedback.toLowerCase().includes(query);
      return matchNum || matchText || matchAi;
    }
    return true;
  });

  const allQuestionsExpanded =
    filteredQuestions.length > 0 &&
    filteredQuestions.every((question) => expandedIds.has(question.id));

  const handleExpandAll = () => {
    setExpandedIds(new Set(filteredQuestions.map((q) => q.id)));
  };

  const handleCollapseAll = () => {
    setExpandedIds(new Set());
  };

  const handleOpenReport = () => {
    setShowReportModal(true);
    onOpenSummary?.();
  };

  // Calculate score summary
  const totalAwarded = assessment.questions.reduce((acc, q) => acc + (q.marksAwarded || 0), 0);
  const totalMax = assessment.questions.reduce((acc, q) => acc + (q.maxMarks || 0), 0);
  const scorePercentage = totalMax ? Math.round((totalAwarded / totalMax) * 100) : 0;
  const answeredCount = assessment.questions.filter((q) => q.status === 'answered').length;
  const partialCount = assessment.questions.filter((q) => q.status === 'partial').length;
  const incorrectCount = assessment.questions.filter((q) => q.status === 'incorrect').length;
  const unansweredCount = assessment.questions.filter((q) => q.status === 'unanswered').length;

  // Handle manual teacher mark update
  const handleUpdateMarks = (qId: string, newMarks: number) => {
    const clamped = Math.max(0, Math.min(newMarks, 100));
    const updatedQuestions = assessment.questions.map((q) => {
      if (q.id === qId) {
        return {
          ...q,
          marksAwarded: clamped,
          status: clamped === 0
            ? (q.studentAnswerText ? ('incorrect' as const) : ('unanswered' as const))
            : clamped >= q.maxMarks
            ? ('answered' as const)
            : ('partial' as const),
        };
      }
      return q;
    });

    onUpdateAssessment?.({
      ...assessment,
      questions: updatedQuestions,
      totalMarksAwarded: updatedQuestions.reduce((acc, q) => acc + q.marksAwarded, 0),
    });
  };

  const handleCopyOcrJson = () => {
    if (assessment.ocrResult) {
      navigator.clipboard.writeText(JSON.stringify(assessment.ocrResult, null, 2));
      setCopiedOcr(true);
      setTimeout(() => setCopiedOcr(false), 2000);
    }
  };

  return (
    <div
      id="assessment-dashboard-view"
      className="flex-1 flex flex-col min-h-[calc(100vh-7rem)] h-[calc(100vh-5rem)] overflow-hidden bg-neutral-100 select-none rounded-xl border border-neutral-200 shadow-sm"
    >
      {/* Quick Summary Top Header */}
      <div className="bg-white border-b border-neutral-200/80 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 rounded-xl border border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 transition-colors shrink-0 flex items-center gap-1 text-xs font-semibold"
              title="Back"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-extrabold text-neutral-900 tracking-tight flex items-center gap-2 truncate">
              <span className="truncate">{assessment.title}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 shrink-0">
                {assessment.grade}
              </span>
            </h2>
            <p className="text-xs text-neutral-500 truncate">
              Student: <span className="font-semibold text-neutral-800">{assessment.studentName}</span> ({assessment.rollNumber}) • {assessment.school}
            </p>
          </div>
        </div>

        {/* Score & Action pills */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* OCR Question Paper Inspector Button */}
          <button
            id="btn-open-ocr-inspector"
            onClick={() => setShowOcrModal(true)}
            className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            title="Inspect Optical Character Recognition (OCR) details and question hierarchy"
          >
            <ScanText className="w-3.5 h-3.5 text-orange-600 shrink-0" />
            <span className="hidden sm:inline">OCR Paper Details</span>
            <span className="sm:hidden">OCR</span>
            {assessment.ocrResult && (
              <span className="px-1.5 py-0.2 bg-orange-200/80 text-orange-900 rounded text-[10px] font-mono shrink-0">
                {assessment.ocrResult.extractedQuestions.length} Qs
              </span>
            )}
          </button>

          <button
            id="btn-view-score-summary"
            type="button"
            onClick={handleOpenReport}
            className="flex items-center gap-1.5 sm:gap-2 px-3 py-1 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-semibold text-neutral-800 shadow-2xs shrink-0 whitespace-nowrap transition-colors cursor-pointer"
            title="View score breakdown"
          >
            <span className="hidden sm:inline">Score:</span>
            <span className="text-emerald-600 font-extrabold text-sm">{totalAwarded}/{totalMax}</span>
            <span className="text-neutral-400 text-[11px]">({scorePercentage}%)</span>
          </button>

          <button
            id="btn-view-grading-summary"
            type="button"
            onClick={handleOpenReport}
            className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer shrink-0 whitespace-nowrap"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline">Grading Report</span>
            <span className="sm:hidden">Report</span>
          </button>
        </div>
      </div>

      {/* Main Split Body */}
      <div className="flex-1 flex flex-col xl:flex-row overflow-hidden min-h-0">
        {/* ================= LEFT COLUMN: EXTRACTED QUESTIONS ================= */}
        <div
          id="left-questions-pane"
          ref={leftPaneRef}
          className="w-full xl:w-[46%] bg-white xl:border-r border-b xl:border-b-0 border-neutral-200/90 flex flex-col overflow-hidden h-[52%] xl:h-full shrink-0 min-w-[340px]"
        >
          {/* Header Bar matching Figma */}
          <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between shrink-0 bg-white">
            <div>
              <h3 className="text-sm font-extrabold text-neutral-900 tracking-tight">
                Extracted Questions (from question paper)
              </h3>
              <p className="text-[11px] text-neutral-500">
                Click any question to highlight student answer on sheet
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                id="btn-expand-collapse-all"
                onClick={() => {
                  if (allQuestionsExpanded) {
                    handleCollapseAll();
                  } else {
                    handleExpandAll();
                  }
                }}
                className="text-xs font-semibold text-orange-600 hover:text-orange-700 px-2.5 py-1 rounded-md hover:bg-orange-50 transition-colors shrink-0 whitespace-nowrap cursor-pointer"
              >
                {allQuestionsExpanded ? 'Collapse All' : 'Expand All'}
              </button>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="px-4 sm:px-5 py-2 bg-neutral-50/60 border-b border-neutral-100 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 shrink-0">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[140px]">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search questions or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* Filter mode chips */}
            <div className="flex items-center gap-1 shrink-0 overflow-x-auto py-0.5 max-w-full">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors shrink-0 whitespace-nowrap cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-600 hover:bg-neutral-200/60'
                }`}
              >
                All ({assessment.questions.length})
              </button>
              <button
                onClick={() => setFilterMode('answered')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors shrink-0 whitespace-nowrap cursor-pointer ${
                  filterMode === 'answered'
                    ? 'bg-emerald-700 text-white'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                Correct ({answeredCount})
              </button>
              <button
                onClick={() => setFilterMode('partial')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors shrink-0 whitespace-nowrap cursor-pointer ${
                  filterMode === 'partial'
                    ? 'bg-amber-700 text-white'
                    : 'text-amber-700 hover:bg-amber-50'
                }`}
              >
                Partial ({partialCount})
              </button>
              <button
                onClick={() => setFilterMode('incorrect')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors shrink-0 whitespace-nowrap cursor-pointer ${
                  filterMode === 'incorrect'
                    ? 'bg-rose-700 text-white'
                    : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                Incorrect ({incorrectCount})
              </button>
              <button
                onClick={() => setFilterMode('unanswered')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors shrink-0 whitespace-nowrap cursor-pointer ${
                  filterMode === 'unanswered'
                    ? 'bg-neutral-700 text-white'
                    : 'text-neutral-600 hover:bg-neutral-200/60'
                }`}
              >
                Blank ({unansweredCount})
              </button>
            </div>
          </div>

          {/* Vertically Scrollable Questions List */}
          <div
            id="questions-scroll-list"
            className="flex-1 overflow-y-auto p-4 space-y-3"
          >
            {filteredQuestions.length === 0 ? (
              <div className="text-center py-12 text-neutral-400 text-xs">
                No questions found matching your filter.
              </div>
            ) : (
              filteredQuestions.map((q) => {
                const isSelected = selectedQuestionId === q.id;
                const isExpanded = expandedIds.has(q.id);
                const spansMulti =
                  q.answerRegion?.spansMultiplePages ||
                  Boolean(q.answerRegion?.additionalRegions?.length);

                return (
                  <div
                    key={q.id}
                    id={`question-card-${q.id}`}
                    ref={isSelected ? selectedCardRef : null}
                    onClick={() => handleSelectQuestion(q.id)}
                    className={`rounded-2xl transition-all duration-200 cursor-pointer overflow-hidden ${
                      isSelected
                        ? 'border-2 border-orange-500 bg-white shadow-sm ring-2 ring-orange-500/10'
                        : 'border border-neutral-200/90 bg-white hover:border-neutral-300 hover:bg-neutral-50/40 shadow-2xs'
                    }`}
                  >
                    {/* Main Card Summary Row */}
                    <div className="p-4 flex items-start gap-3.5">
                      {/* Left: Question Number Circle / Sub-part Pill */}
                      <div className="shrink-0 pt-0.5">
                        {q.subPart ? (
                          /* Sub-part split pill (e.g. 11 a.) */
                          <div
                            className={`flex flex-col items-center justify-center rounded-xl px-2 py-1 text-xs font-bold ${
                              isSelected
                                ? 'bg-orange-500 text-white shadow-xs'
                                : 'bg-neutral-800 text-white'
                            }`}
                          >
                            <span className="text-[10px] leading-tight opacity-90">{q.mainNumber}</span>
                            <span className="text-xs leading-tight font-extrabold">{q.subPart}.</span>
                          </div>
                        ) : (
                          /* Standard single circle number */
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold shadow-2xs transition-colors ${
                              isSelected
                                ? 'bg-orange-500 text-white ring-2 ring-orange-400/40'
                                : 'bg-neutral-800 text-white'
                            }`}
                          >
                            {q.number}
                          </div>
                        )}
                      </div>

                      {/* Middle: Question text & metadata tags */}
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium leading-snug ${
                            isSelected ? 'text-neutral-900 font-semibold' : 'text-neutral-800'
                          }`}
                        >
                          {q.text}
                        </p>

                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {/* Multi-page answer tag */}
                          {spansMulti && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                              <Layers className="w-2.5 h-2.5" />
                              <span>Multi-Page Answer</span>
                            </span>
                          )}

                          {/* Out of order tag */}
                          {q.isOutOfOrder && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                              Attempted Out of Order
                            </span>
                          )}

                          {/* Section tag */}
                          {q.section && (
                            <span className="text-[10px] text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded">
                              {q.section}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Marks Pill and Accordion Chevron */}
                      <div className="flex items-center gap-2 shrink-0 pt-0.5">
                        {/* Marks badge */}
                        <div
                          className={`px-2.5 py-1 rounded-full text-xs font-extrabold shadow-2xs ${
                            q.status === 'incorrect'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : q.status === 'unanswered'
                              ? 'bg-neutral-100 text-neutral-600 border border-neutral-300'
                              : q.marksAwarded === q.maxMarks
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {q.marksAwarded !== undefined ? `${q.marksAwarded}/${q.maxMarks}` : `${q.maxMarks} Marks`}
                        </div>

                        {/* Chevron */}
                        <button
                          onClick={(e) => handleToggleExpand(q.id, e)}
                          className="p-1 text-neutral-400 hover:text-neutral-700 rounded transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Detail Panel (AI Feedback & Breakdown) */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-neutral-100 flex flex-col gap-3.5 bg-neutral-50/50">
                        {/* AI Feedback Section (Matching Figma Screenshot) */}
                        <div className="p-3.5 bg-white border border-neutral-200/80 rounded-xl shadow-2xs flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                                <span>Reason</span>
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                  q.status === 'answered'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : q.status === 'partial'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : q.status === 'incorrect'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : q.status === 'unanswered'
                                    ? 'bg-neutral-100 text-neutral-600 border border-neutral-300'
                                    : 'bg-sky-50 text-sky-700 border border-sky-200'
                                }`}
                              >
                                {q.status === 'answered'
                                  ? 'Correct'
                                  : q.status === 'partial'
                                  ? 'Partial'
                                  : q.status === 'incorrect'
                                  ? 'Incorrect'
                                  : q.status === 'unanswered'
                                  ? 'Left blank'
                                  : 'Needs review'}
                              </span>
                            </div>

                            {q.answerRegion && (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectQuestion(q.id);
                                    if (q.answerRegion?.page) {
                                      setCurrentPage(q.answerRegion.page);
                                    }
                                  }}
                                  className={`text-[11px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded transition-colors cursor-pointer ${
                                    currentPage === q.answerRegion.page && selectedQuestionId === q.id
                                      ? 'bg-orange-100 text-orange-800 border border-orange-200'
                                      : 'text-orange-600 hover:text-orange-700 hover:bg-orange-50'
                                  }`}
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>View Page {q.answerRegion.page}</span>
                                </button>
                                {q.answerRegion.additionalRegions?.map((addl, aIdx) => (
                                  <button
                                    key={aIdx}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelectQuestion(q.id);
                                      if (addl.page) {
                                        setCurrentPage(addl.page);
                                      }
                                    }}
                                    className={`text-[11px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded transition-colors cursor-pointer ${
                                      currentPage === addl.page && selectedQuestionId === q.id
                                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                        : 'text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50'
                                    }`}
                                  >
                                    <Layers className="w-2.5 h-2.5" />
                                    <span>Cont. Page {addl.page}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <p className="text-xs text-neutral-700 leading-relaxed">
                            {q.aiFeedback}
                          </p>

                          {q.studentAnswerText && (
                            <div className="mt-1 pt-2 border-t border-neutral-100">
                              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                                Detected Student Answer:
                              </span>
                              <p className="text-xs text-neutral-700 leading-relaxed mt-1 font-sans">
                                {q.studentAnswerText}
                              </p>
                            </div>
                          )}

                          {/* Key concepts */}
                          {q.keyConcepts && q.keyConcepts.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1 pt-2 border-t border-neutral-100">
                              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                                Key Terms:
                              </span>
                              {q.keyConcepts.map((kc, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded-md text-[10px] font-medium"
                                >
                                  {kc}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Suggested Master Solution */}
                        {q.suggestedSolution && (
                          <div className="p-3 bg-blue-50/50 border border-blue-200/60 rounded-xl text-xs">
                            <span className="font-bold text-blue-900 block mb-1 flex items-center gap-1">
                              <BookOpen className="w-3 h-3 text-blue-700" />
                              <span>Correct Answer / Marking Scheme:</span>
                            </span>
                            <p className="text-blue-950/80 leading-relaxed font-sans">
                              {q.suggestedSolution}
                            </p>
                          </div>
                        )}

                        {/* Criteria Breakdown if available */}
                        {q.criteriaBreakdown && q.criteriaBreakdown.length > 0 && (
                          <div className="p-3 bg-white border border-neutral-200/70 rounded-xl shadow-2xs">
                            <span className="text-[11px] font-bold text-neutral-700 block mb-1.5">
                              Grading Criteria:
                            </span>
                            <div className="space-y-1">
                              {q.criteriaBreakdown.map((cb, cIdx) => (
                                <div
                                  key={cIdx}
                                  className="flex items-center justify-between text-xs text-neutral-600"
                                >
                                  <span>{cb.criterion}</span>
                                  <span className="font-semibold text-neutral-800">
                                    {cb.marks}/{cb.maxMarks}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Teacher Manual Score Adjuster */}
                        <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-neutral-200/80 text-xs shrink-0">
                          <span className="font-medium text-neutral-700 flex items-center gap-1.5 shrink-0">
                            <Edit3 className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                            <span>Teacher Score Override:</span>
                          </span>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleUpdateMarks(q.id, (q.marksAwarded || 0) - 1)}
                              disabled={(q.marksAwarded || 0) <= 0}
                              className="w-7 h-7 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold flex items-center justify-center disabled:opacity-30 cursor-pointer shrink-0 transition-colors"
                            >
                              -
                            </button>
                            <span className="font-bold text-sm text-neutral-900 w-7 text-center font-mono shrink-0">
                              {q.marksAwarded}
                            </span>
                            <button
                              onClick={() => handleUpdateMarks(q.id, (q.marksAwarded || 0) + 1)}
                              disabled={(q.marksAwarded || 0) >= q.maxMarks}
                              className="w-7 h-7 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold flex items-center justify-center disabled:opacity-30 cursor-pointer shrink-0 transition-colors"
                            >
                              +
                            </button>
                            <span className="text-neutral-400 font-medium ml-1 shrink-0">/ {q.maxMarks}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ================= RIGHT COLUMN: ANSWER SHEET VIEWER ================= */}
        <div
          id="right-sheet-pane"
          className="flex-1 bg-neutral-200/70 flex flex-col overflow-hidden h-full relative"
        >
          {/* Answer Sheet Top Toolbar */}
          <div className="h-14 px-4 sm:px-6 bg-white border-b border-neutral-200/80 flex items-center justify-between shrink-0 shadow-2xs">
            {/* Title */}
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-orange-600 shrink-0" />
              <h3 className="text-xs sm:text-sm font-extrabold text-neutral-900 truncate">
                Answer Sheet
              </h3>
              <span className="text-xs text-neutral-500 hidden md:inline truncate">
                ({assessment.answerSheetFile.name})
              </span>
            </div>

            {/* Middle: Page Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2 bg-neutral-100 px-2 py-1 rounded-xl border border-neutral-200 shrink-0">
              <button
                id="btn-page-prev"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                title="Previous Page"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-700 hover:bg-white disabled:opacity-30 transition-colors cursor-pointer shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-bold text-neutral-800 px-1 sm:px-2 shrink-0 whitespace-nowrap">
                Page {currentPage} of {assessment.pages.length}
              </span>

              <button
                id="btn-page-next"
                onClick={() => setCurrentPage((p) => Math.min(assessment.pages.length, p + 1))}
                disabled={currentPage >= assessment.pages.length}
                title="Next Page"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-700 hover:bg-white disabled:opacity-30 transition-colors cursor-pointer shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Right: Zoom & Highlight Toggles */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Highlight toggle */}
              <button
                id="btn-toggle-highlights"
                onClick={() => setHighlightEnabled((v) => !v)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                  highlightEnabled
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                }`}
                title="Toggle Answer Region Highlights"
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Highlights</span>
              </button>

              {/* Zoom Controls */}
              <div className="flex items-center bg-neutral-100 rounded-lg p-0.5 border border-neutral-200 shrink-0">
                <button
                  id="btn-zoom-out"
                  onClick={() => setZoomLevel((z) => Math.max(60, z - 15))}
                  className="p-1 text-neutral-600 hover:text-neutral-900 rounded hover:bg-white transition-colors cursor-pointer shrink-0"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-bold text-neutral-700 px-1.5 min-w-[38px] text-center font-mono shrink-0">
                  {zoomLevel}%
                </span>
                <button
                  id="btn-zoom-in"
                  onClick={() => setZoomLevel((z) => Math.min(160, z + 15))}
                  className="p-1 text-neutral-600 hover:text-neutral-900 rounded hover:bg-white transition-colors cursor-pointer shrink-0"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Document Canvas Scrollport */}
          <div
            id="sheet-canvas-scrollport"
            className="flex-1 overflow-auto p-6 flex justify-center items-start"
          >
            <HandwrittenSheetRenderer
              assessment={assessment}
              currentPage={currentPage}
              selectedQuestionId={selectedQuestionId}
              onSelectQuestion={handleSelectQuestion}
              onNavigatePage={setCurrentPage}
              scale={zoomLevel}
              highlightEnabled={highlightEnabled}
            />
          </div>
        </div>
      </div>

      {/* ================= GRADING REPORT MODAL ================= */}
      {showReportModal && mounted && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="grading-report-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowReportModal(false);
          }}
        >
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-neutral-200 overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
              <div>
                <h3 id="grading-report-title" className="text-base font-extrabold text-neutral-900">Grading Report</h3>
                <p className="text-xs text-neutral-500 mt-0.5">{assessment.studentName} · {assessment.title}</p>
              </div>
              <button type="button" onClick={() => setShowReportModal(false)} className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100 transition-colors" aria-label="Close grading report">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Final score</p>
                  <p className="text-2xl font-extrabold text-emerald-800 mt-1">{totalAwarded}/{totalMax}</p>
                  <p className="text-xs text-emerald-700 mt-1">{scorePercentage}% achieved</p>
                </div>
                <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700">Attempted</p>
                  <p className="text-2xl font-extrabold text-blue-800 mt-1">{answeredCount}</p>
                  <p className="text-xs text-blue-700 mt-1">of {assessment.questions.length} questions</p>
                </div>
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-rose-700">Unanswered</p>
                  <p className="text-2xl font-extrabold text-rose-800 mt-1">{unansweredCount}</p>
                  <p className="text-xs text-rose-700 mt-1">needs attention</p>
                </div>
              </div>

              <div className="border border-neutral-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-200 text-xs font-bold text-neutral-700">Question-by-question scoring</div>
                <div className="divide-y divide-neutral-100">
                  {assessment.questions.map((question) => (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() => {
                        setShowReportModal(false);
                        handleSelectQuestion(question.id);
                      }}
                      className="w-full px-4 py-3 text-left flex items-start gap-3 hover:bg-neutral-50 transition-colors"
                    >
                      <span className="w-7 h-7 rounded-full bg-neutral-800 text-white text-xs font-bold flex items-center justify-center shrink-0">{question.number}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-medium text-neutral-700 truncate">{question.text}</span>
                        <span className="block text-[11px] text-neutral-500 mt-1 line-clamp-2">{question.aiFeedback}</span>
                      </span>
                      <span className="text-xs font-extrabold text-neutral-900 shrink-0">{question.marksAwarded}/{question.maxMarks}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ================= OCR QUESTION PAPER INSPECTION MODAL ================= */}
      {showOcrModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-neutral-200 overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center">
                  <ScanText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-neutral-900 flex items-center gap-2">
                    <span>Question Paper OCR & Structural Analysis</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                      {assessment.ocrResult?.confidenceScore || 99.4}% Confidence
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Engine: {assessment.ocrResult?.ocrEngine || 'Vision OCR + Layout Analyzer'} • Sub-parts parsed separately
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyOcrJson}
                  className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold text-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Copy Structured OCR JSON"
                >
                  {copiedOcr ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedOcr ? 'Copied!' : 'Copy JSON'}</span>
                </button>
                <button
                  onClick={() => setShowOcrModal(false)}
                  className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content with Tabs or Sections */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Structured Extracted Questions List */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                    Identified Questions with Original Numbering & Sub-Parts ({assessment.ocrResult?.extractedQuestions.length || assessment.questions.length})
                  </h4>
                  <span className="text-xs text-neutral-400">
                    Sub-parts (e.g. 11 (a), 11 (b)) treated as distinct entries
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(assessment.ocrResult?.extractedQuestions || []).map((ocrQ) => (
                    <div
                      key={ocrQ.id}
                      className="p-3.5 bg-neutral-50/70 border border-neutral-200 rounded-xl flex flex-col justify-between gap-2 hover:border-neutral-300 transition-colors"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="px-2 py-0.5 bg-neutral-800 text-white rounded-md text-xs font-extrabold shrink-0 font-mono">
                          {ocrQ.number}
                        </span>
                        <p className="text-xs text-neutral-800 font-medium leading-relaxed">
                          {ocrQ.text}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-neutral-200/60 text-[11px]">
                        <span className="text-neutral-500 font-semibold">{ocrQ.section || 'General'}</span>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800 font-bold">
                            {ocrQ.maxMarks} Marks
                          </span>
                          <span className="text-emerald-700 font-mono font-bold">
                            {ocrQ.confidence || 99.5}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Verbatim Raw OCR Text Stream */}
              <div>
                <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
                  Verbatim Question Paper OCR Raw Text Stream
                </h4>
                <pre className="p-4 bg-neutral-900 text-neutral-100 rounded-xl text-xs font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto border border-neutral-800">
                  {assessment.ocrResult?.rawOcrText || 'No raw OCR text available.'}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-neutral-200 bg-neutral-50 flex items-center justify-end">
              <button
                onClick={() => setShowOcrModal(false)}
                className="px-4 py-2 bg-neutral-900 text-white text-xs font-semibold rounded-xl hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
