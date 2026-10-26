import { logBraintrustOutcome } from "@/lib/braintrust";
import { getTogether } from "@/lib/get-together";
import { buildQuotaRejectionTrace } from "@/lib/rate-limit-tracing";
import { enforceRateLimit, type RateLimitDecision } from "@/lib/rate-limiter";
import { fetchAndCompressImage } from "@/lib/suggested-prompts";
import { requestSuggestedPrompts } from "@/lib/suggested-prompts-request";
import { RemoteImageError } from "@/lib/remote-image";
import {
  extractDataUrlBase64,
  serializeBraintrustError,
} from "@/lib/trace-safety";
import { classifyTogetherError } from "@/lib/together-error";
import { parseUserAPIKey } from "@/lib/user-api-key";
import type Together from "together-ai";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 86400;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const imageUrl = searchParams.get("imageUrl");

  if (!imageUrl || imageUrl.length > 4_096) {
    return NextResponse.json(
      { error: "A valid imageUrl query parameter is required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsedKey = parseUserAPIKey(request.headers.get("x-api-key"));
  if (!parsedKey.ok) {
    return NextResponse.json(
      { error: "Invalid API key", suggestions: [] },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const userAPIKey = parsedKey.key;

  const burstResult = await enforceRateLimit("suggestionsBurst");
  if (burstResult.status === "limited") {
    return rateLimitedResponse(burstResult.resetAt);
  }
  if (burstResult.status === "unavailable") {
    return unavailableResponse();
  }

  const rateLimitResult: RateLimitDecision = userAPIKey
    ? { status: "ok" }
    : await enforceRateLimit("suggestionsQuota");
  if (rateLimitResult.status === "limited") {
    await logBraintrustOutcome({
      name: "easyedit.rate-limit",
      type: "task",
      event: buildQuotaRejectionTrace({
        feature: "suggested-prompts",
        route: "/api/suggested-prompts",
        resetAt: rateLimitResult.resetAt,
      }),
    });
    return rateLimitedResponse(rateLimitResult.resetAt);
  }
  if (rateLimitResult.status === "unavailable") {
    return unavailableResponse();
  }

  const together = getTogether(userAPIKey);
  let compressedImageUrl: string | undefined;

  try {
    // Compress image server-side to reduce tokens
    compressedImageUrl = await fetchAndCompressImage(imageUrl);

    const result = await requestSuggestedPrompts({
      imageUrl: compressedImageUrl,
      createCompletion: (body, options) =>
        together.chat.completions.create(
          body as unknown as Together.Chat.CompletionCreateParamsNonStreaming,
          options,
        ),
    });

    if (!result.model) {
      console.warn("suggested-prompts unavailable: all-models-failed", {
        attempts: result.failedAttempts,
      });
      return emptySuggestions();
    }

    if (result.failedAttempts.length > 0) {
      console.warn("suggested-prompts fallback used", {
        model: result.model,
        attempts: result.failedAttempts,
      });
    }

    return NextResponse.json(
      { suggestions: result.suggestions },
      {
        headers: {
          "Vercel-CDN-Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=604800",
          "CDN-Cache-Control": "public, s-maxage=86400",
          "Cache-Control": "public, max-age=0, s-maxage=86400",
        },
      },
    );
  } catch (error) {
    if (error instanceof RemoteImageError) {
      console.warn(`suggested-prompts unavailable: ${error.code}`);
      return emptySuggestions();
    }

    const failure = classifyTogetherError(error);
    console.warn(
      `suggested-prompts unavailable: ${failure.kind}`,
      serializeBraintrustError(error, [
        userAPIKey,
        imageUrl,
        compressedImageUrl,
        extractDataUrlBase64(compressedImageUrl),
      ]),
    );
    return emptySuggestions();
  }
}

function rateLimitedResponse(resetAt: number) {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((resetAt - Date.now()) / 1_000),
  );
  return NextResponse.json(
    { suggestions: [] },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Reset": String(resetAt),
      },
    },
  );
}

function unavailableResponse() {
  return NextResponse.json(
    { suggestions: [] },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function emptySuggestions() {
  return NextResponse.json(
    { suggestions: [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
