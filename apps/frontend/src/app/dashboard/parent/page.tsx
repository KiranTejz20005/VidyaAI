'use client';

import { Users } from 'lucide-react';
import { PageHeader } from '@/design-system/PageHeader';
import { EmptyState } from '@/design-system/EmptyState';

/**
 * Parent portal.
 *
 * The backend currently has no parent/guardian role and no parent-to-student
 * link (no schema model, no /parent endpoints), so there is no real data to
 * show. The earlier hard-coded demo child has been removed rather than
 * presented as real progress. Re-enable once guardian links and a parent
 * summary endpoint exist.
 */
export default function ParentDashboard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader title="Parent Portal" subtitle="Academic progress for your linked student" />
      <EmptyState
        icon={<Users size={32} />}
        title="No linked student yet"
        description="Parent accounts are not enabled for this organization. Once your school links a student to your account, their attendance, assignments and progress will appear here."
      />
    </div>
  );
}
