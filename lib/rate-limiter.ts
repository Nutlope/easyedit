import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import "server-only";

export type RateLimiter = Ratelimit | "unavailable" | undefined;
export type RateLimitDecision =
  | { status: "ok" }
  | { status: "limited"; resetAt: number }
  | { status: "unavailable" };

export function getRateLimiter() {
  // Add rate limiting if Upstash API keys are set, otherwise skip
  if (process.env.UPSTASH_REDIS_REST_URL) {
    try {
      return new Ratelimit({
        redis: Redis.fromEnv(),
        // Allow 5 requests per day
        limiter: Ratelimit.fixedWindow(5, "1 d"),
        analytics: true,
        prefix: "easyedit",
      });
    } catch (error) {
      console.error(
        "Rate limiter initialization failed:",
        error instanceof Error ? error.message : String(error),
      );
      return "unavailable";
    }
  }
  return undefined;
}

/**
 * Enforce the rate limit for a non-BYOK request, bypassing local traffic.
 *
 * Returns a limited decision when the caller is over quota (including the
 * server reset timestamp), an unavailable decision when configured Upstash
 * infrastructure fails, and ok otherwise. BYOK requests pass straight through
 * because they bill to the caller's own Together account. When no limiter is
 * configured (Upstash unset), everything is ok.
 *
 * Production keeps the limit; loopback hosts (localhost, 127.0.0.1, …) are
 * bypassed via `isLocalRequest` so local testing is never throttled. The optional
 * `keySuffix` namespaces the limit key per endpoint (e.g. `"-suggestions"`) so a
 * caller doesn't exhaust the edit quota with suggestion calls.
 */
export async function enforceRateLimit(
  ratelimit: RateLimiter,
  userAPIKey: string | null,
  keySuffix = "",
): Promise<RateLimitDecision> {
  if (userAPIKey || !ratelimit) return { status: "ok" };

  if (await isLocalRequest()) return { status: "ok" };
  if (ratelimit === "unavailable") return { status: "unavailable" };

  const ipAddress = await getIPAddress();
  const key = keySuffix ? `${ipAddress}-${keySuffix}` : ipAddress;
  try {
    const { success, reset } = await ratelimit.limit(key);
    return success ? { status: "ok" } : { status: "limited", resetAt: reset };
  } catch (error) {
    console.error(
      "Rate limiter request failed:",
      error instanceof Error ? error.message : String(error),
    );
    return { status: "unavailable" };
  }
}
async function getIPAddress() {
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
async function isLocalRequest(): Promise<boolean> {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  return (
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("0.0.0.0") ||
    host.startsWith("[::1]")
  );
}
