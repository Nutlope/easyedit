import assert from "node:assert/strict";
import test from "node:test";
import { parseUserAPIKey } from "./user-api-key";

test("treats missing or blank keys as no key", () => {
  assert.deepEqual(parseUserAPIKey(null), { ok: true, key: null });
  assert.deepEqual(parseUserAPIKey(undefined), { ok: true, key: null });
  assert.deepEqual(parseUserAPIKey("   "), { ok: true, key: null });
});

test("trims well-formed keys", () => {
  assert.deepEqual(parseUserAPIKey("  tgp_v1_abc123  "), {
    ok: true,
    key: "tgp_v1_abc123",
  });
});

test("rejects malformed keys", () => {
  assert.deepEqual(parseUserAPIKey("a".repeat(257)), { ok: false });
  assert.deepEqual(parseUserAPIKey("abc def"), { ok: false });
  assert.deepEqual(parseUserAPIKey("abc\u0000"), { ok: false });
  assert.deepEqual(parseUserAPIKey("clé"), { ok: false });
  assert.deepEqual(parseUserAPIKey(42), { ok: false });
});

test("accepts keys up to 256 characters", () => {
  assert.equal(parseUserAPIKey("a".repeat(256)).ok, true);
});
