import { DEFAULT_API_ORIGIN, PUBLIC_API_URL, PUBLIC_SOCKET_URL } from '@/config/public-env';

function isLocalDevHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function normalizeEnvUrl(raw: string | undefined): string | undefined {
  if (!raw || raw === 'undefined' || !raw.trim()) return undefined;
  return normalizeBaseUrl(raw.trim());
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function normalizeBaseUrl(value: string): string {
  let normalized = value.trim().replace(/\/+$/, '');
  if (normalized.endsWith('/api')) {
    normalized = normalized.slice(0, -4);
  }
  return normalized;
}

/**
 * API origin (no /api suffix).
 * Uses literal NEXT_PUBLIC_* inlining via public-env.ts — never dynamic process.env[key].
 */
export function resolveApiOrigin(): string {
  const fromEnv = normalizeEnvUrl(PUBLIC_API_URL);
  if (fromEnv) return fromEnv;

  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    if (!isLocalDevHost(hostname)) {
      return normalizeBaseUrl(origin);
    }
  }

  if (process.env.NODE_ENV === 'development') {
    const localFallback = `http://localhost:3001/api/v1`;
    console.info('[VidyaAI] No API origin configured — using local fallback:', localFallback);
    return localFallback;
  }

  return DEFAULT_API_ORIGIN;
}

export function resolveSocketUrl(): string {
  const fromEnv =
    normalizeEnvUrl(PUBLIC_SOCKET_URL) ?? normalizeEnvUrl(PUBLIC_API_URL);
  if (fromEnv) return fromEnv;

  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    if (!isLocalDevHost(hostname)) {
      return normalizeBaseUrl(origin);
    }
  }

  return DEFAULT_API_ORIGIN;
}

export function resolveAssetUrl(path: string, apiOrigin?: string): string {
  if (!path || typeof path !== 'string') return '';
  const trimmed = path.trim();
  if (!trimmed) return '';

  // Data or blob URLs
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  // Handle absolute HTTP/HTTPS URLs (including Cloudflare R2, S3, CDN)
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (isLocalDevHost(url.hostname)) {
        // If it points to an uploads path on localhost, use relative /uploads for same-origin proxy
        if (url.pathname.includes('/uploads/')) {
          const subpath = url.pathname.slice(url.pathname.indexOf('/uploads/'));
          return subpath + url.search;
        }
        const origin = apiOrigin ?? resolveApiOrigin();
        return joinUrl(origin, url.pathname + url.search);
      }
      return trimmed;
    } catch {
      return trimmed;
    }
  }

  // Normalize Windows paths containing "uploads" (e.g. C:\...\uploads\file.png)
  const normalizedSlashes = trimmed.replace(/\\/g, '/');
  const uploadsIndex = normalizedSlashes.toLowerCase().indexOf('uploads/');
  if (uploadsIndex !== -1) {
    const afterUploads = normalizedSlashes.substring(uploadsIndex + 'uploads/'.length);
    return `/uploads/${afterUploads}`;
  }

  // Windows absolute path without "uploads" folder (e.g. C:\file.png)
  if (/^[a-zA-Z]:[/\\]/.test(trimmed)) {
    const filename = normalizedSlashes.split('/').pop() || trimmed;
    return `/uploads/${filename}`;
  }

  // Plain filename without slashes (e.g. c68be5e5745a02cb65ecc91a.png)
  if (!normalizedSlashes.includes('/') && /\.(png|jpe?g|webp|gif|svg|pdf|docx?|txt)$/i.test(normalizedSlashes)) {
    return `/uploads/${normalizedSlashes}`;
  }

  // Already a root-relative uploads path
  if (normalizedSlashes.startsWith('/uploads/')) {
    return normalizedSlashes;
  }

  const origin = apiOrigin ?? resolveApiOrigin();
  return joinUrl(origin, trimmed);
}

