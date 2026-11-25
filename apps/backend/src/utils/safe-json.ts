import { jsonrepair } from 'jsonrepair';

/** Upper bound on model output we are willing to parse or repair (2 MB of text). */
export const MAX_JSON_INPUT_CHARS = 2 * 1024 * 1024;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class JsonInputTooLargeError extends Error {
  constructor(length: number, max: number) {
    super(`JSON input too large (${length} chars, max ${max})`);
    this.name = 'JsonInputTooLargeError';
  }
}

export function assertJsonInputSize(text: string, max: number = MAX_JSON_INPUT_CHARS): void {
  if (text.length > max) throw new JsonInputTooLargeError(text.length, max);
}

function dropForbiddenKeys(key: string, value: unknown): unknown {
  return FORBIDDEN_KEYS.has(key) ? undefined : value;
}

/**
 * JSON.parse with an input size cap that drops `__proto__`, `constructor` and
 * `prototype` keys at every depth, so model- or user-supplied JSON can never
 * smuggle prototype-polluting keys into later object merges.
 */
export function safeJsonParse<T = unknown>(text: string, max: number = MAX_JSON_INPUT_CHARS): T {
  assertJsonInputSize(text, max);
  return JSON.parse(text, dropForbiddenKeys) as T;
}

/** jsonrepair + safeJsonParse, with the size cap applied before the repair pass. */
export function safeJsonRepairParse<T = unknown>(
  text: string,
  max: number = MAX_JSON_INPUT_CHARS
): { value: T; repairedText: string } {
  assertJsonInputSize(text, max);
  const repairedText = jsonrepair(text);
  // Repair may add quotes/brackets; allow modest growth but never unbounded output.
  return { value: safeJsonParse<T>(repairedText, max * 2), repairedText };
}
