import assert from "node:assert/strict";
import test from "node:test";
import { getClientIp, normalizeIp } from "./client-ip";

const headersOf = (values: Record<string, string>) => new Headers(values);

test("prefers x-real-ip over a spoofed x-forwarded-for", () => {
  assert.equal(
    getClientIp(
      headersOf({
        "x-real-ip": "198.51.100.7",
        "x-forwarded-for": "203.0.113.1",
      }),
      { VERCEL: "1" },
    ),
    "198.51.100.7",
  );
});

test("falls back to x-vercel-forwarded-for", () => {
  assert.equal(
    getClientIp(
      headersOf({
        "x-vercel-forwarded-for": "198.51.100.8, 10.0.0.1",
        "x-forwarded-for": "203.0.113.1",
      }),
      { VERCEL: "1" },
    ),
    "198.51.100.8",
  );
});

test("ignores x-forwarded-for on Vercel", () => {
  assert.equal(
    getClientIp(headersOf({ "x-forwarded-for": "203.0.113.1" }), {
      VERCEL: "1",
    }),
    "unknown",
  );
});

test("uses x-forwarded-for off Vercel", () => {
  assert.equal(
    getClientIp(headersOf({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" }), {}),
    "203.0.113.1",
  );
  assert.equal(getClientIp(headersOf({}), {}), "local");
});

test("groups IPv6 clients by /64", () => {
  assert.equal(
    normalizeIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd"),
    "2001:db8:1:2::/64",
  );
  assert.equal(normalizeIp("2001:db8:1:2::1"), "2001:db8:1:2::/64");
  assert.equal(normalizeIp("::ffff:192.0.2.1"), "192.0.2.1");
});
