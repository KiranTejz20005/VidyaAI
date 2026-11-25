import { LOCAL_API_ORIGIN, PUBLIC_API_URL, PUBLIC_SOCKET_URL } from '@/config/public-env';

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

  return `${LOCAL_API_ORIGIN}/api/v1`;
}

/** Server origin of the API (scheme + host + port, no /api or /api/vN suffix). */
export function resolveApiServerOrigin(): string {
  return stripApiPath(resolveApiOrigin());
}

function stripApiPath(url: string): string {
  return url.replace(/\/+$/, '').replace(/\/api(?:\/v\d+)?$/, '');
}

export function resolveSocketUrl(): string {
  // socket.io treats a URL path as a namespace, so connect to the bare server origin.
  const fromEnv =
    normalizeEnvUrl(PUBLIC_SOCKET_URL) ?? normalizeEnvUrl(PUBLIC_API_URL);
  if (fromEnv) return stripApiPath(fromEnv);

  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    if (!isLocalDevHost(hostname)) {
      return normalizeBaseUrl(origin);
    }
  }

  return LOCAL_API_ORIGIN;
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
        // Uploads are served by the API server, never proxied onto the frontend origin.
        if (url.pathname.includes('/uploads/')) {
          const subpath = url.pathname.slice(url.pathname.indexOf('/uploads/'));
          return joinUrl(uploadsOrigin(apiOrigin), subpath + url.search);
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
    return joinUrl(uploadsOrigin(apiOrigin), `/uploads/${afterUploads}`);
  }

  // Windows absolute path without "uploads" folder (e.g. C:\file.png)
  if (/^[a-zA-Z]:[/\\]/.test(trimmed)) {
    const filename = normalizedSlashes.split('/').pop() || trimmed;
    return joinUrl(uploadsOrigin(apiOrigin), `/uploads/${filename}`);
  }

  // Plain filename without slashes (e.g. c68be5e5745a02cb65ecc91a.png)
  if (!normalizedSlashes.includes('/') && /\.(png|jpe?g|webp|gif|svg|pdf|docx?|txt)$/i.test(normalizedSlashes)) {
    return joinUrl(uploadsOrigin(apiOrigin), `/uploads/${normalizedSlashes}`);
  }

  const origin = apiOrigin ?? resolveApiOrigin();
  return joinUrl(origin, trimmed);
}


function uploadsOrigin(apiOrigin?: string): string {
  return stripApiPath(apiOrigin ?? resolveApiOrigin());
}
