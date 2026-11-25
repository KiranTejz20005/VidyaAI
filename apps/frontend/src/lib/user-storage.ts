/**
 * Helpers for per-user browser storage. Every key holding user data must be
 * built with `userScopedKey` from a base that starts with `vidya_`, so that
 * one account never reads another account's cached data on a shared browser
 * and `clearUserLocalData()` can wipe it all on logout.
 */

/** Key prefixes holding user data. Legacy (unscoped) prefixes are listed so logout also removes them. */
const USER_DATA_KEY_PREFIXES = ['vidya_', 'vidyaai_notifications', 'obe_'];

export function userScopedKey(base: string, userId: string | null | undefined): string {
  return `${base}:${userId ?? 'anon'}`;
}

export function clearUserLocalData(): void {
  if (typeof window === 'undefined') return;
  try {
    const storage = window.localStorage;
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && USER_DATA_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => storage.removeItem(key));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); nothing to clear then.
  }
}
