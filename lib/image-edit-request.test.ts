import assert from "node:assert/strict";
import test from "node:test";
import { requestImageEdit } from "./image-edit-request";

test("bounds a stalled image edit inside the Vercel function budget", async () => {
  const body = { model: "black-forest-labs/FLUX.2-flex" };
  let received:
    | {
        body: typeof body;
        options: { maxRetries: number; timeout: number };
      }
    | undefined;

  const response = await requestImageEdit(async (requestBody, options) => {
    received = { body: requestBody, options };
    return { id: "image-1" };
  }, body);

  assert.deepEqual(response, { id: "image-1" });
  assert.deepEqual(received, {
    body,
    options: {
      maxRetries: 0,
      timeout: 60_000,
    },
  });
});
