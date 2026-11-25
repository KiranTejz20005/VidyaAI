const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:']);
const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/i;
const LEADING_JUNK = /^[\u0000- \u007f-\u009f]+/;
const EMBEDDED_CONTROL = /[\u0000-\u001f\u007f]/g;

export interface SafeHrefOptions {
  /** Also allow `blob:` URLs (object URLs created by this page). */
  allowBlob?: boolean;
}

/**
 * Returns the URL if it is safe to use as a link target, otherwise undefined.
 * Allows http:, https:, mailto: (and blob: when opted in) plus relative URLs
 * (`/path`, `./path`, `../path`, `#hash`, `?query`, `path`). Rejects
 * javascript:, data:, vbscript: and every other scheme.
 */
export function safeHref(url: unknown, options: SafeHrefOptions = {}): string | undefined {
  if (typeof url !== 'string') return undefined;

  const trimmed = url.replace(LEADING_JUNK, '').trimEnd();
  if (!trimmed) return undefined;

  // Browsers drop tabs/newlines inside URLs, so `java\tscript:` must be judged without them.
  const normalized = trimmed.replace(EMBEDDED_CONTROL, '');
  if (normalized.startsWith('\\')) return undefined;

  if (normalized.startsWith('//')) {
    try {
      const resolved = new URL(`https:${normalized}`);
      return resolved.hostname ? normalized : undefined;
    } catch {
      return undefined;
    }
  }

  const schemeMatch = normalized.match(SCHEME_PATTERN);
  if (!schemeMatch) {
    return normalized;
  }

  const scheme = `${schemeMatch[1].toLowerCase()}:`;
  if (ALLOWED_SCHEMES.has(scheme) || (options.allowBlob && scheme === 'blob:')) {
    return normalized;
  }
  return undefined;
}

/** Opens a vetted URL in a new tab without giving it access to `window.opener`. */
export function openInNewTab(url: unknown, options: SafeHrefOptions = {}): void {
  if (typeof window === 'undefined') return;
  const safe = safeHref(url, options);
  if (!safe) return;
  window.open(safe, '_blank', 'noopener,noreferrer');
}
