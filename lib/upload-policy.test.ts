import assert from "node:assert/strict";
import test from "node:test";
import { MAX_UPLOAD_BYTES } from "./upload-limits";
import { createUploadKey, parseUploadRequest } from "./upload-policy";

test("accepts allowlisted image uploads within the size limit", () => {
  assert.deepEqual(
    parseUploadRequest({
      filename: "../../evil.html",
      filetype: "image/PNG",
      filesize: 1_024,
      _nextS3: { strategy: "aws-sdk" },
    }),
    { contentType: "image/png", contentLength: 1_024 },
  );
});

test("rejects non-image, oversized, or missing sizes", () => {
  for (const body of [
    { filetype: "text/html", filesize: 10 },
    { filetype: "image/svg+xml", filesize: 10 },
    { filetype: "image/png", filesize: MAX_UPLOAD_BYTES + 1 },
    { filetype: "image/png", filesize: 0 },
    { filetype: "image/png", filesize: 1.5 },
    { filetype: "image/png" },
    { filetype: "toString", filesize: 10 },
    null,
  ]) {
    assert.equal(parseUploadRequest(body), null, JSON.stringify(body));
  }
});

test("builds server-chosen keys under the upload prefix", () => {
  assert.equal(
    createUploadKey("image/jpeg", "abc"),
    "next-s3-uploads/abc/image.jpg",
  );
  assert.match(
    createUploadKey("image/webp"),
    /^next-s3-uploads\/[0-9a-f-]{36}\/image\.webp$/,
  );
});
