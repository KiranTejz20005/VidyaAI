import { afterEach, vi } from 'vitest';
import { openInNewTab, safeHref } from '../safe-href';

describe('safeHref', () => {
  it.each([
    'https://example.com/a?b=c#d',
    'http://example.com',
    'HTTPS://EXAMPLE.COM',
    'mailto:teacher@example.com',
    '/student/dashboard',
    './relative',
    '../up',
    '#section',
    '?page=2',
    'docs/readme',
    '//cdn.example.com/file.pdf',
  ])('allows %s', (url) => {
    expect(safeHref(url)).toBe(url);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)',
    '\u0000javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://example.com/uuid',
    '\\evil.example.com',
    '',
    '   ',
  ])('rejects %j', (url) => {
    expect(safeHref(url)).toBeUndefined();
  });

  it('rejects non-string input', () => {
    expect(safeHref(undefined)).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
    expect(safeHref(42)).toBeUndefined();
    expect(safeHref({ href: 'https://example.com' })).toBeUndefined();
  });

  it('strips leading whitespace from allowed URLs', () => {
    expect(safeHref('  https://example.com ')).toBe('https://example.com');
  });

  it('allows blob: URLs only when opted in', () => {
    expect(safeHref('blob:https://example.com/uuid', { allowBlob: true })).toBe(
      'blob:https://example.com/uuid'
    );
    expect(safeHref('javascript:alert(1)', { allowBlob: true })).toBeUndefined();
  });
});

describe('openInNewTab', () => {
  const open = vi.fn();

  afterEach(() => {
    open.mockReset();
    vi.unstubAllGlobals();
  });

  it('opens safe URLs without opener access', () => {
    vi.stubGlobal('window', { open });
    openInNewTab('https://example.com');
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
  });

  it('does nothing for unsafe URLs', () => {
    vi.stubGlobal('window', { open });
    openInNewTab('javascript:alert(1)');
    expect(open).not.toHaveBeenCalled();
  });
});
