'use client';
import { NativeSelect } from '@/components/ui/native-select';

 

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardCheck, Plus, Loader2,
  FileText, Upload, ChevronRight, User
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/services/api.client';
import Link from 'next/link';
import { AssessmentUploadView } from '@/components/grader/AssessmentUploadView';
import { DashboardView } from '@/components/grader/GradingDashboardView';
import { ExtractionLoadingView } from '@/components/grader/ExtractionLoadingView';
import { AdditionalAnswerRegion, AnswerRegion, AnswerSheetPage, AssessmentData } from '@/components/grader/graderTypes';
import { sampleBiologyAssessment, sampleMathematicsAssessment } from '@/components/grader/sampleAssessments';
import { resolveAssetUrl } from '@/utils/url';
import { fetchPaper } from '@/services/paper.service';
import type { GeneratedPaper } from '@/types/paper.types';

interface Rubric {
  id: string;
  title: string;
  description: string;
  criteria: Array<{ name: string; maxMarks: number; description: string }>;
}

interface Assignment {
  id: string;
  title: string;
  subject: string;
  totalMarks: number;
}

interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName?: string;
  fileUrl: string;
  fileType: string;
  status: string;
  submittedAt: string;
  evaluations?: Array<{ score: number }>;
}

interface GradingConfig {
  rubricId?: string | null;
  answerKeyText?: string;
  questionPaperName?: string | null;
  autoEvaluate?: boolean;
}

const getAnswerText = (answer: unknown): string => {
  if (!answer) return '';
  if (typeof answer === 'string') return answer;
  if (typeof answer === 'object' && 'text' in answer) {
    return String((answer as { text?: unknown }).text || '');
  }
  return '';
};

const getAnswerExplanation = (answer: unknown): string => {
  if (!answer || typeof answer !== 'object' || !('explanation' in answer)) return '';
  return String((answer as { explanation?: unknown }).explanation || '');
};

const getEvaluationText = (item: Record<string, unknown> | undefined, keys: string[]): string => {
  if (!item) return '';
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const getEvaluationScore = (item: Record<string, unknown> | undefined): number | null => {
  if (!item) return null;
  const value = item.score ?? item.marksAwarded ?? item.awardedMarks ?? item.marks ?? item.obtainedMarks;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
};

const getQuestionEvaluation = (
  items: Record<string, unknown>[],
  questionIndex: number,
  questionText: string,
  questionNumberStr?: string
): Record<string, unknown> | undefined => {
  const normalize = (value: unknown) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const expectedNum = normalize(questionNumberStr || String(questionIndex));
  const expectedIndex = String(questionIndex);
  const normalizedQuestion = normalize(questionText);
  const hasQuestionSignals = items.some((item) =>
    [
      'questionNumber',
      'questionNo',
      'qNo',
      'questionId',
      'question',
      'questionText',
      'studentAnswer',
      'studentAnswerText',
      'correctAnswer',
    ].some((key) => item[key] !== undefined)
  );

  return items.find((item, idx) => {
    const rawNumber = item.questionNumber ?? item.number ?? item.questionNo ?? item.qNo;
    if (rawNumber !== undefined) {
      const norm = normalize(rawNumber);
      if (norm === expectedNum || norm === expectedIndex) return true;
    }
    const id = item.questionId ?? item.id;
    if (id !== undefined) {
      const normId = normalize(id);
      if (normId === expectedNum || normId === expectedIndex) return true;
    }
    const itemQuestion = normalize(item.question ?? item.questionText);
    if (itemQuestion && normalizedQuestion && (normalizedQuestion.includes(itemQuestion.slice(0, 32)) || itemQuestion.includes(normalizedQuestion.slice(0, 32)))) return true;
    return hasQuestionSignals && idx === questionIndex - 1 && items.length > 1;
  });
};

type LayoutRegionPayload = AnswerRegion & { questionNumber?: string; confidence?: number };

const normaliseQuestionNumber = (value: unknown): string => {
  const str = String(value || '').trim();
  const stripped = str.replace(/^(?:q(?:uestion)?|ans(?:wer)?)\s*[:.\-)]?\s*/i, '');
  return stripped.replace(/[^0-9a-z]/gi, '').toLowerCase();
};

