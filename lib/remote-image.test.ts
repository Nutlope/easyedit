import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchRemoteImage,
  RemoteImageError,
  validateRemoteImageUrl,
} from "./remote-image";

test("rejects non-HTTPS and private image destinations", async () => {
  for (const url of [
    "data:text/plain,hello",
    "http://localhost/image.png",
    "http://127.0.0.1/image.png",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/image.png",
    "https://attacker.example/image.png",
    "https://abc.execute-api.us-east-1.amazonaws.com/image.png",
  ]) {
    await assert.rejects(
      validateRemoteImageUrl(url),
      (error: unknown) =>
        error instanceof RemoteImageError && error.code === "unsafe_url",
      url,
    );
  }

  await assert.rejects(
    validateRemoteImageUrl("http://api.together.ai/image.png", async () => [
      { address: "93.184.216.34", family: 4 },
    ]),
    (error: unknown) =>
      error instanceof RemoteImageError && error.code === "unsafe_url",
  );
});

test("rejects hostnames that resolve to a private address", async () => {
  await assert.rejects(
    validateRemoteImageUrl("https://api.together.ai/photo.jpg", async () => [
      { address: "10.0.0.2", family: 4 },
    ]),
    (error: unknown) =>
      error instanceof RemoteImageError && error.code === "unsafe_url",
  );
});

test("allows only the app bucket and Together image host", async () => {
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  for (const url of [
    "https://api.together.ai/generated/image.png",
    "https://napkinsdev.s3.us-east-1.amazonaws.com/next-s3-uploads/id/image.png",
  ]) {
    await assert.doesNotReject(validateRemoteImageUrl(url, publicLookup));
  }

  for (const url of [
    "https://s3.us-east-1.amazonaws.com/napkinsdev/image.png",
    "https://another-bucket.s3.us-east-1.amazonaws.com/image.png",
    "https://bucket.s3.amazonaws.com/image.png",
    "https://napkinsdev.s3.us-east-1.amazonaws.com/other/image.png",
    "https://api.together.xyz/generated/image.png",
    "https://ec2.us-east-1.amazonaws.com/image.png",
  ]) {
    await assert.rejects(
      validateRemoteImageUrl(url, publicLookup),
      (error: unknown) =>
        error instanceof RemoteImageError && error.code === "unsafe_url",
      url,
    );
  }
});

test("rejects non-image and oversized responses before decoding", async () => {
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

  await assert.rejects(
    fetchRemoteImage("https://api.together.ai/not-image", {
      lookup: publicLookup,
      fetch: async () =>
        new Response("<html>nope</html>", {
          headers: { "content-type": "text/html" },
        }),
    }),
    (error: unknown) =>
      error instanceof RemoteImageError && error.code === "unsupported_type",
  );

  await assert.rejects(
    fetchRemoteImage("https://api.together.ai/generic-binary", {
      lookup: publicLookup,
      fetch: async () =>
        new Response("not-an-image", {
          headers: { "content-type": "application/octet-stream" },
        }),
    }),
    (error: unknown) =>
      error instanceof RemoteImageError && error.code === "unsupported_type",
  );

  await assert.rejects(
    fetchRemoteImage("https://api.together.ai/huge.jpg", {
      lookup: publicLookup,
      maxBytes: 4,
      fetch: async () =>
        new Response("12345", {
          headers: { "content-type": "image/jpeg" },
        }),
    }),
    (error: unknown) =>
      error instanceof RemoteImageError && error.code === "too_large",
  );
});

test("uses one timeout budget across redirects", async () => {
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const signals: Array<AbortSignal | null | undefined> = [];
  let requestCount = 0;

  await fetchRemoteImage("https://api.together.ai/first.jpg", {
    lookup: publicLookup,
    fetch: async (_input, init) => {
      signals.push(init?.signal);
      requestCount += 1;
      if (requestCount === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: "/second.jpg" },
        });
      }
      return new Response("image", {
        headers: { "content-type": "image/jpeg" },
      });
    },
  });

  assert.equal(signals.length, 2);
  assert.ok(signals[0]);
  assert.equal(signals[0], signals[1]);
});

test("revalidates redirect destinations", async () => {
  const publicLookup = async (hostname: string) => [
    {
      address: hostname === "api.together.ai" ? "93.184.216.34" : "127.0.0.1",
      family: 4,
    },
  ];

  await assert.rejects(
    fetchRemoteImage("https://api.together.ai/photo.jpg", {
      lookup: publicLookup,
      fetch: async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://localhost/private" },
        }),
    }),
    (error: unknown) =>
      error instanceof RemoteImageError && error.code === "unsafe_url",
  );
});
