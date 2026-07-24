import assert from "node:assert/strict";
import test from "node:test";
import { RemoteImageError } from "./remote-image";
import {
  compressImageBuffer,
  suggestedPromptsSchema,
} from "./suggested-prompts";

test("turns corrupt image data into a classified decode failure", async () => {
  await assert.rejects(
    compressImageBuffer(Buffer.from("not an image")),
    (error: unknown) =>
      error instanceof RemoteImageError && error.code === "decode_failed",
  );
});

test("requires exactly three bounded suggested prompts", () => {
  assert.equal(
    suggestedPromptsSchema.safeParse(["one", "two", "three"]).success,
    true,
  );
  assert.equal(suggestedPromptsSchema.safeParse(["one", "two"]).success, false);
  assert.equal(
    suggestedPromptsSchema.safeParse(["one", "two", "x".repeat(121)]).success,
    false,
  );
});
