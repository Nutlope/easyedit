import assert from "node:assert/strict";
import test from "node:test";
import Together from "together-ai";
import { requestImageEdit } from "./image-edit-request";

const body = {
  model: "black-forest-labs/FLUX.2-flex",
  prompt: "Make the background blue",
};

function retryableClient(onRequest: () => void) {
  return new Together({
    apiKey: "test-key",
    fetch: async () => {
      onRequest();
      return new Response(
        JSON.stringify({
          error: { message: "Service unavailable", type: "server_error" },
        }),
        {
          status: 503,
          headers: {
            "content-type": "application/json",
            "retry-after-ms": "1",
          },
        },
      );
    },
  });
}

test("Together retries a retryable image failure six times by default", async () => {
  let attempts = 0;
  const together = retryableClient(() => {
    attempts += 1;
  });

  await assert.rejects(together.images.create(body), {
    status: 503,
  });
  assert.equal(attempts, 6);
});

test("image edits disable Together retries at the provider boundary", async () => {
  let attempts = 0;
  const together = retryableClient(() => {
    attempts += 1;
  });

  await assert.rejects(requestImageEdit(together, body), {
    status: 503,
  });
  assert.equal(attempts, 1);
});
