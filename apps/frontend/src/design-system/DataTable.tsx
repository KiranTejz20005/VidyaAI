'use client';

import React from 'react';
import { EmptyState } from './EmptyState';
import { Skeleton } from './LoadingState';

interface Column {
  key: string;
  header: string;
  render?: (value: any, row: any) => React.ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  onRowClick?: (row: any) => void;
  getRowDataTestId?: (row: any) => string | undefined;
  className?: string;
  /** Max height of the scroll area; header stays sticky inside it. */
  maxHeight?: number | string;
  caption?: string;
}

export function DataTable({
  columns,
  data,
  loading,
  emptyMessage = 'No data found',
  emptyIcon,
  onRowClick,
  getRowDataTestId,
  className,
  maxHeight = 'min(70vh, 640px)',
  caption,
}: DataTableProps) {
  if (loading) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading table" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} height={i === 0 ? 20 : 40} radius={8} />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyMessage}
        description="There's nothing here yet. Data will appear once available."
      />
    );
  }

  return (
    <div className={className} style={{ overflow: 'auto', width: '100%', maxHeight }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  background: 'var(--bg-muted, #f8f8f8)',
                  boxShadow: 'inset 0 -1px 0 var(--border)',
                  textAlign: col.align || 'left',
                  padding: '10px 14px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  fontSize: 'var(--text-xs)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                  width: col.width,
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={row.id || idx}
              data-testid={getRowDataTestId?.(row)}
              onClick={() => onRowClick?.(row)}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); } } : undefined}
              className={onRowClick ? 'ds-focus' : undefined}
              style={{
                borderBottom: '1px solid var(--border)',
                cursor: onRowClick ? 'pointer' : undefined,
                transition: 'background-color 120ms ease-out',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    textAlign: col.align || 'left',
                    padding: '12px 14px',
                    color: 'var(--text-primary)',
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
