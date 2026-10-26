import assert from "node:assert/strict";
import test from "node:test";
import { checkRateLimits, resolveLimiterMode } from "./rate-limit-policy";

test("requires Upstash in production", () => {
  assert.equal(resolveLimiterMode({ NODE_ENV: "production" }), "missing");
  assert.equal(
    resolveLimiterMode({
      NODE_ENV: "production",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    }),
    "missing",
  );
  assert.equal(
    resolveLimiterMode({
      NODE_ENV: "production",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token",
    }),
    "upstash",
  );
  assert.equal(
    resolveLimiterMode({
      NODE_ENV: "production",
      KV_REST_API_URL: "https://example.upstash.io",
      KV_REST_API_TOKEN: "token",
    }),
    "upstash",
  );
  assert.equal(resolveLimiterMode({ NODE_ENV: "development" }), "disabled");
});

test("keeps the original daily quota keys", async () => {
  const calls: string[] = [];
  const decision = await checkRateLimits(
    async (bucket, identifier) => {
      calls.push(`${bucket}:${identifier}`);
      return { success: true, reset: 0 };
    },
    ["imageEditBurst", "imageEditQuota", "suggestionsQuota"],
    "198.51.100.7",
  );
  assert.deepEqual(decision, { status: "ok" });
  assert.deepEqual(calls, [
    "imageEditBurst:198.51.100.7",
    "imageEditQuota:198.51.100.7",
    "suggestionsQuota:198.51.100.7-suggestions",
  ]);
});

test("stops at the first exhausted bucket", async () => {
  const calls: string[] = [];
  const decision = await checkRateLimits(
    async (bucket) => {
      calls.push(bucket);
      return { success: bucket !== "uploadBurst", reset: 123 };
    },
    ["uploadBurst", "uploadDaily"],
    "ip",
  );
  assert.deepEqual(decision, { status: "limited", resetAt: 123 });
  assert.deepEqual(calls, ["uploadBurst"]);
});

test("fails closed on backend errors", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const decision = await checkRateLimits(
      async () => {
        throw new Error("redis down");
      },
      ["imageEditQuota"],
      "ip",
    );
    assert.deepEqual(decision, { status: "unavailable" });
  } finally {
    console.error = originalError;
  }
});

test("fails closed when the backend hangs", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const decision = await checkRateLimits(
      () => new Promise(() => {}),
      ["suggestionsQuota"],
      "ip",
      10,
    );
    assert.deepEqual(decision, { status: "unavailable" });
  } finally {
    console.error = originalError;
  }
});
