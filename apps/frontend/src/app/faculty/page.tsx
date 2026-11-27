'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/config/routes';
import { LoadingState } from '@/design-system/LoadingState';

/** Legacy /faculty entry point: the teacher dashboard now lives at /teacher. */
export default function FacultyLegacyRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(ROUTES.TEACHER.DASHBOARD);
  }, [router]);
  return <LoadingState lines={3} />;
}
