import { api } from '@/lib/api';
import type { GradingConfig, CreateGradingConfigData, Submission, Evaluation, GradeOverrideData, BulkEvaluateJob } from '@/types/grading.types';

export async function saveGradingConfig(assignmentId: string, data: CreateGradingConfigData): Promise<GradingConfig> {
  const res = await api.post(`/grading/config/${assignmentId}`, data);
  return res.data.data;
}

export async function getGradingConfig(assignmentId: string): Promise<GradingConfig> {
  const res = await api.get(`/grading/config/${assignmentId}`);
  return res.data.data;
}

export async function listSubmissionsForGrading(assignmentId: string): Promise<Submission[]> {
  const res = await api.get(`/grading/submissions/${assignmentId}`);
  return res.data.data;
}

export async function evaluateSubmission(submissionId: string): Promise<Evaluation> {
  const res = await api.post(`/grading/submissions/${submissionId}/evaluate`);
  return res.data.data;
}

export async function getEvaluationResult(submissionId: string): Promise<Evaluation> {
  const res = await api.get(`/grading/submissions/${submissionId}/evaluation`);
  return res.data.data;
}

export async function overrideGrade(submissionId: string, data: GradeOverrideData): Promise<Evaluation> {
  const res = await api.post(`/grading/submissions/${submissionId}/override`, data);
  return res.data.data;
}

export async function bulkEvaluate(assignmentId: string): Promise<{ jobId: string }> {
  const res = await api.post(`/grading/bulk-evaluate/${assignmentId}`);
  return res.data.data;
}

export async function getBulkEvaluateJobStatus(jobId: string): Promise<BulkEvaluateJob> {
  const res = await api.get(`/grading/bulk-evaluate/${jobId}`);
  return res.data.data;
}

export async function uploadQuestionPaper(assignmentId: string, file: File): Promise<GradingConfig> {
  const formData = new FormData();
  formData.append('questionPaper', file);
  const res = await api.post(`/grading/question-paper/${assignmentId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
}

export interface UploadedSubmissionResult {
  evaluated: boolean;
  error?: string;
  pendingReason?: string;
}

export async function uploadAnswerSheets(assignmentId: string, files: File[]): Promise<UploadedSubmissionResult[]> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  const res = await api.post(`/grading/submissions/${assignmentId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
}

/** Grading config for an assignment; resolves to null when none has been saved yet. */
export async function getGradingConfigOrNull(assignmentId: string): Promise<GradingConfig | null> {
  const res = await api.get(`/grading/config/${assignmentId}`);
  return res.data.data ?? null;
}