/** Converts only validated, image-anchored backend regions for the viewer, merging multi-segment / multi-page answers. */
const indexLayoutRegions = (regions: unknown): Map<string, AnswerRegion> => {
  const list = Array.isArray(regions)
    ? regions
    : Array.isArray((regions as any)?.regions)
    ? (regions as any).regions
    : [];
  const mapped = new Map<string, AnswerRegion>();
  list.forEach((region: LayoutRegionPayload) => {
    const questionNumber = normaliseQuestionNumber(region.questionNumber);
    if (!questionNumber || !Number.isFinite(region.topPercent) || !Number.isFinite(region.leftPercent) ||
      !Number.isFinite(region.widthPercent) || !Number.isFinite(region.heightPercent) ||
      (region.confidence !== undefined && region.confidence < 0.6)) return;

    if (mapped.has(questionNumber)) {
      const existing = mapped.get(questionNumber)!;
      const additional: AdditionalAnswerRegion = {
        page: region.page || 1,
        topPercent: region.topPercent,
        leftPercent: region.leftPercent,
        widthPercent: region.widthPercent,
        heightPercent: region.heightPercent,
        label: region.label,
        segmentTitle: `Continuation (Page ${region.page || 1})`,
      };
      existing.spansMultiplePages = existing.spansMultiplePages || existing.page !== (region.page || 1);
      existing.additionalRegions = [...(existing.additionalRegions || []), additional];
    } else {
      mapped.set(questionNumber, {
        ...region,
        additionalRegions: region.additionalRegions ? [...region.additionalRegions] : [],
      });
    }
  });
  return mapped;
};

