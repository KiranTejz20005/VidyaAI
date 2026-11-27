'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

const LABELS: Record<string, string> = {
  obe: 'OBE',
  ai: 'AI',
  'super-admin': 'Super Admin',
};

const ROOTS = new Set(['teacher', 'student', 'faculty', 'admin', 'super-admin', 'dashboard']);

function isId(seg: string) {
  return /^\d+$/.test(seg) || /^[0-9a-f]{8}-/i.test(seg) || (seg.length > 20 && /\d/.test(seg));
}

function label(seg: string) {
  if (isId(seg)) return 'Details';
  if (LABELS[seg]) return LABELS[seg];
  return seg.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Path-derived breadcrumbs. Hidden on role roots (nothing to navigate up to). */
export function Breadcrumbs() {
  const pathname = usePathname();
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length < 2) return null;
  if (segs.length === 2 && segs[0] === 'dashboard') return null;

  const crumbs = segs.map((seg, i) => ({
    seg,
    href: '/' + segs.slice(0, i + 1).join('/'),
    isLast: i === segs.length - 1,
    linkable: !isId(seg) && !(i === 0 && seg === 'dashboard'),
  }));

  return (
    <nav aria-label="Breadcrumb" className="mb-3 -mt-1 min-w-0">
      <ol className="flex items-center gap-1 overflow-hidden whitespace-nowrap text-xs text-neutral-500">
        {crumbs.map(({ seg, href, isLast, linkable }, i) => (
          <li key={href} className={`flex items-center gap-1 min-w-0 ${isLast ? '' : 'shrink-0 max-sm:hidden'} ${isLast ? 'max-sm:flex' : ''}`}>
            {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-neutral-300" aria-hidden="true" />}
            {isLast || !linkable ? (
              <span
                className={`truncate ${isLast ? 'font-medium text-neutral-900' : ''}`}
                aria-current={isLast ? 'page' : undefined}
              >
                {label(seg)}
              </span>
            ) : (
              <Link href={href} className="rounded px-0.5 hover:text-neutral-900 ds-focus">
                {ROOTS.has(seg) && i === 0 ? 'Home' : label(seg)}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
