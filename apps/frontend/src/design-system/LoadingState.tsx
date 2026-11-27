'use client';

import React from 'react';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = 16, radius, className, style }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={['ds-skeleton', className].filter(Boolean).join(' ')}
      style={{ width, height, ...(radius !== undefined ? { borderRadius: radius } : {}), ...style }}
    />
  );
}

interface LoadingStateProps {
  lines?: number;
}

export function LoadingState({ lines = 4 }: LoadingStateProps) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={i === 0 ? 24 : 16}
          width={i === 0 ? '60%' : ['100%', '85%', '70%', '90%'][i % 4]}
          radius={8}
        />
      ))}
    </div>
  );
}
