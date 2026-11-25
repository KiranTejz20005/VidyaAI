import { env } from '../../config/env';

/**
 * Hard ceiling for a single provider HTTP call. Callers (the orchestrator) use
 * tighter per-attempt budgets; this guarantees no provider request can hang
 * indefinitely even when invoked without an upstream signal.
 */
export const PROVIDER_REQUEST_TIMEOUT_MS = Math.max(60_000, env.AI_PRIMARY_TIMEOUT_MS);

/** SDK client defaults: bounded timeout and a single retry. */
export const PROVIDER_SDK_CLIENT_OPTIONS = {
  timeout: PROVIDER_REQUEST_TIMEOUT_MS,
  maxRetries: 1,
} as const;

/**
 * Combines the caller's cancellation signal (e.g. tutor socket disconnect)
 * with the provider timeout so the underlying fetch/SDK call is actually aborted.
 */
export function providerSignal(signal?: AbortSignal, timeoutMs: number = PROVIDER_REQUEST_TIMEOUT_MS): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
