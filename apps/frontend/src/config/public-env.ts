/**
 * Public env vars MUST use literal `process.env.NEXT_PUBLIC_*` access.
 * Dynamic `process.env[name]` is NOT inlined by Next.js and is always undefined in the browser.
 */
export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL;
export const PUBLIC_SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;

/** Local backend used when NEXT_PUBLIC_API_URL is unset outside production builds. */
export const LOCAL_API_ORIGIN = 'http://localhost:3001';
