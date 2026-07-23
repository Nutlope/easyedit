import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import "server-only";

export function getRateLimiter() {
  let ratelimit: Ratelimit | undefined;

  // Add rate limiting if Upstash API keys are set, otherwise skip
  if (process.env.UPSTASH_REDIS_REST_URL) {
    ratelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      // Allow 5 requests per day
      limiter: Ratelimit.fixedWindow(5, "1 d"),
      analytics: true,
      prefix: "easyedit",
    });
  }
  return ratelimit;
}
export async function getIPAddress() {
  const FALLBACK_IP_ADDRESS = "0.0.0.0";
  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0] ?? FALLBACK_IP_ADDRESS;
  }

  return headersList.get("x-real-ip") ?? FALLBACK_IP_ADDRESS;
}

/**
 * Returns true when the incoming request is to a loopback address
 * (localhost, 127.0.0.1, 0.0.0.0, [::1]). We skip the rate limiter for these so
 * local testing never hits "No requests left". Production deployments serve a
 * real domain in the `host` header, so this never matches there — the limiter
 * stays fully enforced in production. Uses `host` (not `x-forwarded-host`, which
 * a client could spoof) to keep the bypass safe.
 */
export async function isLocalRequest(): Promise<boolean> {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  return (
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("0.0.0.0") ||
    host.startsWith("[::1]")
  );
}
