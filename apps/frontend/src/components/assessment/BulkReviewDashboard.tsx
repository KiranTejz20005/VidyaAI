'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  User,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import {
  bulkEvaluate,
  getBulkEvaluateJobStatus,
  listSubmissionsForGrading,
} from '@/services/grading.service';
import type { BulkEvaluateJob, BulkReviewBucket, BulkReviewStatusCounts } from '@/types/grading.types';
import { PageHeader } from '@/design-system/PageHeader';
import { Card } from '@/design-system/Card';
import { Button } from '@/design-system/Button';
import { Badge } from '@/design-system/Badge';
import { Input } from '@/design-system/Input';
import { Select } from '@/design-system/Select';
import { StatsCard } from '@/design-system/StatsCard';
import { DataTable } from '@/design-system/DataTable';
import { LoadingState } from '@/design-system/LoadingState';
import { ErrorState } from '@/design-system/ErrorState';
import { EmptyState } from '@/design-system/EmptyState';

export interface BulkReviewRow {
  id: string;
  studentId: string;
  studentName: string;
  status: string;
  submittedAt: string;
  score?: number;
  totalMarks?: number;
  bucket: BulkReviewBucket;
  needsReview: boolean;
  confidence: number | null;
  hasEvaluation: boolean;
  isOverridden: boolean;
}

interface BulkReviewDashboardProps {
  assignmentId: string;
}

function normalizeStatus(s: string): string {
  return String(s || '').toUpperCase();
}

function averageConfidence(evaluations: unknown[]): number | null {
  const latest = evaluations?.[0] as Record<string, unknown> | undefined;
  if (!latest) return null;
  const grades = (latest.criteriaGrades ?? latest.criterionAwards ?? []) as Record<string, unknown>[];
  const confs = grades
    .map((g) => g.confidence)
    .filter((c): c is number => typeof c === 'number' && Number.isFinite(c));
  if (confs.length === 0) return null;
  return confs.reduce((a, b) => a + b, 0) / confs.length;
}

function classifyBucket(
  status: string,
  hasEvaluation: boolean,
  jobProcessing: boolean,
): BulkReviewBucket {
  if (jobProcessing) return 'processing';
  const s = normalizeStatus(status);
  if (s === 'RESULT_PUBLISHED') return 'finalized';
  if (s === 'UNDER_REVIEW') return 'awaiting_review';
  if (s === 'GRADED' || hasEvaluation) return 'evaluated';
  if (s === 'FAILED') return 'failed';
  return 'pending_processing';
}

function mapLegacySubmission(raw: Record<string, unknown>): BulkReviewRow {
  const evaluations = (raw.evaluations as unknown[]) ?? [];
  const latest = evaluations[0] as Record<string, unknown> | undefined;
  const status = String(raw.status ?? 'SUBMITTED');
  const hasEvaluation = evaluations.length > 0;
  const confidence = averageConfidence(evaluations);
  const isOverridden = Boolean(latest?.isOverridden);
  const needsReview =
    normalizeStatus(status) === 'UNDER_REVIEW' ||
    (confidence !== null && confidence < 0.7 && !isOverridden);

  return {
    id: String(raw.id),
    studentId: String(raw.studentId),
    studentName: String(raw.studentName ?? 'Student'),
    status,
    submittedAt: String(raw.submittedAt ?? raw.createdAt ?? new Date().toISOString()),
    score: latest ? Number(latest.score) : undefined,
    totalMarks: latest ? Number(latest.totalMarks) : undefined,
    bucket: classifyBucket(status, hasEvaluation, false),
    needsReview,
    confidence,
    hasEvaluation,
    isOverridden,
  };
}

function mapGatewaySubmission(raw: Record<string, unknown>): BulkReviewRow {
  const status = String(raw.status ?? 'SUBMITTED');
  const hasEvaluation =
    raw.evaluatedAt != null ||
    (typeof raw.score === 'number' && typeof raw.totalMarks === 'number');
  const needsReview = normalizeStatus(status) === 'UNDER_REVIEW';

  return {
    id: String(raw.id),
    studentId: String(raw.studentId),
    studentName: String(raw.studentName ?? 'Student'),
    status,
    submittedAt: String(raw.submittedAt ?? new Date().toISOString()),
    score: typeof raw.score === 'number' ? raw.score : undefined,
    totalMarks: typeof raw.totalMarks === 'number' ? raw.totalMarks : undefined,
    bucket: classifyBucket(status, hasEvaluation, false),
    needsReview,
    confidence: null,
    hasEvaluation,
    isOverridden: false,
  };
}

