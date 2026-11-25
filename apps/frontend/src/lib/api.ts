'use client';

import axios, { type InternalAxiosRequestConfig } from 'axios';
import { joinUrl, resolveApiOrigin } from '@/utils/url';
import {
  createSingleFlight,
  isPasswordResetRequiredResponse,
  readCookie,
  shouldRefreshOn401,
} from '@/lib/auth-http';

const isApiDebugEnabled = process.env.NODE_ENV === 'development';

const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'X-CSRF-Token';
const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/'];

type RetriableConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  metadata?: { startedAt: number };
};

function getBaseURL(): string {
  const origin = resolveApiOrigin();
  return origin.endsWith('/api/v1') ? origin : `${origin}/api/v1`;
}

export const api = axios.create({
  withCredentials: true,
  timeout: 180000,
  headers: {
    'Content-Type': 'application/json',
  },
  xsrfCookieName: CSRF_COOKIE,
  xsrfHeaderName: CSRF_HEADER,
});

let _accessToken: string | null = null;
export const setApiToken = (token: string | null) => {
  _accessToken = token;
};
export const getApiToken = () => _accessToken;

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  return readCookie(document.cookie, CSRF_COOKIE);
}

let csrfPromise: Promise<void> | null = null;
async function ensureCsrfToken(): Promise<void> {
  if (typeof document === 'undefined' || getCsrfTokenFromCookie()) return;
  if (!csrfPromise) {
    csrfPromise = axios
      .get(joinUrl(getBaseURL(), '/auth/public-organizations'), { withCredentials: true })
      .then(() => undefined)
      .catch((err: unknown) => {
        if (isApiDebugEnabled) {
          console.warn('[API] CSRF cookie seeding failed', err instanceof Error ? err.message : err);
        }
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  await csrfPromise;
}

/**
 * Exchanges the httpOnly refresh cookie for a new access token. Concurrent
 * callers (parallel 401s, app bootstrap) share a single network request.
 */
export const refreshAccessToken = createSingleFlight(async (): Promise<string> => {
  await ensureCsrfToken();
  const csrfToken = getCsrfTokenFromCookie();
  const res = await axios.post(
    joinUrl(getBaseURL(), '/auth/refresh'),
    {},
    {
      withCredentials: true,
      headers: csrfToken ? { [CSRF_HEADER]: csrfToken } : {},
    },
  );
  const token: unknown = res.data?.data?.accessToken;
  if (typeof token !== 'string' || !token) {
    throw new Error('No access token returned from refresh');
  }
  setApiToken(token);
  const { useAuthStore } = await import('@/store/auth.store');
  useAuthStore.setState({ accessToken: token });
  return token;
});

async function endSession(): Promise<void> {
  try {
    const { useAuthStore } = await import('@/store/auth.store');
    useAuthStore.getState().clearAuth();
  } catch (err) {
    if (isApiDebugEnabled) console.warn('[API] Failed to clear auth state', err);
  }
  if (typeof window !== 'undefined' && !PUBLIC_PATHS.includes(window.location.pathname)) {
    window.location.href = '/login';
  }
}

api.interceptors.request.use(async (config: RetriableConfig) => {
  config.baseURL = getBaseURL();

  if (
    typeof document !== 'undefined' &&
    config.method &&
    ['post', 'put', 'patch', 'delete'].includes(config.method.toLowerCase())
  ) {
    await ensureCsrfToken();
    const token = getCsrfTokenFromCookie();
    if (token) {
      config.headers[CSRF_HEADER] = token;
    }
  }

  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }

  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  config.metadata = { startedAt: Date.now() };

  if (isApiDebugEnabled) {
    console.log('[API REQUEST]', {
      method: config.method?.toUpperCase() ?? 'GET',
      endpoint: config.url ?? '',
    });
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    if (isApiDebugEnabled) {
      const startedAt = (response.config as RetriableConfig).metadata?.startedAt;
      console.log('[API RESPONSE]', {
        method: response.config.method?.toUpperCase() ?? 'GET',
        status: response.status,
        url: response.config.url,
        durationMs: typeof startedAt === 'number' ? Date.now() - startedAt : undefined,
      });
    }
    return response;
  },
  async (error) => {
    if (!axios.isAxiosError(error)) {
      if (isApiDebugEnabled) {
        console.warn('[API ERROR]', { message: error instanceof Error ? error.message : String(error) });
      }
      return Promise.reject(error);
    }

    const status = error.response?.status;
    const data = error.response?.data as { error?: string; message?: string } | undefined;
    let message = data?.error ?? data?.message ?? error.message ?? 'An unexpected error occurred';

    if (error.code === 'ERR_NETWORK' || message === 'Network Error') {
      message = 'Server unavailable. Please check your internet connection or try again later.';
    }

    if (isApiDebugEnabled) {
      console.warn('[API ERROR]', {
        status,
        method: error.config?.method?.toUpperCase(),
        endpoint: error.config?.url,
        code: error.code,
      });
    }

    const originalRequest = error.config as RetriableConfig | undefined;

    if (isPasswordResetRequiredResponse(status, error.response?.data)) {
      const { useAuthStore } = await import('@/store/auth.store');
      useAuthStore.getState().markPasswordResetRequired();
      return Promise.reject(new Error(message));
    }

    if (status === 401 && originalRequest && shouldRefreshOn401(originalRequest)) {
      originalRequest._retry = true;
      let token: string;
      try {
        token = await refreshAccessToken();
      } catch {
        await endSession();
        return Promise.reject(new Error('Session expired. Please log in again.'));
      }
      originalRequest.headers.Authorization = `Bearer ${token}`;
      return api(originalRequest);
    }

    if (status === 401 && originalRequest?._retry) {
      await endSession();
    }

    return Promise.reject(new Error(message));
  },
);

export function getApiOrigin(): string {
  return resolveApiOrigin();
}

export function getApiBaseUrl(): string {
  return getBaseURL();
}
