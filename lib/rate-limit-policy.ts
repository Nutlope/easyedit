export type RateLimitDecision =
  | { status: "ok" }
  | { status: "limited"; resetAt: number }
  | { status: "unavailable" };

export type RateLimitRule = {
  limit: number;
  window: "1 m" | "10 m" | "1 h" | "1 d";
  kind: "fixed" | "sliding";
  prefix: string;
  identifier: (clientKey: string) => string;
};

/**
 * Per-IP limits. The two daily quotas keep their original prefix and key
 * format so existing counters carry over. Burst limits apply to every caller,
 * including requests that bring their own Together API key.
 */
export const RATE_LIMIT_RULES = {
  imageEditQuota: {
    limit: 5,
    window: "1 d",
    kind: "fixed",
    prefix: "easyedit",
    identifier: (clientKey) => clientKey,
  },
  suggestionsQuota: {
    limit: 5,
    window: "1 d",
    kind: "fixed",
    prefix: "easyedit",
    identifier: (clientKey) => `${clientKey}-suggestions`,
  },
  imageEditBurst: {
    limit: 10,
    window: "1 m",
    kind: "sliding",
    prefix: "easyedit:burst:image-edit",
    identifier: (clientKey) => clientKey,
  },
  suggestionsBurst: {
    limit: 20,
    window: "1 m",
    kind: "sliding",
    prefix: "easyedit:burst:suggestions",
    identifier: (clientKey) => clientKey,
  },
  uploadBurst: {
    limit: 10,
    window: "1 m",
    kind: "sliding",
    prefix: "easyedit:burst:upload",
    identifier: (clientKey) => clientKey,
  },
  uploadDaily: {
    limit: 100,
    window: "1 d",
    kind: "fixed",
    prefix: "easyedit:daily:upload",
    identifier: (clientKey) => clientKey,
  },
  validateKey: {
    limit: 10,
    window: "10 m",
    kind: "sliding",
    prefix: "easyedit:burst:validate-key",
    identifier: (clientKey) => clientKey,
  },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitBucket = keyof typeof RATE_LIMIT_RULES;

export type LimitFn = (
  bucket: RateLimitBucket,
  identifier: string,
) => Promise<{ success: boolean; reset: number }>;

export type LimiterMode = "upstash" | "disabled" | "missing";

/**
 * Upstash is required in production; without it paid routes are refused.
 * Local development without Upstash runs unthrottled.
 */
export function resolveLimiterMode(
  env: Record<string, string | undefined> = process.env,
): LimiterMode {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && token) return "upstash";
  return env.NODE_ENV === "production" ? "missing" : "disabled";
}

export const RATE_LIMIT_TIMEOUT_MS = 3_000;

/**
 * Checks each bucket in order and stops at the first one over its limit. Any
 * backend error or timeout fails closed.
 */
export async function checkRateLimits(
  limit: LimitFn,
  buckets: readonly RateLimitBucket[],
  clientKey: string,
  timeoutMs = RATE_LIMIT_TIMEOUT_MS,
): Promise<RateLimitDecision> {
  for (const bucket of buckets) {
    const identifier = RATE_LIMIT_RULES[bucket].identifier(clientKey);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        limit(bucket, identifier),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Rate limiter timed out")),
            timeoutMs,
          );
        }),
      ]);
      if (!result.success) {
        return { status: "limited", resetAt: result.reset };
      }
    } catch (error) {
      console.error(
        `Rate limiter request failed (${bucket}):`,
        error instanceof Error ? error.message : String(error),
      );
      return { status: "unavailable" };
    } finally {
      clearTimeout(timer);
    }
  }
  return { status: "ok" };
}
