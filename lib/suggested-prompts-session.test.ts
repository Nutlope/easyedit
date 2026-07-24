import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldSkipSuggestedPrompts,
  suggestionResetAtFromResponse,
} from "./suggested-prompts-session";

test("a session quota only suppresses free requests until the server reset", () => {
  const now = 1_000;
  assert.equal(shouldSkipSuggestedPrompts(null, "2000", now), true);
  assert.equal(shouldSkipSuggestedPrompts(null, "500", now), false);
  assert.equal(shouldSkipSuggestedPrompts("user-key", "2000", now), false);
});

test("uses the server reset and a short fallback for malformed headers", () => {
  assert.equal(suggestionResetAtFromResponse("2000", 1_000), 2_000);
  assert.equal(
    suggestionResetAtFromResponse(null, 1_000),
    1_000 + 5 * 60 * 1_000,
  );
});
