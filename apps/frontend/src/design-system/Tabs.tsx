'use client';

import React from 'react';

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            className="ds-press ds-focus"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange(tab.id)}
            style={{
              padding: '10px 16px',
              minHeight: 'var(--hit-min)',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              fontWeight: isActive ? 700 : 500,
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: isActive ? '2px solid var(--brand)' : '2px solid transparent',
              marginBottom: -1,
              transition: 'color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
