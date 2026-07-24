"use server";

import {
  endAndFlushBraintrustSpan,
  logBraintrustEvent,
  logBraintrustFailure,
  logBraintrustOutcome,
  startBraintrustSpan,
} from "@/lib/braintrust";
import {
  areImageEditDimensionsValid,
  getAdjustedDimensions,
} from "@/lib/get-adjusted-dimentions";
import { getTogether } from "@/lib/get-together";
import {
  buildImageEditTraceStart,
  buildImageEditTraceSuccess,
} from "@/lib/image-edit-tracing";
import {
  buildImageEditRequestBody,
  IMAGE_EDIT_MODELS,
} from "@/lib/model-config";
import { buildQuotaRejectionTrace } from "@/lib/rate-limit-tracing";
import { enforceRateLimit, getRateLimiter } from "@/lib/rate-limiter";
import {
  classifyTogetherError,
  isExpectedTogetherRejection,
  withImageEditRetry,
} from "@/lib/together-error";
import {
  extractDataUrlBase64,
  serializeBraintrustError,
} from "@/lib/trace-safety";
import { z } from "zod";

const ratelimit = getRateLimiter();

const schema = z.object({
  imageUrl: z.string().url().max(4_096),
  prompt: z.string().trim().min(1).max(2_000),
  width: z.number().finite().positive().max(100_000),
  height: z.number().finite().positive().max(100_000),
  userAPIKey: z.string().trim().min(1).max(512).nullable(),
  model: z.enum(IMAGE_EDIT_MODELS).default("black-forest-labs/FLUX.2-flex"),
});

export async function generateImage(
  unsafeData: z.infer<typeof schema>,
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(unsafeData);
  } catch (error) {
    await logBraintrustFailure(
      {
        name: "easyedit.edit-image",
        type: "llm",
        event: {
          metadata: {
            route: "generateImage",
            phase: "request-validation",
            success: false,
          },
        },
      },
      new Error("Invalid image edit request"),
    );
    return {
      success: false,
      error: "Invalid image edit request. Please reload and try again.",
    };
  }

  const { imageUrl, prompt, width, height, userAPIKey, model } = input;

  const rateLimitResult = await enforceRateLimit(ratelimit, userAPIKey);
  if (rateLimitResult.status === "limited") {
    await logBraintrustOutcome({
      name: "easyedit.rate-limit",
      type: "task",
      event: buildQuotaRejectionTrace({
        feature: "image-edit",
        route: "generateImage",
        resetAt: rateLimitResult.resetAt,
      }),
    });
    return {
      success: false,
      error:
        "No requests left. Please add your own API key or try again in 24h.",
    };
  }
  if (rateLimitResult.status === "unavailable") {
    return {
      success: false,
      error: "Image editing is temporarily unavailable. Please try again soon.",
    };
  }

  const adjustedDimensions = getAdjustedDimensions(width, height, model);
  const startedAt = performance.now();
  const span = startBraintrustSpan({
    name: "easyedit.edit-image",
    type: "llm",
    event: buildImageEditTraceStart({
      prompt,
      model,
      requestedWidth: width,
      requestedHeight: height,
      width: adjustedDimensions.width,
      height: adjustedDimensions.height,
      byok: Boolean(userAPIKey),
    }),
  });
  let phase = "provider";
  let providerStartedAt: number | undefined;
  let retryCount = 0;

  try {
    const together = getTogether(userAPIKey);
    providerStartedAt = performance.now();
    const requestBody = buildImageEditRequestBody({
      model,
      prompt,
      width: adjustedDimensions.width,
      height: adjustedDimensions.height,
      imageUrl,
    }) as unknown as Parameters<typeof together.images.create>[0];
    const { value: response, retries } = await withImageEditRetry(
      () => together.images.create(requestBody),
      {
        dimensionsAreValid: areImageEditDimensionsValid(
          adjustedDimensions.width,
          adjustedDimensions.height,
          model,
        ),
        onRetry: () => {
          retryCount += 1;
        },
      },
    );
    retryCount = retries;
    const url = response.data?.[0]?.url;

    if (!url) {
      phase = "provider-response";
      throw new Error("Together returned no image URL");
    }

    const successEvent = buildImageEditTraceSuccess(
      response,
      model,
      performance.now() - startedAt,
      performance.now() - providerStartedAt,
    );
    logBraintrustEvent(span, {
      ...successEvent,
      metadata: { ...successEvent.metadata, retryCount },
    });
    return { success: true, url };
  } catch (error) {
    const metrics: Record<string, number> = {
      duration_ms: performance.now() - startedAt,
    };
    if (providerStartedAt !== undefined) {
      metrics.provider_duration_ms = performance.now() - providerStartedAt;
    }

    const serializedError = serializeBraintrustError(error, [
      userAPIKey,
      imageUrl,
      extractDataUrlBase64(imageUrl),
    ]);
    const failure = classifyTogetherError(error);
    logBraintrustEvent(span, {
      error: serializedError,
      metadata: {
        success: false,
        phase,
        failureKind: failure.kind,
        retryCount,
      },
      metrics,
    });
    if (isExpectedTogetherRejection(failure.kind)) {
      console.warn(`Image edit rejected: ${failure.kind}`);
    } else {
      console.error("Image edit failed:", serializedError);
    }

    return {
      success: false,
      error: failure.userMessage,
    };
  } finally {
    await endAndFlushBraintrustSpan(span);
  }
}
