'use client';

import { useParams } from 'next/navigation';
import { BulkReviewDashboard } from '@/components/assessment/BulkReviewDashboard';

export default function BulkAssessmentReviewPage() {
  const params = useParams();
  const assignmentId = params.id as string;

  return <BulkReviewDashboard assignmentId={assignmentId} />;
}