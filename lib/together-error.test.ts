import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyTogetherError,
  isExpectedTogetherRejection,
  withImageEditRetry,
} from "./together-error";

test("classifies actionable Together failures", () => {
  assert.equal(
    classifyTogetherError(
      new Error(
        '400 {"error":{"message":"blocked","code":"content_policy_violation"}}',
      ),
    ).kind,
    "moderation",
  );
  assert.equal(
    classifyTogetherError(new Error('402 {"error":{"type":"credit_limit"}}'))
      .kind,
    "insufficient_credits",
  );
  assert.equal(
    classifyTogetherError(new Error('401 {"error":{"code":"invalid_api_key"}}'))
      .kind,
    "invalid_key",
  );
  assert.equal(
    classifyTogetherError(new Error("Connection error.")).kind,
    "transient",
  );
  assert.equal(
    classifyTogetherError(
      Object.assign(new Error("Unprocessable entity"), {
        status: 422,
        error: { code: "invalid_request", type: "invalid_request_error" },
      }),
    ).kind,
    "invalid_request",
  );
  assert.equal(
    classifyTogetherError(
      Object.assign(new Error("Rejected"), {
        status: 400,
        error: { code: "content_policy_violation" },
      }),
    ).kind,
    "moderation",
  );
});

test("keeps expected provider rejections out of error-level logging", () => {
  for (const kind of [
    "moderation",
    "invalid_request",
    "forbidden",
    "insufficient_credits",
    "invalid_key",
    "rate_limit",
  ] as const) {
    assert.equal(isExpectedTogetherRejection(kind), true);
  }
  assert.equal(isExpectedTogetherRejection("transient"), false);
  assert.equal(isExpectedTogetherRejection("unknown"), false);
});

test("retries one locally-valid inconsistent dimension rejection", async () => {
  let attempts = 0;
  const delays: number[] = [];
  const result = await withImageEditRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error(
          "400 Invalid value for 'width' parameter. Image width must be an integer value between 256 and 2048, in multiples of 16.",
        );
      }
      return "ok";
    },
    {
      dimensionsAreValid: true,
      sleep: async (delay) => {
        delays.push(delay);
      },
    },
  );

  assert.equal(result.value, "ok");
  assert.equal(result.retries, 1);
  assert.equal(attempts, 2);
  assert.equal(delays.length, 1);
});

test("does not retry moderation, rate limits, or locally-invalid dimensions", async () => {
  for (const scenario of [
    {
      error: new Error('400 {"error":{"code":"content_policy_violation"}}'),
      dimensionsAreValid: true,
    },
    {
      error: new Error("400 Invalid value for 'width' parameter."),
      dimensionsAreValid: false,
    },
    {
      error: new Error("429 Rate limit exceeded"),
      dimensionsAreValid: true,
    },
    {
      error: Object.assign(new Error("An error has occurred"), { status: 422 }),
      dimensionsAreValid: true,
    },
  ]) {
    let attempts = 0;
    await assert.rejects(
      withImageEditRetry(
        async () => {
          attempts += 1;
          throw scenario.error;
        },
        {
          dimensionsAreValid: scenario.dimensionsAreValid,
          sleep: async () => undefined,
        },
      ),
    );
    assert.equal(attempts, 1);
  }
});
