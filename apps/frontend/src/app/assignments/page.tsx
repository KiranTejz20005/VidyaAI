'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  FileText,
  Search,
  Clock,
  ChevronRight,
  Plus,
  Star,
} from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/design-system/PageHeader';
import { MetricCard } from '@/design-system/MetricCard';
import { ErrorState } from '@/design-system/ErrorState';
import { EmptyState } from '@/design-system/EmptyState';
import { Skeleton } from '@/design-system/LoadingState';
import { useAuthStore } from '@/store/auth.store';
import type { Assignment } from '@/types/assignment.types';

const STATUS_BADGES: Record<string, string> = {
  PUBLISHED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  COMPLETED: 'bg-blue-50 text-blue-700 border-blue-200',
  PENDING_APPROVAL: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-purple-50 text-purple-700 border-purple-200',
  DRAFT: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function AssignmentsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isStudent = user?.role === 'STUDENT';

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const fetchAssignments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/assignments?limit=100');
      const list: Assignment[] = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray((res.data as any)?.data?.assignments)
        ? (res.data as any).data.assignments
        : Array.isArray(res.data)
        ? (res.data as any)
        : [];
      setAssignments(list);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isStudent) {
      router.replace('/student/assessments');
      return;
    }
    fetchAssignments();
  }, [isStudent, router, fetchAssignments]);

  const filtered = useMemo(() => {
    return assignments.filter((a) => {
      const matchesSearch =
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        a.subject.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        selectedStatus === 'ALL' || a.status.toUpperCase() === selectedStatus.toUpperCase();
      return matchesSearch && matchesStatus;
    });
  }, [assignments, search, selectedStatus]);

  if (loading) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading assignments" className="max-w-[1600px] mx-auto flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton height={32} width={256} radius={12} />
          <Skeleton height={16} width={384} radius={8} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={120} radius={16} />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={176} radius={16} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto text-slate-900 font-sans flex flex-col gap-6">
      <PageHeader
        title="Assignment Management"
        subtitle="Author, review, publish, and monitor question papers and exams across all sections"
        actions={
          <Link
            href="/assignments/create"
            className="ds-press ds-focus inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#e05934] px-4 text-xs font-bold text-white transition-colors hover:bg-[#c94a2a]"
          >
            <Plus className="w-4 h-4" aria-hidden />
            <span>Create New Assignment</span>
          </Link>
        }
      />

      <div className="ds-stagger grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label="All assignments" value={assignments.length} />
        <MetricCard label="Published & active" value={assignments.filter((a) => ['PUBLISHED', 'ACTIVE'].includes(a.status)).length} />
        <MetricCard label="Pending approval" value={assignments.filter((a) => a.status === 'PENDING_APPROVAL').length} />
        <MetricCard label="Drafts" value={assignments.filter((a) => a.status === 'DRAFT').length} />
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden />
          <input
            type="search"
            aria-label="Search assignments"
            placeholder="Search by title, subject, or class..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-h-10 pl-10 pr-4 py-2.5 bg-white border border-neutral-200/90 rounded-xl text-xs font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#e05934] transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {['ALL', 'PUBLISHED', 'PENDING_APPROVAL', 'APPROVED', 'DRAFT'].map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={selectedStatus === status}
              onClick={() => setSelectedStatus(status)}
              className={`ds-press ds-focus min-h-10 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                selectedStatus === status
                  ? 'bg-neutral-900 text-white shadow-2xs'
                  : 'bg-white border border-neutral-200/90 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      {error ? (
        <ErrorState message={error} onRetry={fetchAssignments} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-10 h-10" aria-hidden />}
          title="No assignments found"
          description={
            search || selectedStatus !== 'ALL'
              ? 'No assignments match the active search or filter criteria.'
              : 'Create your first assessment paper using AI question generation.'
          }
          action={() => router.push('/assignments/create')}
          actionLabel="Create Assignment"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((assignment, idx) => {
            const badgeCls = STATUS_BADGES[assignment.status] || 'bg-neutral-100 text-neutral-800 border-neutral-200';
            return (
              <motion.div
                key={assignment.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="rounded-2xl border border-neutral-200/90 bg-white p-5 shadow-xs hover:border-neutral-300 hover:shadow-sm transition-all flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-orange-50 text-[#e05934] border border-orange-100">
                      {assignment.subject}
                    </span>
                    <span className={`text-[11px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${badgeCls}`}>
                      {assignment.status.replace('_', ' ')}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-neutral-900 leading-snug line-clamp-2">
                    {assignment.title}
                  </h3>
                  <p className="text-xs text-neutral-500 line-clamp-2 mt-1.5 font-medium">
                    {assignment.description || `Assessment paper covering key curriculum topics in ${assignment.subject}.`}
                  </p>
                </div>

                <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500 font-medium">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-neutral-400" />
                      <span className="tabular-nums">{assignment.duration}m</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-amber-500" />
                      <span className="tabular-nums">{assignment.totalMarks} Marks</span>
                    </span>
                  </div>

                  <Link
                    href={`/assignments/${assignment.id}`}
                    className="text-xs font-bold text-[#e05934] hover:underline flex items-center gap-1"
                  >
                    <span>Details</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