function computeCounts(rows: BulkReviewRow[], job: BulkEvaluateJob | null): BulkReviewStatusCounts {
  const processingFromJob =
    job && (job.status === 'queued' || job.status === 'processing')
      ? Math.max(0, job.total - job.completed - job.failed)
      : 0;

  const base = rows.reduce(
    (acc, row) => {
      acc[row.bucket] += 1;
      return acc;
    },
    {
      pending_processing: 0,
      processing: 0,
      evaluated: 0,
      failed: 0,
      awaiting_review: 0,
      finalized: 0,
    } as Record<BulkReviewBucket, number>,
  );

  base.processing += processingFromJob;

  return {
    total: rows.length,
    pendingProcessing: base.pending_processing,
    processing: base.processing,
    evaluated: base.evaluated,
    failed: base.failed + (job?.failed ?? 0),
    awaitingReview: base.awaiting_review,
    finalized: base.finalized,
  };
}

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending_processing', label: 'Pending processing' },
  { value: 'processing', label: 'Processing' },
  { value: 'evaluated', label: 'Evaluated' },
  { value: 'failed', label: 'Failed' },
  { value: 'awaiting_review', label: 'Awaiting review' },
  { value: 'finalized', label: 'Finalized' },
];

const REVIEW_FILTER_OPTIONS = [
  { value: 'all', label: 'All confidence' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'high_confidence', label: 'High confidence (≥70%)' },
  { value: 'low_confidence', label: 'Low confidence (<70%)' },
];

function bucketBadgeVariant(bucket: BulkReviewBucket): 'pending' | 'success' | 'warning' | 'error' | 'info' | 'draft' {
  switch (bucket) {
    case 'finalized':
      return 'success';
    case 'evaluated':
      return 'info';
    case 'awaiting_review':
      return 'warning';
    case 'failed':
      return 'error';
    case 'processing':
      return 'info';
    default:
      return 'pending';
  }
}

function bucketLabel(bucket: BulkReviewBucket): string {
  const labels: Record<BulkReviewBucket, string> = {
    pending_processing: 'Pending',
    processing: 'Processing',
    evaluated: 'Evaluated',
    failed: 'Failed',
    awaiting_review: 'Awaiting review',
    finalized: 'Finalized',
  };
  return labels[bucket];
}