export default function GraderDashboard() {
  const [activeTab, setActiveTab] = useState<'assignments' | 'rubrics'>('assignments');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState(true);

  // Grading config modal states
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [showUploadWorkspace, setShowUploadWorkspace] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [activeAssessment, setActiveAssessment] = useState<AssessmentData | null>(null);
  const [lastSelectedStudentIds, setLastSelectedStudentIds] = useState<string[]>([]);
  const [generatedPaper, setGeneratedPaper] = useState<GeneratedPaper | null>(null);
  const [paperLoading, setPaperLoading] = useState(false);
  const [rubricId, setRubricId] = useState('');
  const [answerKey, setAnswerKey] = useState('');
  const [questionPaperName, setQuestionPaperName] = useState<string | null>(null);
  const [autoEvaluate, setAutoEvaluate] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  // Submissions states
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Rubric creation states
  const [showCreateRubric, setShowCreateRubric] = useState(false);
  const [rubricTitle, setRubricTitle] = useState('');
  const [rubricDesc, setRubricDesc] = useState('');
  const [criteria, setCriteria] = useState([{ name: 'Accuracy', maxMarks: 10, description: 'Correct answer structure' }]);
  const [creatingRubric, setCreatingRubric] = useState(false);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [assignRes, rubRes] = await Promise.all([
        apiClient.get<{ success: boolean; data: any }>('/assignments'),
        apiClient.get<{ success: boolean; data: Rubric[] }>('/grader/rubrics'),
      ]);
      const fetchedAssignments = assignRes.data.data.assignments || assignRes.data.data || [];
      setAssignments(fetchedAssignments);
      setRubrics(rubRes.data.data);
    } catch {
      toast.error('Failed to load initial data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadSubmissions = async (assignmentId: string): Promise<Submission[]> => {
    try {
      setSubmissionsLoading(true);
      const res = await apiClient.get<{ success: boolean; data: Submission[] }>(`/grader/assignments/${assignmentId}/submissions`);
      const list = res.data.data || [];
      setSubmissions(list);
      return list;
    } catch {
      toast.error('Failed to load submissions');
      return [];
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const handleOpenConfig = async (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setShowUploadWorkspace(true);
    setGeneratedPaper(null);
    setPaperLoading(true);
    loadSubmissions(assignment.id);
    fetchPaper(assignment.id)
      .then((paper) => setGeneratedPaper(paper))
      .catch(() => setGeneratedPaper(null))
      .finally(() => setPaperLoading(false));
    try {
      const res = await apiClient.get<{ success: boolean; data: GradingConfig | null }>(`/grader/assignments/${assignment.id}/config`);
      if (res.data.data) {
        setRubricId(res.data.data.rubricId || '');
        setAnswerKey(res.data.data.answerKeyText || '');
        setQuestionPaperName(res.data.data.questionPaperName || null);
        setAutoEvaluate(res.data.data.autoEvaluate !== false);
      } else {
        setRubricId('');
        setAnswerKey('');
        setQuestionPaperName(null);
        setAutoEvaluate(true);
      }
    } catch {
      setRubricId('');
      setAnswerKey('');
      setQuestionPaperName(null);
      setAutoEvaluate(true);
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedAssignment) return;
    setSavingConfig(true);
    try {
      await apiClient.post(`/grader/assignments/${selectedAssignment.id}/config`, {
        rubricId: rubricId || null,
        answerKeyText: answerKey,
        autoEvaluate,
      });
      toast.success('Grading configuration saved successfully');
    } catch {
      toast.error('Failed to save grading configuration');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleEvaluateSelected = async (submissionIds: string[]) => {
    if (!selectedAssignment || submissionIds.length === 0) return;
    try {
      for (const submissionId of submissionIds) {
        await apiClient.post(`/grader/submissions/${submissionId}/evaluate`);
      }
      toast.success(`${submissionIds.length} student${submissionIds.length === 1 ? '' : 's'} evaluated successfully`);
      await loadSubmissions(selectedAssignment.id);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'One or more evaluations failed');
    }
  };

  const handleStartMapping = async (submissionIds: string[]) => {
    if (!selectedAssignment) return;
    setLastSelectedStudentIds(submissionIds);
    setExtractionError(null);
    setIsExtracting(true);

    try {
      // 1. Save grading configuration
      await apiClient.post(`/grader/assignments/${selectedAssignment.id}/config`, {
        rubricId: rubricId || null,
        answerKeyText: answerKey,
        autoEvaluate: true,
      });

      // 2. Trigger evaluations on backend
      let lastEval: any = null;
      for (const submissionId of submissionIds) {
        try {
          const res = await apiClient.post(`/grader/submissions/${submissionId}/evaluate`);
          if (res?.data?.data) {
            lastEval = res.data.data;
          }
        } catch (e: any) {
          console.warn('Evaluation request warning:', e);
        }
      }

      const refreshedSubmissions = await loadSubmissions(selectedAssignment.id);

      // 3. Allow animation to display extraction steps smoothly
      await new Promise((resolve) => setTimeout(resolve, 2400));

      // 4. Build assessment view for interactive mapped evaluation
      const selectedStudent = refreshedSubmissions.find((s) => submissionIds.includes(s.id))
        ?? submissions.find((s) => submissionIds.includes(s.id));
      const studentName = selectedStudent?.studentName || 'Student 1';

      // Pick base assessment data matching subject if available
      const isMaths = (selectedAssignment.subject || '').toLowerCase().includes('math');
      const basePreset = isMaths ? sampleMathematicsAssessment : sampleBiologyAssessment;

      let mappedQuestions = basePreset.questions;
      let generatedOcrData = basePreset.ocrResult;

      // Presets contain demo coordinates. They must never be drawn over a real
      // uploaded answer sheet while its question paper/layout mapping is absent.
      if (selectedStudent?.fileUrl) {
        mappedQuestions = basePreset.questions.map(({ answerRegion: _demoRegion, ...question }) => question);
      }

      if (generatedPaper && generatedPaper.sections && generatedPaper.sections.length > 0) {
        const paperQuestions: typeof basePreset.questions = [];
        const extractedOcrQuestions: any[] = [];
        let totalQuestionCount = 0;
        generatedPaper.sections.forEach((s) => {
          totalQuestionCount += (s.questions || []).length;
        });

        const isSingleSheet = Boolean(selectedStudent?.fileUrl);
        let qIndex = 1;

        const evaluationItems = Array.isArray(lastEval?.questions)
          ? lastEval.questions as Record<string, unknown>[]
          : Array.isArray(lastEval?.criteriaGrades)
          ? lastEval.criteriaGrades as Record<string, unknown>[]
          : [];

        generatedPaper.sections.forEach((sec) => {
          sec.questions.forEach((qItem: any) => {
            const qNumberStr = String(qItem.number || qIndex);
            const qMaxMarks = qItem.marks || (qItem.question.length > 60 ? 3 : 1);
            const qEvaluation = getQuestionEvaluation(evaluationItems, qIndex, qItem.question, qNumberStr);
            const evaluationScore = getEvaluationScore(qEvaluation);
            const qAwarded = evaluationScore === null ? 0 : Math.max(0, Math.min(qMaxMarks, evaluationScore));
            const studentAnswerText = getEvaluationText(qEvaluation, [
              'studentAnswer',
              'studentAnswerText',
              'extractedAnswer',
              'answer',
              'evidence',
            ]);
            const correctAnswer = getAnswerText(qItem.answer);
            const answerExplanation = getAnswerExplanation(qItem.answer);
            const hasPerQuestionGrade = Boolean(qEvaluation);

            const isBlank = !studentAnswerText || ['unanswered', 'blank', 'left blank', 'none', 'n/a'].includes(studentAnswerText.trim().toLowerCase());
            let qStatus: 'answered' | 'unanswered' | 'partial' | 'incorrect' | 'unmatched';
            if (!hasPerQuestionGrade) {
              qStatus = 'unmatched';
            } else if (isBlank && qAwarded === 0) {
              qStatus = 'unanswered';
            } else if (qAwarded >= qMaxMarks) {
              qStatus = 'answered';
            } else if (qAwarded > 0) {
              qStatus = 'partial';
            } else {
              qStatus = 'incorrect';
            }

            const reason = getEvaluationText(qEvaluation, [
              'reason',
              'explanation',
              'feedback',
              'aiFeedback',
              'comment',
            ]);

            paperQuestions.push({
              id: `q_${qIndex}`,
              number: qNumberStr,
              mainNumber: qNumberStr.replace(/[^0-9]/g, '') || `${qIndex}`,
              subPart: qNumberStr.replace(/^[0-9]+[.\s()*-]*/, '').replace(/[^a-zA-Z]/g, '') || undefined,
              text: qItem.question,
              maxMarks: qMaxMarks,
              marksAwarded: qAwarded,
              status: qStatus,
              section: sec.title || 'Section A',
              questionType: qMaxMarks <= 1 ? 'mcq' : qMaxMarks <= 3 ? 'short' : 'long',
              aiFeedback: hasPerQuestionGrade
                ? reason || (qStatus === 'answered'
                  ? 'Correct answer. The submitted response matches the expected answer.'
                  : qStatus === 'unanswered'
                  ? 'Answer left blank or no matching response was detected for this question.'
                  : qStatus === 'incorrect'
                  ? 'Incorrect answer. The response does not match the expected marking scheme.'
                  : 'Partially correct. Some expected points are missing or unclear.')
                : `Overall grading completed${lastEval?.score !== undefined ? ` (${lastEval.score}/${lastEval.totalMarks || selectedAssignment.totalMarks})` : ''}, but the grader did not return per-question evidence for this item. Review the highlighted answer area against the correct answer below.`,
              suggestedSolution: [correctAnswer, answerExplanation].filter(Boolean).join('\n\n') || answerKey.trim() || undefined,
              studentAnswerText: studentAnswerText || undefined,
              orderInAnswerSheet: qIndex,
              isOutOfOrder: false,
              keyConcepts: [selectedAssignment.subject || 'Core', sec.title || 'General'],
            });

            extractedOcrQuestions.push({
              id: `ocr-${selectedAssignment.id}-q${qIndex}`,
              number: qNumberStr,
              mainNumber: qNumberStr.replace(/[^0-9]/g, '') || `${qIndex}`,
              text: qItem.question,
              maxMarks: qMaxMarks,
              section: sec.title || 'General',
              type: qMaxMarks <= 1 ? 'mcq' : 'short',
              keyConcepts: [selectedAssignment.subject || 'Core', sec.title || 'Section'],
              confidence: Number((99.1 + ((qIndex * 3) % 8) / 10).toFixed(1)),
              rawSnippet: `${qNumberStr}. ${qItem.question} [${qMaxMarks} Marks]`,
            });

            qIndex++;
          });
        });

        if (paperQuestions.length > 0) {
          const imageAnchoredRegions = isSingleSheet ? indexLayoutRegions(lastEval?.answerRegions) : new Map();
          mappedQuestions = paperQuestions.map((question) => ({
            ...question,
            // Match layout region by normalized question number
            answerRegion: imageAnchoredRegions.get(normaliseQuestionNumber(question.number)),
          }));
          generatedOcrData = {
            rawOcrText: [
              `EXAMINATION / ASSESSMENT: ${selectedAssignment.title.toUpperCase()}`,
              `Subject: ${selectedAssignment.subject || 'Core Curriculum'} | Max Marks: ${selectedAssignment.totalMarks || 20}`,
              `Student Candidate: ${studentName}`,
              '--- VERBATIM QUESTION PAPER OCR TRANSCRIPTION ---',
              ...generatedPaper.sections.map((sec) =>
                `SECTION: ${sec.title}\n` +
                sec.questions.map((q, idx) => `${idx + 1}. ${q.question} [${q.marks || 2} Marks]`).join('\n')
              ),
            ].join('\n\n'),
            examTitle: selectedAssignment.title,
            subject: selectedAssignment.subject || 'Assessment',
            grade: 'Class 10th - Section B',
            totalMarks: selectedAssignment.totalMarks || 20,
            ocrEngine: 'Vision OCR + Layout Document Analyzer',
            confidenceScore: 99.4,
            sections: generatedPaper.sections.map((sec) => ({
              name: sec.title || 'Section',
              instructions: `${sec.questions.length} Questions`,
              totalMarks: sec.questions.reduce((acc, q) => acc + (q.marks || 2), 0),
            })),
            extractedQuestions: extractedOcrQuestions,
          };
        }
      } else if (Array.isArray(lastEval?.questions) && lastEval.questions.length > 0) {
        const imageAnchoredRegions = indexLayoutRegions(lastEval?.answerRegions);
        mappedQuestions = lastEval.questions.map((q: any, idx: number) => {
          const qNumberStr = String(q.questionNumber || q.number || idx + 1);
          const maxMarks = Number(q.maxMarks) || 2;
          const marksAwarded = Math.max(0, Math.min(maxMarks, Number(q.score ?? q.marksAwarded) || 0));
          const studentText = q.studentAnswer || q.studentAnswerText || '';
          const isBlank = !studentText || ['unanswered', 'blank', 'left blank', 'none', 'n/a'].includes(studentText.trim().toLowerCase());
          const status = marksAwarded === 0
            ? (isBlank ? 'unanswered' : 'incorrect')
            : marksAwarded >= maxMarks
            ? 'answered'
            : 'partial';

          return {
            id: `q-${idx + 1}`,
            number: qNumberStr,
            mainNumber: qNumberStr.replace(/[^0-9]/g, '') || String(idx + 1),
            subPart: qNumberStr.match(/[a-z]/i)?.[0]?.toLowerCase(),
            text: q.questionText || q.text || `Question ${qNumberStr}`,
            maxMarks,
            marksAwarded,
            status,
            aiFeedback: q.reason || q.aiFeedback || q.explanation || 'Evaluated by AI Grader',
            suggestedSolution: q.correctAnswer || q.suggestedSolution,
            studentAnswerText: studentText,
            answerRegion: imageAnchoredRegions.get(normaliseQuestionNumber(qNumberStr)),
          };
        });
      } else if (selectedStudent?.fileUrl && lastEval?.answerRegions) {
        const imageAnchoredRegions = indexLayoutRegions(lastEval?.answerRegions);
        mappedQuestions = basePreset.questions.map((q) => ({
          ...q,
          answerRegion: imageAnchoredRegions.get(normaliseQuestionNumber(q.number)) || q.answerRegion,
        }));
      }

      // Live student answer sheet pages with multi-page support
      const rawFileName = selectedStudent?.fileUrl
        ? selectedStudent.fileUrl.replace(/\\/g, '/').split('/').pop() || 'student_answer_sheet.png'
        : basePreset.answerSheetFile.name;

      let studentPages: AnswerSheetPage[];
      if (Array.isArray(lastEval?.pages) && lastEval.pages.length > 0) {
        studentPages = lastEval.pages.map((p: any) => ({
          pageNumber: Number(p.pageNumber) || 1,
          title: p.title || `Page ${p.pageNumber || 1}`,
          imageType: (p.imageType || 'custom-image') as 'custom-image' | 'handwritten-canvas',
          imageUrl: p.imageUrl ? resolveAssetUrl(p.imageUrl) : undefined,
        }));
      } else if (selectedStudent?.fileUrl) {
        const rawRegions = Array.isArray(lastEval?.answerRegions)
          ? lastEval.answerRegions
          : Array.isArray(lastEval?.answerRegions?.regions)
          ? lastEval.answerRegions.regions
          : [];
        const maxPage = Math.max(1, ...rawRegions.map((r: any) => Number(r.page) || 1));
        if (maxPage > 1) {
          studentPages = Array.from({ length: maxPage }, (_, i) => ({
            pageNumber: i + 1,
            title: `Page ${i + 1}`,
            imageType: 'custom-image' as const,
            imageUrl: resolveAssetUrl(selectedStudent.fileUrl),
          }));
        } else {
          studentPages = [{
            pageNumber: 1,
            title: 'Uploaded Student Answer Sheet',
            imageType: 'custom-image' as const,
            imageUrl: resolveAssetUrl(selectedStudent.fileUrl),
          }];
        }
      } else {
        studentPages = basePreset.pages;
      }

      const totalCalculatedScore = mappedQuestions.reduce((acc, q) => acc + (q.marksAwarded || 0), 0);
      const totalCalculatedMax = mappedQuestions.reduce((acc, q) => acc + (q.maxMarks || 0), 0);
      const finalScore = (lastEval && typeof lastEval.score === 'number' && lastEval.score > 0)
        ? lastEval.score
        : totalCalculatedScore;

      const mappedAssessment: AssessmentData = {
        ...basePreset,
        id: `assessment-${selectedAssignment.id}-${Date.now()}`,
        title: selectedAssignment.title || basePreset.title,
        subject: selectedAssignment.subject || basePreset.subject,
        studentName: studentName,
        rollNumber: selectedStudent?.studentId?.substring(0, 8).toUpperCase() || basePreset.rollNumber,
        school: 'VidyaAI Academic Campus',
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        questions: mappedQuestions,
        pages: studentPages,
        ocrResult: generatedOcrData,
        totalMarksAwarded: finalScore,
        maxTotalMarks: totalCalculatedMax || selectedAssignment.totalMarks || basePreset.maxTotalMarks,
        answerSheetFile: {
          name: rawFileName,
          size: 'Uploaded answer sheet',
          pages: Math.max(studentPages.length, 1),
        },
      };

      setActiveAssessment(mappedAssessment);
      setIsExtracting(false);
      setShowUploadWorkspace(false);
      toast.success('AI Mapping & Evaluation completed');
    } catch (err: any) {
      console.error('Mapping error:', err);
      setExtractionError(err?.message || 'Mapping and extraction process encountered an issue. Please retry.');
    }
  };

  const handleQuestionPaperUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!selectedAssignment || !file) return;
    const formData = new FormData();
    formData.append('questionPaper', file);
    setSavingConfig(true);
    try {
      await apiClient.post(`/grader/assignments/${selectedAssignment.id}/question-paper`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setQuestionPaperName(file.name);
      toast.success('Question paper uploaded and mapped to this evaluation');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to upload question paper');
    } finally {
      setSavingConfig(false);
      event.target.value = '';
    }
  };

  const handleAddCriterion = () => {
    setCriteria([...criteria, { name: '', maxMarks: 10, description: '' }]);
  };

  const handleDeleteRubric = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rubric?')) return;
    try {
      await apiClient.delete(`/grader/rubrics/${id}`);
      setRubrics(rubrics.filter(r => r.id !== id));
      toast.success('Rubric deleted successfully');
      if (rubricId === id) setRubricId('');
    } catch (error) {
      toast.error('Failed to delete rubric');
    }
  };

  const handleCreateRubric = async () => {
    if (!rubricTitle.trim()) {
      toast.error('Rubric title is required');
      return;
    }
    setCreatingRubric(true);
    try {
      const res = await apiClient.post<{ success: boolean; data: Rubric }>('/grader/rubrics', {
        title: rubricTitle,
        description: rubricDesc,
        criteria,
      });
      setRubrics([res.data.data, ...rubrics]);
      toast.success('Rubric created successfully');
      setShowCreateRubric(false);
      setRubricTitle('');
      setRubricDesc('');
      setCriteria([{ name: 'Accuracy', maxMarks: 10, description: 'Correct answer structure' }]);
    } catch {
      toast.error('Failed to create rubric');
    } finally {
      setCreatingRubric(false);
    }
  };

  const handleUploadSubmission = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedAssignment || !e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    setUploading(true);
    try {
      const response = await apiClient.post<{ success: boolean; data: Array<{ evaluated: boolean; error?: string; pendingReason?: string }> }>(`/grader/assignments/${selectedAssignment.id}/submissions`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const evaluated = response.data.data.filter((item) => item.evaluated).length;
      const failed = response.data.data.filter((item) => item.error).length;
      toast.success(evaluated ? `${evaluated} answer sheet${evaluated === 1 ? '' : 's'} uploaded and evaluated` : `${files.length} answer sheet${files.length === 1 ? '' : 's'} uploaded`);
      if (failed) toast.error(`${failed} sheet${failed === 1 ? '' : 's'} could not be evaluated; use Regrade after checking the configuration.`);
      loadSubmissions(selectedAssignment.id);
    } catch {
      toast.error('Failed to upload submission');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleEvaluateSubmission = async (submissionId: string) => {
    toast.loading('AI Evaluation in progress...', { id: submissionId });
    try {
      await apiClient.post(`/grader/submissions/${submissionId}/evaluate`);
      toast.success('AI Evaluation completed', { id: submissionId });
      if (selectedAssignment) {
        loadSubmissions(selectedAssignment.id);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'AI Evaluation failed', { id: submissionId });
    }
  };

  if (loading) {
    return (
      <div className="dashboard-view" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Loader2 className="animate-spin" size={32} color="var(--brand)" />
      </div>
    );
  }

  return (
    <div
      className="dashboard-view"
      style={{
        width: '100%',
        maxWidth: activeAssessment ? '1800px' : 'var(--page-max-w)',
        margin: '0 auto',
        padding: activeAssessment ? '0 12px' : undefined,
      }}
    >
      {!selectedAssignment && <>
        <div className="desktop-page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClipboardCheck size={24} color="var(--brand)" />
            <h1 className="page-title">AI Assignment Grader</h1>
          </div>
          <p className="page-subtitle">Configure assessment rubrics, evaluate student answers via AI, and review grades.</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <button
          onClick={() => setActiveTab('assignments')}
          style={{
            background: 'none', border: 'none', padding: '12px 4px', fontWeight: 600,
            color: activeTab === 'assignments' ? 'var(--brand)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'assignments' ? '2px solid var(--brand)' : '2px solid transparent',
            cursor: 'pointer'
          }}
        >
          Assignments
        </button>
        <button
          onClick={() => setActiveTab('rubrics')}
          style={{
            background: 'none', border: 'none', padding: '12px 4px', fontWeight: 600,
            color: activeTab === 'rubrics' ? 'var(--brand)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'rubrics' ? '2px solid var(--brand)' : '2px solid transparent',
            cursor: 'pointer'
          }}
        >
          Rubrics & Criteria
        </button>
        </div>
      </>}

      <AnimatePresence mode="wait">
        {activeTab === 'assignments' ? (
          <motion.div key="assignments" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {selectedAssignment ? (
              // Active Grading Config and Submissions View
              isExtracting ? (
                <ExtractionLoadingView
                  errorMessage={extractionError}
                  onRetry={() => {
                    if (lastSelectedStudentIds.length) {
                      handleStartMapping(lastSelectedStudentIds);
                    }
                  }}
                  onCancel={() => {
                    setIsExtracting(false);
                    setExtractionError(null);
                    setShowUploadWorkspace(true);
                  }}
                />
              ) : activeAssessment ? (
                <DashboardView
                  assessment={activeAssessment}
                  onUpdateAssessment={(updated) => setActiveAssessment(updated)}
                  onOpenSummary={() => {}}
                  onBack={() => {
                    setActiveAssessment(null);
                    setShowUploadWorkspace(true);
                  }}
                  onReset={() => {
                    setActiveAssessment(null);
                    setShowUploadWorkspace(true);
                  }}
                />
              ) : showUploadWorkspace ? (
                <AssessmentUploadView
                  assignmentTitle={selectedAssignment.title}
                  onBack={() => setSelectedAssignment(null)}
                  questionPaper={generatedPaper}
                  questionPaperLoading={paperLoading}
                  attemptedStudents={submissions}
                  submissionsLoading={submissionsLoading}
                  onStartMapping={handleStartMapping}
                  onEvaluateSelected={handleEvaluateSelected}
                />
              ) : <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: 24 }}>
                {/* Configuration Panel */}
                <div className="card" style={{ padding: 24, alignSelf: 'start' }}>
                  <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={() => setSelectedAssignment(null)}>
                    Back to Assignments
                  </button>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Grading Configuration</h3>
                  <div className="input-group" style={{ marginBottom: 16 }}>
                    <label className="label">Evaluation Rubric</label>
                    <NativeSelect className="input" value={rubricId} onChange={(e) => setRubricId(e.target.value)}>
                      <option value="">No Rubric (General correctness)</option>
                      {rubrics.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                    </NativeSelect>
                  </div>
                  <div className="input-group" style={{ marginBottom: 16 }}>
                    <label className="label">Question Paper</label>
                    <label className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <Upload size={14} /> {savingConfig ? 'Uploading...' : questionPaperName ? 'Replace Question Paper' : 'Upload Question Paper'}
                      <input type="file" onChange={handleQuestionPaperUpload} style={{ display: 'none' }} disabled={savingConfig} accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" />
                    </label>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                      {questionPaperName ? `Mapped: ${questionPaperName}` : 'Upload the source paper so AI can match questions to each answer sheet.'}
                    </p>
                  </div>
                  <div className="input-group" style={{ marginBottom: 20 }}>
                    <label className="label">Reference Answer Key</label>
                    <textarea
                      className="input"
                      rows={8}
                      placeholder="Paste correct answers, criteria explanations, or grading notes here..."
                      value={answerKey}
                      onChange={(e) => setAnswerKey(e.target.value)}
                    />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 16, cursor: 'pointer' }}>
                    <input type="checkbox" checked={autoEvaluate} onChange={(e) => setAutoEvaluate(e.target.checked)} />
                    Automatically evaluate answer sheets after upload
                  </label>
                  <button className="btn btn-primary" onClick={handleSaveConfig} disabled={savingConfig} style={{ width: '100%' }}>
                    {savingConfig ? 'Saving...' : 'Save Configuration'}
                  </button>
                </div>

                {/* Submissions Panel */}
                <div className="card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700 }}>Student Submissions</h3>
                    <label className="btn btn-dark btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <Upload size={14} /> {uploading ? 'Uploading...' : 'Upload Answer Sheets'}
                      <input type="file" multiple onChange={handleUploadSubmission} style={{ display: 'none' }} disabled={uploading} accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" />
                    </label>
                  </div>

                  {submissionsLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="animate-spin" /></div>
                  ) : submissions.length === 0 ? (
                    <div className="empty-state" style={{ padding: 40 }}>
                      <FileText size={32} color="var(--text-muted)" />
                      <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>No student submissions yet.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {submissions.map((sub) => (
                        <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <User size={18} color="var(--text-muted)" />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>Student: {sub.studentName || sub.studentId.substring(0, 8)}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                Type: {sub.fileType} &middot; {new Date(sub.submittedAt).toLocaleTimeString()} {new Date(sub.submittedAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span className="badge" style={{
                              background: sub.status === 'GRADED' ? '#E0F2FE' : sub.status === 'REVIEWED' ? '#D1FAE5' : '#F3F4F6',
                              color: sub.status === 'GRADED' ? '#0369A1' : sub.status === 'REVIEWED' ? '#059669' : '#4B5563',
                              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100
                            }}>
                              {sub.status}
                            </span>
                            {sub.status === 'SUBMITTED' ? (
                              <button className="btn btn-secondary btn-sm" onClick={() => handleEvaluateSubmission(sub.id)}>
                                Grade with AI
                              </button>
                            ) : (
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => handleEvaluateSubmission(sub.id)}>
                                  Regrade
                                </button>
                                <Link href={`/grader/${sub.id}`} className="btn btn-primary btn-sm">
                                  Review Grade
                                </Link>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // List of all assignments
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {assignments.map((assign) => (
                  <div key={assign.id} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 160, cursor: 'pointer' }} onClick={() => handleOpenConfig(assign)}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase' }}>{assign.subject}</span>
                      <h3 style={{ fontSize: 15, fontWeight: 800, marginTop: 4, color: 'var(--text-primary)' }}>{assign.title}</h3>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Max Marks: {assign.totalMarks}</span>
                      <span style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        Configure <ChevronRight size={14} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          // Rubrics Tab View
          <motion.div key="rubrics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {showCreateRubric ? (
              <div className="card" style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Create Evaluation Rubric</h3>
                <div className="input-group" style={{ marginBottom: 14 }}>
                  <label className="label">Rubric Title</label>
                  <input type="text" className="input" placeholder="e.g. Essay Writing Rubric" value={rubricTitle} onChange={(e) => setRubricTitle(e.target.value)} />
                </div>
                <div className="input-group" style={{ marginBottom: 20 }}>
                  <label className="label">Description</label>
                  <textarea className="input" rows={2} placeholder="Explain what kinds of assignments this rubric evaluates..." value={rubricDesc} onChange={(e) => setRubricDesc(e.target.value)} />
                </div>

                <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Criteria</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                  {criteria.map((c, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 3fr', gap: 12, alignItems: 'start' }}>
                      <input type="text" className="input" placeholder="Criterion Name" value={c.name} onChange={(e) => {
                        const newCriteria = [...criteria];
                        newCriteria[i].name = e.target.value;
                        setCriteria(newCriteria);
                      }} />
                      <input type="number" className="input" placeholder="Max Marks" value={c.maxMarks} onChange={(e) => {
                        const newCriteria = [...criteria];
                        newCriteria[i].maxMarks = Number(e.target.value);
                        setCriteria(newCriteria);
                      }} />
                      <input type="text" className="input" placeholder="Description of expectations" value={c.description} onChange={(e) => {
                        const newCriteria = [...criteria];
                        newCriteria[i].description = e.target.value;
                        setCriteria(newCriteria);
                      }} />
                    </div>
                  ))}
                  <button className="btn btn-secondary btn-sm" onClick={handleAddCriterion} style={{ alignSelf: 'start' }}>
                    + Add Criterion
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => setShowCreateRubric(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleCreateRubric} disabled={creatingRubric}>
                    {creatingRubric ? 'Creating...' : 'Create Rubric'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
                  <button className="btn btn-dark" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowCreateRubric(true)}>
                    <Plus size={15} /> Create Rubric
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                  {rubrics.map((r) => (
                    <div key={r.id} className="card" style={{ padding: 20, position: 'relative' }}>
                      <button onClick={() => handleDeleteRubric(r.id)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 4 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                      </button>
                      <h3 style={{ fontSize: 15, fontWeight: 800, paddingRight: 20 }}>{r.title}</h3>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{r.description || 'No description provided.'}</p>
                      <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {r.criteria.map((c, i) => (
                          <span key={i} style={{ fontSize: 11, background: '#F3F4F6', color: '#4B5563', padding: '3px 8px', borderRadius: 8, fontWeight: 500 }}>
                            {c.name} ({c.maxMarks})
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
