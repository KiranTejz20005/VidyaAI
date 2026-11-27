import { api } from '@/lib/api';

export interface AssessmentDraft {
  answers: Record<string, string>;
  updatedAt: string | null;
}

export async function getAssessmentDraft(assignmentId: string): Promise<AssessmentDraft> {
  const res = await api.get(`/student/assessments/${assignmentId}/draft`);
  return res.data.data;
}

export async function saveAssessmentDraft(
  assignmentId: string,
  answers: Record<string, string>,
): Promise<{ updatedAt: string }> {
  const res = await api.put(`/student/assessments/${assignmentId}/draft`, { answers });
  return res.data.data;
}
