import assert from "node:assert/strict";
import test from "node:test";
import {
  requestSuggestedPrompts,
  SUGGESTED_PROMPTS_REQUEST_OPTIONS,
  type CreateSuggestedPromptsCompletion,
} from "./suggested-prompts-request";

const VALID_SUGGESTIONS = JSON.stringify([
  "Add a stronger page title",
  "Increase the button contrast",
  "Add helpful field placeholders",
]);

test("uses the fast primary with a zero-retry 2.5 second budget", async () => {
  const calls: Array<{ model: unknown; options: unknown }> = [];
  const createCompletion: CreateSuggestedPromptsCompletion = async (
    body,
    options,
  ) => {
    calls.push({ model: body.model, options });
    return { choices: [{ message: { content: VALID_SUGGESTIONS } }] };
  };

  const result = await requestSuggestedPrompts({
    imageUrl: "data:image/jpeg;base64,image",
    createCompletion,
  });

  assert.deepEqual(result.suggestions, JSON.parse(VALID_SUGGESTIONS));
  assert.equal(result.model, "Qwen/Qwen3.5-9B");
  assert.deepEqual(result.failedAttempts, []);
  assert.deepEqual(calls, [
    {
      model: "Qwen/Qwen3.5-9B",
      options: SUGGESTED_PROMPTS_REQUEST_OPTIONS,
    },
  ]);
});

test("falls back to Kimi after a transient Qwen timeout", async () => {
  const calls: Array<{ model: unknown; options: unknown }> = [];
  const createCompletion: CreateSuggestedPromptsCompletion = async (
    body,
    options,
  ) => {
    calls.push({ model: body.model, options });
    if (body.model === "Qwen/Qwen3.5-9B") {
      throw new Error("Request timed out.");
    }
    return { choices: [{ message: { content: VALID_SUGGESTIONS } }] };
  };

  const result = await requestSuggestedPrompts({
    imageUrl: "data:image/jpeg;base64,image",
    createCompletion,
  });

  assert.equal(result.model, "moonshotai/Kimi-K2.7-Code");
  assert.deepEqual(result.failedAttempts, [
    { model: "Qwen/Qwen3.5-9B", failureKind: "transient" },
  ]);
  assert.deepEqual(
    calls.map((call) => call.model),
    ["Qwen/Qwen3.5-9B", "moonshotai/Kimi-K2.7-Code"],
  );
  assert.ok(
    calls.every((call) => call.options === SUGGESTED_PROMPTS_REQUEST_OPTIONS),
  );
});

test("falls back when the primary returns invalid structured output", async () => {
  const createCompletion: CreateSuggestedPromptsCompletion = async (body) => ({
    choices: [
      {
        message: {
          content:
            body.model === "Qwen/Qwen3.5-9B" ? "not-json" : VALID_SUGGESTIONS,
        },
      },
    ],
  });

  const result = await requestSuggestedPrompts({
    imageUrl: "data:image/jpeg;base64,image",
    createCompletion,
  });

  assert.equal(result.model, "moonshotai/Kimi-K2.7-Code");
  assert.deepEqual(result.failedAttempts, [
    { model: "Qwen/Qwen3.5-9B", failureKind: "invalid_output" },
  ]);
});

test("does not retry an invalid API key on another model", async () => {
  let calls = 0;
  const createCompletion: CreateSuggestedPromptsCompletion = async () => {
    calls += 1;
    throw Object.assign(new Error("Invalid API key"), { status: 401 });
  };

  const result = await requestSuggestedPrompts({
    imageUrl: "data:image/jpeg;base64,image",
    createCompletion,
  });

  assert.equal(calls, 1);
  assert.deepEqual(result, {
    suggestions: [],
    model: null,
    failedAttempts: [{ model: "Qwen/Qwen3.5-9B", failureKind: "invalid_key" }],
  });
});
