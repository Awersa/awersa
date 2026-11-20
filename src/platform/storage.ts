/**
 * Safe localStorage wrapper. Storage can be missing, full, or blocked (private mode), and anything
 * read back is untrusted (the user — or another script on the same origin — can edit it), so every
 * read is parsed in try/catch, size-limited and validated before use.
 */
const PREFIX = 'clashduel.';
const MAX_BYTES = 256 * 1024;

export function loadJson<T>(key: string, validate: (v: unknown) => v is T, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    if (raw == null || raw.length > MAX_BYTES) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): boolean {
  try {
    const raw = JSON.stringify(value);
    if (raw.length > MAX_BYTES) return false;
    globalThis.localStorage?.setItem(PREFIX + key, raw);
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    globalThis.localStorage?.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
