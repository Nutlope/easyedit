export const MAX_USER_API_KEY_LENGTH = 256;

const PRINTABLE_KEY = /^[\x21-\x7e]+$/;

export type UserAPIKeyResult = { ok: true; key: string | null } | { ok: false };

/**
 * Normalizes a caller-supplied Together API key. Missing or blank values mean
 * "no key"; anything else must be printable ASCII without whitespace and at
 * most 256 characters, otherwise it is rejected rather than ignored.
 */
export function parseUserAPIKey(raw: unknown): UserAPIKeyResult {
  if (raw === null || raw === undefined) return { ok: true, key: null };
  if (typeof raw !== "string") return { ok: false };

  const key = raw.trim();
  if (!key) return { ok: true, key: null };
  if (key.length > MAX_USER_API_KEY_LENGTH || !PRINTABLE_KEY.test(key)) {
    return { ok: false };
  }
  return { ok: true, key };
}
