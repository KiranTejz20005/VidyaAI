import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  const tx = {
    user: { createMany: vi.fn(), findMany: vi.fn() },
    role: { findMany: vi.fn() },
    userRole: { createMany: vi.fn() },
  };
  return {
    tx,
    prisma: { user: { findMany: vi.fn() }, $transaction: vi.fn(async (fn: any) => fn(tx)) } as any,
    rows: [] as any[],
  };
});

vi.mock('../../config/prisma', () => ({ default: m.prisma }));
vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('argon2', () => ({ hash: vi.fn(async () => 'hash') }));
vi.mock('xlsx', () => ({
  readFile: () => ({ SheetNames: ['s'], Sheets: { s: {} } }),
  utils: { sheet_to_json: () => m.rows },
}));

import { processCsvImport } from '../../services/csv-import.service';

const row = (email: string, role: string) => ({ Email: email, Role: role, 'First Name': 'A', 'Last Name': 'B' });
const created = () => (m.tx.user.createMany.mock.calls[0]?.[0]?.data ?? []) as any[];

describe('CSV import role policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.prisma.user.findMany.mockResolvedValue([]);
    m.tx.user.findMany.mockResolvedValue([]);
    m.tx.role.findMany.mockResolvedValue([]);
  });

  it('rejects SUPER_ADMIN and ADMIN rows from an org admin', async () => {
    m.rows = [row('a@x.com', 'SUPER_ADMIN'), row('b@x.com', 'ADMIN'), row('c@x.com', 'ORG_ADMIN'), row('d@x.com', 'TEACHER'), row('e@x.com', 'faculty'), row('f@x.com', 'STUDENT')];
    const r = await processCsvImport('f.csv', 'org1', 'u1', { isSuperAdmin: false });
    expect(created().map((u) => u.email)).toEqual(['d@x.com', 'e@x.com', 'f@x.com']);
    expect(created().map((u) => u.role)).toEqual(['TEACHER', 'TEACHER', 'STUDENT']);
    expect(r.skipped).toBe(3);
    expect(r.errors.map((e) => e.email)).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });

  it('never assigns SUPER_ADMIN, even for a super admin caller', async () => {
    m.rows = [row('a@x.com', 'SUPER_ADMIN'), row('b@x.com', 'ADMIN')];
    const r = await processCsvImport('f.csv', 'org1', 'u1', { isSuperAdmin: true });
    expect(created().map((u) => u.role)).toEqual(['ADMIN']);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].email).toBe('a@x.com');
  });

  it('errors on invalid or empty roles instead of defaulting, and pins organizationId', async () => {
    m.rows = [row('a@x.com', 'wizard'), row('b@x.com', ''), row('c@x.com', 'STUDENT')];
    const r = await processCsvImport('f.csv', 'org1', 'u1', { isSuperAdmin: false });
    expect(r.errors.map((e) => e.email)).toEqual(['a@x.com', 'b@x.com']);
    expect(created()).toHaveLength(1);
    expect(created()[0].organizationId).toBe('org1');
  });

  it('refuses to run without an organization', async () => {
    m.rows = [row('a@x.com', 'STUDENT')];
    await expect(processCsvImport('f.csv', '', 'u1', { isSuperAdmin: false })).rejects.toThrow();
  });
});
