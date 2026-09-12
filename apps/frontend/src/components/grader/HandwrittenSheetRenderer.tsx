import React, { useRef, useEffect, useState } from 'react';
import { AssessmentData, QuestionItem } from './graderTypes';
import { Layers, Sparkles, AlertTriangle } from 'lucide-react';

interface HandwrittenSheetRendererProps {
  assessment: AssessmentData;
  currentPage: number;
  selectedQuestionId: string | null;
  onSelectQuestion: (questionId: string) => void;
  onNavigatePage?: (page: number) => void;
  scale: number;
  highlightEnabled: boolean;
}

export const HandwrittenSheetRenderer: React.FC<HandwrittenSheetRendererProps> = ({
  assessment,
  currentPage,
  selectedQuestionId,
  onSelectQuestion,
  onNavigatePage,
  scale,
  highlightEnabled,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeAnswerBlockRef = useRef<HTMLDivElement>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  // Determine current page object
  const currentPageData = assessment.pages.find((p) => p.pageNumber === currentPage);
  const hasCustomPageImage = Boolean(currentPageData?.imageUrl);
  const isPdfPreview = /\.pdf(?:$|[?#])/i.test(currentPageData?.imageUrl || '');

  useEffect(() => {
    setPreviewFailed(false);
  }, [currentPageData?.imageUrl, currentPage]);

  // Smoothly scroll to the active answer block on the sheet when question selection or page changes
  useEffect(() => {
    if (activeAnswerBlockRef.current) {
      activeAnswerBlockRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [selectedQuestionId, currentPage]);

  const selectedQuestion = assessment.questions.find((q) => q.id === selectedQuestionId);

  // Check if selected question spans multiple pages
  const selectedSpansMultiple =
    selectedQuestion?.answerRegion?.spansMultiplePages ||
    Boolean(selectedQuestion?.answerRegion?.additionalRegions?.length);

  // Collect all page numbers for selected question
  const selectedQuestionPages: number[] = [];
  if (selectedQuestion?.answerRegion?.page) {
    selectedQuestionPages.push(selectedQuestion.answerRegion.page);
  }
  if (selectedQuestion?.answerRegion?.additionalRegions) {
    selectedQuestion.answerRegion.additionalRegions.forEach((reg) => {
      if (!selectedQuestionPages.includes(reg.page)) {
        selectedQuestionPages.push(reg.page);
      }
    });
  }

  // Questions allocated to this page for notebook canvas mode
  const questionsOnThisPage = assessment.questions.filter((q, idx) => {
    if (q.answerRegion?.page) {
      return q.answerRegion.page === currentPage;
    }
    const derivedPage = Math.floor(idx / 3) + 1;
    return derivedPage === currentPage;
  });

  // Additional continuation segments on this page
  const continuationSegmentsOnThisPage = assessment.questions
    .map((q) => {
      const matchingRegion = q.answerRegion?.additionalRegions?.find((r) => r.page === currentPage);
      if (matchingRegion) {
        return { question: q, region: matchingRegion };
      }
      return null;
    })
    .filter(Boolean) as { question: QuestionItem; region: any }[];

  // Unmatched answers on this page
  const unmatchedOnThisPage = (assessment.unmatchedAnswers || []).filter(
    (u) => u.page === currentPage || (!u.page && currentPage === 1)
  );

  // Collect all bounding box regions on this page (primary + additional continuation regions)
  const pageRegions: Array<{
    question: QuestionItem;
    region: { topPercent: number; leftPercent: number; widthPercent: number; heightPercent: number; label?: string };
    isContinuation: boolean;
    key: string;
  }> = [];

  assessment.questions.forEach((q) => {
    // Exclude Multiple Choice Questions (MCQs) - only highlight long / descriptive answers
    const isMcq =
      q.questionType === 'mcq' ||
      (q.maxMarks <= 1 && q.suggestedSolution && /^[A-E]$/i.test(q.suggestedSolution.trim())) ||
      (q.maxMarks <= 1 && q.studentAnswerText && /^[A-E]$/i.test(q.studentAnswerText.trim())) ||
      (q.maxMarks <= 1 && q.section && /multiple\s*choice|mcq/i.test(q.section)) ||
      /\b(multiple choice|mcq|choose the correct|select one)\b/i.test(q.text || '');
    if (isMcq) return;

    if (q.answerRegion && q.answerRegion.page === currentPage) {
      pageRegions.push({
        question: q,
        region: q.answerRegion,
        isContinuation: false,
        key: `primary-${q.id}`,
      });
    }
    if (q.answerRegion?.additionalRegions) {
      q.answerRegion.additionalRegions.forEach((addl, idx) => {
        if (addl.page === currentPage) {
          pageRegions.push({
            question: q,
            region: addl,
            isContinuation: true,
            key: `addl-${q.id}-${idx}`,
          });
        }
      });
    }
  });

  // Helper component to render an interactive question answer container in notebook mode
  const AnswerBlock: React.FC<{
    key?: React.Key;
    questionId: string;
    badgeLabel: string;
    marksAwarded?: number;
    maxMarks?: number;
    isContinuation?: boolean;
    status?: 'answered' | 'unanswered' | 'partial' | 'incorrect' | 'unmatched';
    children: React.ReactNode;
  }> = ({
    questionId,
    badgeLabel,
    marksAwarded,
    maxMarks,
    isContinuation = false,
    status,
    children,
  }) => {
    const isSelected = selectedQuestionId === questionId;

    return (
      <div
        id={`answer-box-${questionId}${isContinuation ? '-cont' : ''}`}
        ref={isSelected ? activeAnswerBlockRef : null}
        onClick={(e) => {
          e.stopPropagation();
          onSelectQuestion(questionId);
        }}
        className={`relative my-4 p-3.5 rounded-2xl transition-all duration-200 cursor-pointer select-text ${
          highlightEnabled
            ? isSelected
              ? 'border-2 border-emerald-500 bg-emerald-500/10 shadow-lg ring-4 ring-emerald-500/20 animate-box-glow z-10'
              : isContinuation
              ? 'border border-dashed border-indigo-400/80 bg-indigo-50/20 hover:border-indigo-500 hover:bg-indigo-50/40'
              : status === 'incorrect'
              ? 'border border-dashed border-rose-400/80 bg-rose-50/20 hover:border-rose-500 hover:bg-rose-50/35'
              : status === 'unanswered'
              ? 'border border-dashed border-neutral-300 bg-neutral-100/40 opacity-70 hover:opacity-100'
              : status === 'partial'
              ? 'border border-dashed border-amber-400/80 bg-amber-50/20 hover:border-amber-500 hover:bg-amber-50/35'
              : 'border border-dashed border-emerald-400/70 bg-emerald-50/15 hover:border-emerald-500 hover:bg-emerald-50/35'
            : 'border border-transparent hover:bg-black/[0.02]'
        }`}
      >
        {/* Floating Top Badge */}
        {highlightEnabled && (
          <div
            className={`absolute -top-3 left-3 px-2.5 py-0.5 rounded-md text-[11px] font-extrabold uppercase tracking-wide flex items-center gap-1.5 shadow-xs select-none pointer-events-none z-20 ${
              isSelected
                ? 'bg-emerald-600 text-white ring-1 ring-emerald-700'
                : isContinuation
                ? 'bg-indigo-600 text-white'
                : status === 'incorrect'
                ? 'bg-rose-600 text-white'
                : status === 'unanswered'
                ? 'bg-neutral-500 text-white'
                : status === 'partial'
                ? 'bg-amber-600 text-white'
                : 'bg-emerald-600/90 text-white'
            }`}
          >
            {isSelected && <Sparkles className="w-3 h-3 text-amber-300 shrink-0" />}
            <span>{badgeLabel}</span>
            {marksAwarded !== undefined && maxMarks !== undefined && (
              <span className="bg-white/20 text-white px-1 py-0.2 rounded text-[10px] font-mono">
                {marksAwarded}/{maxMarks}
              </span>
            )}
          </div>
        )}

        {/* Answer Content */}
        <div className="pt-1 text-blue-950 font-handwriting">{children}</div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full transition-transform duration-150 origin-top flex flex-col items-center py-2 select-none"
      style={{
        transform: `scale(${scale / 100})`,
        transformOrigin: 'top center',
      }}
    >
      {/* Multi-page answer banner for selected question */}
      {selectedSpansMultiple && selectedQuestionPages.length > 1 && (
        <div className="w-full max-w-[700px] mb-3 p-2.5 rounded-xl bg-indigo-900 text-white shadow-sm border border-indigo-700 flex items-center justify-between font-sans text-xs animate-fadeIn">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="w-4 h-4 text-indigo-300 shrink-0" />
            <div className="truncate">
              <span className="font-bold">Multi-Page Answer ({selectedQuestion?.number}): </span>
              <span className="text-indigo-200 text-[11px] truncate">
                {selectedQuestion?.answerRegion?.continuationNote ||
                  `Spans across ${selectedQuestionPages.map((p) => `Page ${p}`).join(' & ')}`}
              </span>
            </div>
          </div>
          {onNavigatePage && (
            <div className="flex items-center gap-1.5 shrink-0 ml-3">
              {selectedQuestionPages.map((p) => (
                <button
                  key={p}
                  onClick={() => onNavigatePage(p)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    currentPage === p
                      ? 'bg-white text-indigo-950 shadow-xs ring-1 ring-indigo-300'
                      : 'bg-indigo-800 text-indigo-200 hover:bg-indigo-700 hover:text-white'
                  }`}
                >
                  {currentPage === p ? `Viewing Page ${p}` : `Go to Page ${p}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Answer Sheet Canvas Container */}
      <div
        id={`answer-sheet-page-${currentPage}`}
        className="relative w-full max-w-[700px] min-h-[880px] bg-[#faf8f5] shadow-xl rounded-sm border border-neutral-300 overflow-hidden font-handwriting text-neutral-800"
        style={{
          backgroundImage: hasCustomPageImage && !previewFailed
            ? undefined
            : `
            linear-gradient(90deg, transparent 58px, #f87171 58px, #f87171 60px, transparent 60px),
            linear-gradient(#e2e8f0 1px, transparent 1px)
          `,
          backgroundSize: hasCustomPageImage && !previewFailed ? undefined : '100% 100%, 100% 28px',
          lineHeight: '28px',
        }}
      >
        {/* Paper Header / Student Meta Strip */}
        <div className="pt-2.5 px-4 pb-1.5 border-b border-neutral-200/80 bg-amber-50/60 text-neutral-600 text-[11px] font-sans flex items-center justify-between z-10 relative">
          <div className="flex items-center gap-3">
            <span><strong>Name:</strong> {assessment.studentName || 'Student'}</span>
            <span><strong>Roll:</strong> {assessment.rollNumber || '01'}</span>
          </div>
          <div className="flex items-center gap-3">
            <span><strong>Subject:</strong> {assessment.subject || 'Assessment'}</span>
            <span className="font-bold text-neutral-900 bg-neutral-200/80 px-2 py-0.5 rounded text-[10px]">
              Page {currentPage} of {Math.max(assessment.pages.length, 1)}
            </span>
          </div>
        </div>

        {/* CUSTOM IMAGE MODE (If real document image was uploaded and loaded) */}
        {hasCustomPageImage && currentPageData?.imageUrl && !previewFailed ? (
          <div className="relative w-full bg-white overflow-hidden">
            {isPdfPreview ? (
              <iframe
                src={`${currentPageData.imageUrl}#page=${currentPage}&view=FitH`}
                title={`Submitted answer sheet, page ${currentPage}`}
                className="w-full h-[760px] border-0 block bg-white"
              />
            ) : (
              <img
                key={`${currentPageData.imageUrl}-${currentPage}`}
                src={currentPageData.imageUrl}
                alt={`Submitted answer sheet, page ${currentPage}`}
                className="w-full h-auto block select-none"
                loading="eager"
                crossOrigin="anonymous"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src.includes('/uploads/') && !target.src.includes(':3001')) {
                    target.src = target.src.replace(window.location.origin, 'http://localhost:3001');
                  } else if (target.src.includes(':3001/uploads/')) {
                    target.src = target.src.replace('http://localhost:3001', window.location.origin);
                  } else {
                    setPreviewFailed(true);
                  }
                }}
              />
            )}

            {/* Interactive Bounding Box Overlays */}
            {highlightEnabled &&
              pageRegions.map(({ question: q, region, isContinuation, key }) => {
                const isSelected = selectedQuestionId === q.id;
                const statusClasses = isContinuation
                  ? isSelected
                    ? 'border-2 border-indigo-500 bg-indigo-500/20 shadow-lg ring-4 ring-indigo-500/30 z-20'
                    : 'border border-dashed border-indigo-400/80 bg-indigo-500/5 hover:border-indigo-500 hover:bg-indigo-400/10 z-10'
                  : q.status === 'incorrect'
                  ? isSelected
                    ? 'border-2 border-rose-500 bg-rose-500/22 shadow-lg ring-4 ring-rose-500/30 z-20'
                    : 'border border-dashed border-rose-400/80 bg-rose-500/8 hover:border-rose-500 hover:bg-rose-400/15 z-10'
                  : q.status === 'unanswered'
                  ? isSelected
                    ? 'border-2 border-neutral-400 bg-neutral-500/16 shadow-lg ring-4 ring-neutral-400/25 z-20'
                    : 'border border-dashed border-neutral-300/70 bg-transparent hover:border-neutral-400 hover:bg-neutral-300/10 z-10'
                  : q.status === 'partial'
                  ? isSelected
                    ? 'border-2 border-amber-500 bg-amber-400/18 shadow-lg ring-4 ring-amber-500/25 z-20'
                    : 'border border-dashed border-amber-400/75 bg-amber-400/5 hover:border-amber-500 hover:bg-amber-400/12 z-10'
                  : q.status === 'unmatched'
                  ? isSelected
                    ? 'border-2 border-sky-500 bg-sky-400/16 shadow-lg ring-4 ring-sky-500/25 z-20'
                    : 'border border-dashed border-sky-300/75 bg-transparent hover:border-sky-500 hover:bg-sky-400/8 z-10'
                  : isSelected
                  ? 'border-2 border-emerald-500 bg-emerald-500/20 shadow-lg ring-4 ring-emerald-500/30 z-20'
                  : 'border border-dashed border-emerald-400/75 bg-emerald-400/5 hover:border-emerald-500 hover:bg-emerald-400/12 z-10';

                const badgeClasses = isContinuation
                  ? 'bg-indigo-600 text-white'
                  : q.status === 'incorrect'
                  ? 'bg-rose-600 text-white'
                  : q.status === 'unanswered'
                  ? 'bg-neutral-500 text-white'
                  : q.status === 'partial'
                  ? 'bg-amber-600 text-white'
                  : q.status === 'unmatched'
                  ? 'bg-sky-600 text-white'
                  : 'bg-emerald-600 text-white';

                return (
                  <div
                    key={key}
                    ref={isSelected ? activeAnswerBlockRef : null}
                    title={`${q.number}: ${q.aiFeedback}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Highlight answer for question ${q.number}${isContinuation ? ' continuation' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectQuestion(q.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectQuestion(q.id);
                      }
                    }}
                    style={{
                      top: `${Math.max(0, Math.min(98, region.topPercent))}%`,
                      left: `${Math.max(0, Math.min(98, region.leftPercent))}%`,
                      width: `${Math.max(2, Math.min(100 - region.leftPercent, region.widthPercent))}%`,
                      height: `${Math.max(1.2, Math.min(100 - region.topPercent, region.heightPercent))}%`,
                    }}
                    className={`absolute rounded-lg transition-all cursor-pointer ${statusClasses}`}
                  >
                    {/* Floating Top-Left Badge with Question & Prominent Marks */}
                    <div
                      className={`absolute -top-3.5 left-2 px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide flex items-center gap-1.5 shadow-md font-sans pointer-events-none z-30 ${badgeClasses}`}
                    >
                      <span>Answer {q.number || `Q${q.mainNumber}`}</span>
                      {isContinuation && <span className="opacity-90 font-medium">(Cont.)</span>}
                      <span className="bg-white/25 text-white px-1.5 py-0.2 rounded text-[10px] font-bold font-mono tracking-tight">
                        {q.marksAwarded !== undefined ? `${q.marksAwarded} / ${q.maxMarks} Marks` : `${q.maxMarks} Marks`}
                      </span>
                    </div>

                    {/* Top-Right Score Tag */}
                    <div
                      className={`absolute -top-3 right-2 px-2 py-0.5 rounded text-[9px] font-bold shadow-xs font-sans pointer-events-none z-30 ${
                        q.status === 'answered'
                          ? 'bg-emerald-700 text-white'
                          : q.status === 'partial'
                          ? 'bg-amber-700 text-white'
                          : q.status === 'incorrect'
                          ? 'bg-rose-700 text-white'
                          : 'bg-neutral-600 text-white'
                      }`}
                    >
                      {q.status === 'answered'
                        ? 'Full Marks'
                        : q.status === 'partial'
                        ? `Partial (${q.marksAwarded} M)`
                        : q.status === 'incorrect'
                        ? '0 Marks'
                        : 'Blank'}
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          /* HANDWRITTEN NOTEBOOK CANVAS FALLBACK MODE */
          <div className="p-6 sm:p-8 min-h-[760px]">
            {previewFailed && (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-sans flex items-center justify-between">
                <span>Displaying extracted handwritten notebook canvas mode.</span>
                {currentPageData?.imageUrl && (
                  <a
                    href={currentPageData.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-orange-700 hover:underline"
                  >
                    Open original file
                  </a>
                )}
              </div>
            )}

            {questionsOnThisPage.length === 0 && continuationSegmentsOnThisPage.length === 0 ? (
              <div className="py-24 text-center text-neutral-400 font-sans text-xs italic">
                Blank page — no answers recorded on Page {currentPage}.
              </div>
            ) : (
              <>
                {questionsOnThisPage.map((q) => (
                  <AnswerBlock
                    key={q.id}
                    questionId={q.id}
                    badgeLabel={`Answer ${q.number}`}
                    marksAwarded={q.marksAwarded}
                    maxMarks={q.maxMarks}
                    status={q.status}
                  >
                    <div className="text-sm leading-[28px] text-blue-950 font-handwriting select-text">
                      {q.studentAnswerText || (
                        <span className="text-neutral-400 italic font-sans text-xs">
                          [Unanswered / Left Blank]
                        </span>
                      )}
                    </div>
                  </AnswerBlock>
                ))}

                {continuationSegmentsOnThisPage.map(({ question: q, region }) => (
                  <AnswerBlock
                    key={`cont-${q.id}`}
                    questionId={q.id}
                    badgeLabel={`Answer ${q.number} (Continuation)`}
                    marksAwarded={q.marksAwarded}
                    maxMarks={q.maxMarks}
                    isContinuation={true}
                    status={q.status}
                  >
                    <div className="text-sm leading-[28px] text-indigo-950 font-handwriting select-text">
                      {region.segmentTitle || q.answerRegion?.continuationNote || (
                        <span className="italic">Continued response for Question {q.number}...</span>
                      )}
                    </div>
                  </AnswerBlock>
                ))}

                {unmatchedOnThisPage.map((u) => (
                  <div
                    key={u.id}
                    className="my-4 p-3.5 rounded-2xl border border-dashed border-sky-400 bg-sky-50/40 text-xs font-sans"
                  >
                    <div className="font-bold text-sky-900 flex items-center gap-1.5 mb-1">
                      <span>{u.label}</span>
                    </div>
                    <p className="text-sky-950 font-handwriting text-sm leading-[26px]">
                      {u.extractedText}
                    </p>
                    <p className="text-[11px] text-sky-700 mt-1 italic font-sans">
                      Note: {u.aiNote}
                    </p>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
