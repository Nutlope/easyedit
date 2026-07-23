import assert from "node:assert/strict";
import test from "node:test";
import {
  buildImageEditTraceStart,
  buildImageEditTraceSuccess,
  estimateImageEditCost,
} from "./image-edit-tracing";
import { serializeBraintrustError } from "./trace-safety";

test("records safe image-edit inputs without source image data or API keys", () => {
  const trace = buildImageEditTraceStart({
    prompt: "Make the sky pink",
    model: "black-forest-labs/FLUX.2-flex",
    requestedWidth: 1600,
    requestedHeight: 1200,
    width: 1024,
    height: 768,
    byok: true,
  });
  const serialized = JSON.stringify(trace);

  assert.equal(trace.metadata.byok, true);
  assert.equal(trace.metadata.hasSourceImage, true);
  assert.equal(trace.metadata.width, 1024);
  assert.equal(trace.metadata.height, 768);
  assert.equal(serialized.includes("userAPIKey"), false);
  assert.equal(serialized.includes("imageUrl"), false);
  assert.equal(serialized.includes("base64"), false);
});

test("records the returned image URL, usage, latency, and fixed image cost", () => {
  const imagePayload = "base64-image-payload";
  const trace = buildImageEditTraceSuccess(
    {
      id: "response-1",
      model: "black-forest-labs/FLUX.2-flex",
      object: "list",
      usage: {
        credits: 0.03,
        nested: {
          image_url: "https://private.example/source.png",
          b64_json: imagePayload,
          images: 1,
        },
      },
      data: [
        {
          url: "https://api.together.ai/generated/output.png",
          b64_json: imagePayload,
          timings: { inference: 1.25 },
        },
      ],
    },
    "black-forest-labs/FLUX.2-flex",
    1420,
    1300,
  );
  const serialized = JSON.stringify(trace);

  assert.deepEqual(trace.output, {
    imageCount: 1,
    imageUrl: "https://api.together.ai/generated/output.png",
    responseId: "response-1",
    responseModel: "black-forest-labs/FLUX.2-flex",
    responseObject: "list",
  });
  assert.deepEqual(trace.metadata.usage, {
    credits: 0.03,
    nested: { images: 1 },
  });
  assert.deepEqual(trace.metadata.cost, {
    currency: "USD",
    pricingUnit: "image",
    estimatedCost: 0.03,
    pricePerImage: 0.03,
    imageCount: 1,
  });
  assert.equal(trace.metrics.duration_ms, 1420);
  assert.equal(trace.metrics.provider_duration_ms, 1300);
  assert.equal(trace.metrics.inference_ms, 1250);
  assert.equal(trace.metrics.estimated_cost, 0.03);
  assert.equal(serialized.includes(imagePayload), false);
  assert.equal(serialized.includes("b64_json"), false);
  assert.equal(serialized.includes("private.example"), false);
});

test("does not trace a data URL returned as an image URL", () => {
  const trace = buildImageEditTraceSuccess(
    {
      data: [{ url: "data:image/png;base64,secret-image-bytes" }],
    },
    "black-forest-labs/FLUX.2-pro",
    100,
    90,
  );

  assert.equal(trace.output.imageUrl, null);
  assert.equal(JSON.stringify(trace).includes("secret-image-bytes"), false);
});

test("estimates both configured image models at the current per-image rate", () => {
  assert.deepEqual(estimateImageEditCost("black-forest-labs/FLUX.2-flex", 2), {
    estimatedCost: 0.06,
    pricePerImage: 0.03,
    imageCount: 2,
  });
  assert.deepEqual(estimateImageEditCost("black-forest-labs/FLUX.2-pro", 1), {
    estimatedCost: 0.03,
    pricePerImage: 0.03,
    imageCount: 1,
  });
});

test("redacts BYOK secrets and source image URLs from provider errors", () => {
  const secret = "together-secret-key";
  const sourceImage = "data:image/png;base64,private-source-image";
  const error = new Error(`Provider rejected ${secret} for ${sourceImage}`);
  const serialized = JSON.stringify(
    serializeBraintrustError(error, [secret, sourceImage]),
  );

  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes(sourceImage), false);
  assert.equal(serialized.includes("[REDACTED]"), true);
});