export function BulkReviewDashboard({ assignmentId }: BulkReviewDashboardProps) {
  const router = useRouter();
  const [rows, setRows] = useState<BulkReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [bulkJob, setBulkJob] = useState<BulkEvaluateJob | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkGradeError, setBulkGradeError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchSubmissions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let mapped: BulkReviewRow[] = [];
      try {
        const data = await listSubmissionsForGrading(assignmentId);
        mapped = (data as unknown as Record<string, unknown>[]).map(mapGatewaySubmission);
      } catch {
        const res = await api.get(`/grader/assignments/${assignmentId}/submissions`);
        if (res.data?.success && Array.isArray(res.data.data)) {
          mapped = res.data.data.map((s: Record<string, unknown>) => mapLegacySubmission(s));
        } else {
          throw new Error('Failed to load submissions');
        }
      }
      setRows(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  const startJobPolling = useCallback(
    (jobId: string) => {
      clearPoll();
      const poll = async () => {
        try {
          const status = await getBulkEvaluateJobStatus(jobId);
          setBulkJob(status);
          const terminal = status.status === 'completed' || status.status === 'failed';
          if (terminal) {
            clearPoll();
            setBulkRunning(false);
            setBulkGradeError(null);
            await fetchSubmissions();
            if (status.status === 'completed') {
              toast.success(`Bulk grading complete (${status.completed}/${status.total})`);
            } else {
              setBulkGradeError('Bulk grading finished with errors.');
              toast.error('Bulk grading finished with errors. Use Retry if needed.');
            }
          }
        } catch {
          clearPoll();
          setBulkRunning(false);
          setBulkGradeError('Could not track bulk grading job status.');
          toast.error('Bulk grading job status unavailable. Use Retry to try again.', {
            id: 'bulk-review-grade',
          });
        }
      };
      void poll();
      pollRef.current = setInterval(poll, 2500);
    },
    [clearPoll, fetchSubmissions],
  );

  const handleBulkGrade = async () => {
    const pending = rows.filter((r) => r.bucket === 'pending_processing').length;
    if (pending === 0) {
      toast.error('No pending submissions to grade');
      return;
    }
    toast.loading('Queuing bulk AI grading…', { id: 'bulk-review-grade' });
    setBulkRunning(true);
    setBulkGradeError(null);
    try {
      const { jobId } = await bulkEvaluate(assignmentId);
      toast.success(`Bulk job queued (${jobId.slice(0, 8)}…)`, { id: 'bulk-review-grade' });
      startJobPolling(jobId);
    } catch (err: unknown) {
      setBulkRunning(false);
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      const errorText = message || 'Bulk grading failed';
      setBulkGradeError(errorText);
      toast.error(`${errorText}. Use Retry to try again.`, { id: 'bulk-review-grade' });
    }
  };

  useEffect(() => {
    if (assignmentId) void fetchSubmissions();
    return clearPoll;
  }, [assignmentId, fetchSubmissions, clearPoll]);

  const counts = useMemo(() => computeCounts(rows, bulkJob), [rows, bulkJob]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.bucket !== statusFilter) return false;
      if (reviewFilter === 'needs_review' && !row.needsReview) return false;
      if (reviewFilter === 'high_confidence' && (row.confidence === null || row.confidence < 0.7)) return false;
      if (reviewFilter === 'low_confidence' && (row.confidence === null || row.confidence >= 0.7)) return false;
      if (q) {
        const hay = `${row.studentName} ${row.studentId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, reviewFilter, search]);

  const openSubmission = (row: BulkReviewRow) => {
    router.push(`/teacher/assessments/${assignmentId}/submissions/${row.id}`);
  };

  const tableColumns = [
    {
      key: 'studentName',
      header: 'Student',
      render: (_: unknown, row: BulkReviewRow) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--brand)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              fontSize: 12,
              flexShrink: 0,
            }}
            aria-hidden
          >
            {row.studentName.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.studentName}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{row.studentId}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'bucket',
      header: 'Status',
      render: (_: unknown, row: BulkReviewRow) => (
        <Badge variant={bucketBadgeVariant(row.bucket)}>{bucketLabel(row.bucket)}</Badge>
      ),
    },
    {
      key: 'score',
      header: 'Score',
      render: (_: unknown, row: BulkReviewRow) =>
        row.score != null && row.totalMarks != null ? (
          <span style={{ fontWeight: 600 }}>
            {row.score} / {row.totalMarks}
          </span>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        ),
    },
    {
      key: 'needsReview',
      header: 'Review',
      render: (_: unknown, row: BulkReviewRow) =>
        row.needsReview ? (
          <Badge variant="warning">
            <AlertCircle size={12} aria-hidden /> Review
          </Badge>
        ) : row.confidence != null ? (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            {Math.round(row.confidence * 100)}% conf.
          </span>
        ) : row.isOverridden ? (
          <Badge variant="success">Override</Badge>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>—</span>
        ),
    },
    {
      key: 'submittedAt',
      header: 'Submitted',
      render: (val: string) => (
        <time dateTime={val} style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
          {new Date(val).toLocaleString()}
        </time>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right' as const,
      render: () => <ChevronRight size={16} color="var(--text-muted)" aria-hidden />,
    },
  ];

  if (error && !loading && rows.length === 0) {
    return (
      <div data-testid="bulk-review-root">
        <Card>
          <ErrorState message={error} onRetry={() => void fetchSubmissions()} />
        </Card>
      </div>
    );
  }

  return (
    <div data-testid="bulk-review-root" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
        }}
      >
        <PageHeader
          title="Bulk assessment review"
          subtitle="Monitor grading progress, filter by status, and open individual submissions for review."
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchSubmissions()}
            disabled={loading}
            aria-label="Refresh submissions"
          >
            <RefreshCw size={14} style={{ marginRight: 6 }} aria-hidden />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/teacher/assessments/${assignmentId}/submissions`)}
          >
            Submissions list
          </Button>
          {bulkGradeError && !bulkRunning && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleBulkGrade()}
              aria-label="Retry bulk AI grading"
            >
              <RefreshCw size={14} style={{ marginRight: 6 }} aria-hidden />
              Retry bulk grade
            </Button>
          )}
          <Button
            data-testid="bulk-evaluate-btn"
            variant="primary"
            size="sm"
            onClick={() => void handleBulkGrade()}
            disabled={bulkRunning || counts.pendingProcessing === 0}
            aria-busy={bulkRunning}
          >
            {bulkRunning ? (
              <Loader2 size={16} style={{ marginRight: 8 }} className="animate-spin" aria-hidden />
            ) : (
              <Sparkles size={16} style={{ marginRight: 8 }} aria-hidden />
            )}
            Bulk AI Grade ({counts.pendingProcessing})
          </Button>
        </div>
      </div>

      {bulkJob && (bulkJob.status === 'queued' || bulkJob.status === 'processing') && (
        <Card
          data-testid="bulk-job-status"
          style={{
            borderColor: 'var(--border-strong)',
            background: 'var(--bg-muted)',
          }}
        >
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
            role="status"
            aria-live="polite"
          >
            <Loader2 size={18} className="animate-spin" aria-hidden />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>Bulk grading in progress</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 4 }}>
                {bulkJob.completed} of {bulkJob.total} completed
                {bulkJob.failed > 0 ? ` · ${bulkJob.failed} failed` : ''}
              </div>
              <div
                style={{
                  marginTop: 8,
                  height: 6,
                  borderRadius: 4,
                  background: 'var(--border)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${bulkJob.total > 0 ? Math.round((bulkJob.completed / bulkJob.total) * 100) : bulkJob.progress}%`,
                    background: 'var(--brand)',
                    transition: 'width 0.3s',
                  }}
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      <div
        data-testid="bulk-bucket-tabs"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 12,
        }}
        role="region"
        aria-label="Submission status counts"
      >
        <StatsCard icon={<FileText size={18} />} label="Total" value={counts.total} />
        <StatsCard icon={<Clock size={18} />} label="Pending processing" value={counts.pendingProcessing} />
        <StatsCard icon={<Loader2 size={18} />} label="Processing" value={counts.processing} />
        <StatsCard icon={<CheckCircle2 size={18} />} label="Evaluated" value={counts.evaluated} />
        <StatsCard icon={<XCircle size={18} />} label="Failed" value={counts.failed} />
        <StatsCard icon={<AlertCircle size={18} />} label="Awaiting review" value={counts.awaitingReview} />
        <StatsCard icon={<User size={18} />} label="Finalized" value={counts.finalized} />
      </div>

      <Card padding="clamp(16px, 2vw, 20px)">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'flex-end',
          }}
        >
          <div style={{ flex: '1 1 220px', minWidth: 180 }}>
            <Input
              label="Search student"
              placeholder="Name or student ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search size={16} aria-hidden />}
              aria-label="Search by student name or ID"
            />
          </div>
          <div style={{ flex: '1 1 180px', minWidth: 160 }}>
            <Select
              label="Status"
              options={STATUS_FILTER_OPTIONS}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            />
          </div>
          <div style={{ flex: '1 1 180px', minWidth: 160 }}>
            <Select
              label="Confidence / review"
              options={REVIEW_FILTER_OPTIONS}
              value={reviewFilter}
              onChange={(e) => setReviewFilter(e.target.value)}
              aria-label="Filter by review or confidence"
            />
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
          <Filter size={14} aria-hidden />
          {filteredRows.length} of {rows.length} submissions shown
        </div>
      </Card>

      <Card padding="0">
        {loading ? (
          <LoadingState lines={8} />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            icon={<FileText size={48} aria-hidden />}
            title={rows.length === 0 ? 'No submissions yet' : 'No matches'}
            description={
              rows.length === 0
                ? 'Students have not submitted work for this assessment.'
                : 'Try adjusting filters or search terms.'
            }
            action={rows.length === 0 ? () => void fetchSubmissions() : undefined}
            actionLabel={rows.length === 0 ? 'Refresh' : undefined}
          />
        ) : (
          <DataTable
            columns={tableColumns}
            data={filteredRows}
            getRowDataTestId={(row: BulkReviewRow) => `bulk-row-${row.id}`}
            onRowClick={(row: BulkReviewRow) => openSubmission(row)}
          />
        )}
      </Card>
    </div>
  );
}