'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { PageHeader } from '@/design-system/PageHeader';
import { Card } from '@/design-system/Card';
import { DataTable } from '@/design-system/DataTable';
import { ErrorState } from '@/design-system/ErrorState';
import { EmptyState } from '@/design-system/EmptyState';
import { Button } from '@/design-system/Button';
import { FileText, CheckCircle2, AlertCircle, ChevronRight, Sparkles, LayoutDashboard } from 'lucide-react';
import toast from 'react-hot-toast';
import { bulkEvaluate, getBulkEvaluateJobStatus, listSubmissionsForGrading } from '@/services/grading.service';

interface Submission {
  id: string;
  studentId: string;
  studentName: string;
  status: string;
  submittedAt: string;
  evaluations: any[];
}

export default function SubmissionsListPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const router = useRouter();
  const params = useParams();
  const assignmentId = params.id as string;

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await listSubmissionsForGrading(assignmentId);
      setSubmissions(
        data.map((s: any) => ({
          id: s.id,
          studentId: s.studentId,
          studentName: s.studentName || s.student?.name || 'Student',
          status: s.status,
          submittedAt: s.submittedAt || s.createdAt,
          evaluations: s.evaluations || [],
        })),
      );
    } catch {
      setLoadError('Failed to load submissions');
      toast.error('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (assignmentId) fetchSubmissions();
  }, [assignmentId]);

  const handleBulkGrade = async () => {
    toast.loading('Queuing bulk AI grading...', { id: 'bulk-grade' });
    try {
      const { jobId } = await bulkEvaluate(assignmentId);
      toast.success(`Bulk job queued (${jobId.slice(0, 8)}…)`, { id: 'bulk-grade' });
      // Poll briefly then refresh list — processing continues in the worker
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const status = await getBulkEvaluateJobStatus(jobId);
          if (status && (status as any).status && ['completed', 'COMPLETED', 'failed', 'FAILED'].includes(String((status as any).status))) {
            break;
          }
        } catch {
          toast.error('Bulk grading job status unavailable', { id: 'bulk-grade' });
          break;
        }
      }
      fetchSubmissions();
    } catch (err: any) {
      toast.error(
        `${err.response?.data?.error || 'Bulk grading failed'}. Use Bulk AI Grade to retry.`,
        { id: 'bulk-grade' },
      );
    }
  };

  const pendingCount = submissions.filter(s => s.status !== 'GRADED').length;

  const columns = [
    {
      key: 'studentName',
      header: 'Student Name',
      render: (_: unknown, sub: Submission) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div aria-hidden style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--brand)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
            {sub.studentName.charAt(0).toUpperCase()}
          </div>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{sub.studentName}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (_: unknown, sub: Submission) =>
        sub.status === 'GRADED' ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: '#D1FAE5', color: '#065F46' }}>
            <CheckCircle2 size={12} aria-hidden /> Graded
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: '#FEF3C7', color: '#92400E' }}>
            <AlertCircle size={12} aria-hidden /> Pending
          </span>
        ),
    },
    {
      key: 'score',
      header: 'Score',
      render: (_: unknown, sub: Submission) => {
        const latestEval = sub.evaluations?.[0];
        return <span style={{ fontWeight: 600 }}>{latestEval ? `${latestEval.score} / ${latestEval.totalMarks}` : '-'}</span>;
      },
    },
    {
      key: 'submittedAt',
      header: 'Submitted At',
      render: (_: unknown, sub: Submission) => (
        <span style={{ color: 'var(--text-secondary)' }}>{new Date(sub.submittedAt).toLocaleString()}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      render: (_: unknown, sub: Submission) => (
        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/teacher/assessments/${assignmentId}/submissions/${sub.id}`); }}>
          View Details <ChevronRight size={14} style={{ marginLeft: 4 }} aria-hidden />
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Student Submissions"
        subtitle="Manage and grade student work."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => router.push(`/teacher/assessments/${assignmentId}/bulk`)}>
              <LayoutDashboard size={16} style={{ marginRight: 8 }} aria-hidden />
              Bulk review dashboard
            </Button>
            {pendingCount > 0 && (
              <Button variant="outline" onClick={handleBulkGrade}>
                <Sparkles size={16} style={{ marginRight: 8, color: 'var(--brand)' }} aria-hidden />
                Bulk AI Grade ({pendingCount})
              </Button>
            )}
            <Button variant="outline" onClick={() => router.push('/assignments')}>Back to Assignments</Button>
          </div>
        }
      />

      <Card padding="0">
        {loadError ? (
          <ErrorState message={loadError} onRetry={fetchSubmissions} />
        ) : !loading && submissions.length === 0 ? (
          <EmptyState
            icon={<FileText size={48} aria-hidden />}
            title="No submissions yet"
            description="No submissions found for this assignment."
          />
        ) : (
          <DataTable
            caption="Student submissions"
            columns={columns}
            data={submissions}
            loading={loading}
            onRowClick={(sub: Submission) => router.push(`/teacher/assessments/${assignmentId}/submissions/${sub.id}`)}
          />
        )}
      </Card>
    </div>
  );
}
