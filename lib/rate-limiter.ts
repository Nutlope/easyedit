import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import "server-only";
import { getClientIp } from "./client-ip";
import {
  checkRateLimits,
  RATE_LIMIT_RULES,
  resolveLimiterMode,
  type LimitFn,
  type RateLimitBucket,
  type RateLimitDecision,
} from "./rate-limit-policy";

export type { RateLimitBucket, RateLimitDecision } from "./rate-limit-policy";

type LimiterState =
  | { status: "ready"; limit: LimitFn }
  | { status: "disabled" }
  | { status: "unavailable" };

let limiterState: LimiterState | undefined;

function getLimiterState(): LimiterState {
  if (limiterState) return limiterState;

  const mode = resolveLimiterMode();
  if (mode === "disabled") return (limiterState = { status: "disabled" });
  if (mode === "missing") {
    console.error(
      "Rate limiter is not configured: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    );
    return (limiterState = { status: "unavailable" });
  }

  try {
    const redis = Redis.fromEnv();
    const limiters = new Map<RateLimitBucket, Ratelimit>();
    for (const [bucket, rule] of Object.entries(RATE_LIMIT_RULES) as [
      RateLimitBucket,
      (typeof RATE_LIMIT_RULES)[RateLimitBucket],
    ][]) {
      limiters.set(
        bucket,
        new Ratelimit({
          redis,
          limiter:
            rule.kind === "fixed"
              ? Ratelimit.fixedWindow(rule.limit, rule.window)
              : Ratelimit.slidingWindow(rule.limit, rule.window),
          analytics: true,
          prefix: rule.prefix,
          timeout: 0,
        }),
      );
    }
    return (limiterState = {
      status: "ready",
      limit: async (bucket, identifier) => {
        const limiter = limiters.get(bucket);
        if (!limiter) throw new Error(`Unknown rate limit bucket: ${bucket}`);
        return limiter.limit(identifier);
      },
    });
  } catch (error) {
    console.error(
      "Rate limiter initialization failed:",
      error instanceof Error ? error.message : String(error),
    );
    return (limiterState = { status: "unavailable" });
  }
}

/**
 * Enforces the given per-IP buckets in order. Fails closed when Upstash is
 * missing in production or errors. Loopback hosts are only bypassed outside
 * production so local testing is never throttled.
 */
export async function enforceRateLimit(
  ...buckets: RateLimitBucket[]
): Promise<RateLimitDecision> {
  const state = getLimiterState();
  if (state.status === "disabled") return { status: "ok" };
  if (state.status === "unavailable") return { status: "unavailable" };

  const headersList = await headers();
  if (process.env.NODE_ENV !== "production" && isLocalHost(headersList)) {
    return { status: "ok" };
  }

  return checkRateLimits(state.limit, buckets, getClientIp(headersList));
}

function isLocalHost(headersList: Headers) {
  const host = headersList.get("host") ?? "";
  return (
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("0.0.0.0") ||
    host.startsWith("[::1]")
  );
}
