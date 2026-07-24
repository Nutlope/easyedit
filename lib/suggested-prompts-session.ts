export const SUGGESTIONS_RATE_LIMIT_RESET_KEY =
  "easyedit:suggestions-rate-limit-reset";

export function shouldSkipSuggestedPrompts(
  apiKey: string | null,
  storedResetAt: string | null,
  now = Date.now(),
) {
  if (apiKey) return false;
  const resetAt = Number(storedResetAt);
  return Number.isFinite(resetAt) && resetAt > now;
}

export function suggestionResetAtFromResponse(
  resetHeader: string | null,
  now = Date.now(),
) {
  const resetAt = Number(resetHeader);
  return Number.isFinite(resetAt) && resetAt > now
    ? resetAt
    : now + 5 * 60 * 1_000;
}
