import { logBraintrustOutcome } from "@/lib/braintrust";
import { getTogether } from "@/lib/get-together";
import { SUGGESTED_PROMPTS_MODEL } from "@/lib/model-config";
import { buildQuotaRejectionTrace } from "@/lib/rate-limit-tracing";
import { enforceRateLimit, getRateLimiter } from "@/lib/rate-limiter";
import {
  buildSuggestedPromptsRequestBody,
  fetchAndCompressImage,
  suggestedPromptsSchema,
} from "@/lib/suggested-prompts";
import { RemoteImageError } from "@/lib/remote-image";
import {
  extractDataUrlBase64,
  serializeBraintrustError,
} from "@/lib/trace-safety";
import { classifyTogetherError } from "@/lib/together-error";
import type Together from "together-ai";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 86400;

const ratelimit = getRateLimiter();

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const imageUrl = searchParams.get("imageUrl");

  if (!imageUrl) {
    return NextResponse.json(
      { error: "imageUrl query parameter is required" },
      { status: 400 },
    );
  }

  const userAPIKey = request.headers.get("x-api-key") || null;

  const rateLimitResult = await enforceRateLimit(
    ratelimit,
    userAPIKey,
    "suggestions",
  );
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
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((rateLimitResult.resetAt - Date.now()) / 1_000),
    );
    return NextResponse.json(
      { suggestions: [] },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(retryAfterSeconds),
          "X-RateLimit-Reset": String(rateLimitResult.resetAt),
        },
      },
    );
  }
  if (rateLimitResult.status === "unavailable") {
    return NextResponse.json(
      { suggestions: [] },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const together = getTogether(userAPIKey);
  let compressedImageUrl: string | undefined;

  try {
    // Compress image server-side to reduce tokens
    compressedImageUrl = await fetchAndCompressImage(imageUrl);

    const response = await together.chat.completions.create(
      buildSuggestedPromptsRequestBody({
        model: SUGGESTED_PROMPTS_MODEL,
        imageUrl: compressedImageUrl,
      }) as unknown as Together.Chat.CompletionCreateParamsNonStreaming,
    );

    if (!response?.choices?.[0]?.message?.content) {
      return NextResponse.json({ suggestions: [] });
    }

    let json: unknown;
    try {
      json = JSON.parse(response.choices[0].message.content);
    } catch {
      console.warn("suggested-prompts unavailable: invalid-model-output");
      return emptySuggestions();
    }
    const result = suggestedPromptsSchema.safeParse(json);

    if (result.error) {
      console.warn("suggested-prompts unavailable: invalid-model-output");
      return emptySuggestions();
    }

    return NextResponse.json(
      { suggestions: result.data },
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

function emptySuggestions() {
  return NextResponse.json(
    { suggestions: [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
