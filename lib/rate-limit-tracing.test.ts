import assert from "node:assert/strict";
import test from "node:test";
import { buildQuotaRejectionTrace } from "./rate-limit-tracing";

test("records a metadata-only image-edit quota rejection", () => {
  assert.deepEqual(
    buildQuotaRejectionTrace({
      feature: "image-edit",
      route: "generateImage",
      resetAt: 1_753_456_789_000,
    }),
    {
      metadata: {
        feature: "image-edit",
        route: "generateImage",
        phase: "rate-limit",
        outcome: "quota-rejected",
        success: false,
        byok: false,
        resetAt: 1_753_456_789_000,
      },
    },
  );
});

test("records a metadata-only suggested-prompts quota rejection", () => {
  const trace = buildQuotaRejectionTrace({
    feature: "suggested-prompts",
    route: "/api/suggested-prompts",
    resetAt: 1_753_456_789_000,
  });
  const fieldNames = [
    ...Object.keys(trace),
    ...Object.keys(trace.metadata),
  ].map((field) => field.toLowerCase());

  for (const sensitiveField of [
    "input",
    "prompt",
    "imageurl",
    "apikey",
    "authorization",
    "ipaddress",
  ]) {
    assert.equal(fieldNames.includes(sensitiveField), false);
  }
});
