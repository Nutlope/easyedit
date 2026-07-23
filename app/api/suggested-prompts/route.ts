import { logBraintrustFailure } from "@/lib/braintrust";
import { getTogether } from "@/lib/get-together";
import { SUGGESTED_PROMPTS_MODEL } from "@/lib/model-config";
import { enforceRateLimit, getRateLimiter } from "@/lib/rate-limiter";
import {
  buildSuggestedPromptsRequestBody,
  fetchAndCompressImage,
  suggestedPromptsSchema,
} from "@/lib/suggested-prompts";
import type Together from "together-ai";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 86400;

const ratelimit = getRateLimiter();

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const imageUrl = searchParams.get("imageUrl");
  const model = searchParams.get("model") || SUGGESTED_PROMPTS_MODEL;

  if (!imageUrl) {
    return NextResponse.json(
      { error: "imageUrl query parameter is required" },
      { status: 400 },
    );
  }

  const userAPIKey = request.headers.get("x-api-key") || null;

  if (
    (await enforceRateLimit(ratelimit, userAPIKey, "suggestions")) === "limited"
  ) {
    // Record the rate-limit failure so this early return doesn't disappear from
    // Braintrust observability. Logged before the source image is fetched, so
    // no image data or API key is ever present in the trace.
    await logBraintrustFailure(
      {
        name: "easyedit.suggested-prompts",
        type: "llm",
        event: {
          metadata: {
            route: "suggested-prompts",
            phase: "rate-limit",
            success: false,
          },
        },
      },
      new Error("Suggested prompts rate limit exceeded"),
    );
    return NextResponse.json(
      { suggestions: [] },
      {
        status: 429,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const together = getTogether(userAPIKey);

  try {
    // Compress image server-side to reduce tokens
    const compressedImageUrl = await fetchAndCompressImage(imageUrl);

    const response = await together.chat.completions.create(
      buildSuggestedPromptsRequestBody({
        model,
        imageUrl: compressedImageUrl,
      }) as unknown as Together.Chat.CompletionCreateParamsNonStreaming,
    );

    if (!response?.choices?.[0]?.message?.content) {
      return NextResponse.json({ suggestions: [] });
    }

    const json = JSON.parse(response.choices[0].message.content);
    const result = suggestedPromptsSchema.safeParse(json);

    if (result.error) {
      return NextResponse.json({ suggestions: [] });
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
  } catch (e) {
    console.error("suggested-prompts error:", e);
    return NextResponse.json({ suggestions: [] }, { status: 500 });
  }
}
