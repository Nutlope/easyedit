"use server";

import {
  endAndFlushBraintrustSpan,
  logBraintrustEvent,
  logBraintrustFailure,
  startBraintrustSpan,
} from "@/lib/braintrust";
import { getAdjustedDimensions } from "@/lib/get-adjusted-dimentions";
import { getTogether } from "@/lib/get-together";
import {
  buildImageEditTraceStart,
  buildImageEditTraceSuccess,
} from "@/lib/image-edit-tracing";
import { IMAGE_EDIT_MODELS } from "@/lib/model-config";
import { getIPAddress, getRateLimiter } from "@/lib/rate-limiter";
import { serializeBraintrustError } from "@/lib/trace-safety";
import { z } from "zod";

const ratelimit = getRateLimiter();

const schema = z.object({
  imageUrl: z.string(),
  prompt: z.string(),
  width: z.number(),
  height: z.number(),
  userAPIKey: z.string().nullable(),
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
    throw error;
  }

  const { imageUrl, prompt, width, height, userAPIKey, model } = input;
  const adjustedDimensions = getAdjustedDimensions(width, height);
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
  let phase = "rate-limit";
  let providerStartedAt: number | undefined;

  try {
    if (ratelimit && !userAPIKey) {
      const ipAddress = await getIPAddress();

      const { success } = await ratelimit.limit(ipAddress);
      if (!success) {
        logBraintrustEvent(span, {
          error: { message: "Image edit rate limit exceeded" },
          metadata: { success: false, phase },
          metrics: { duration_ms: performance.now() - startedAt },
        });
        return {
          success: false,
          error:
            "No requests left. Please add your own API key or try again in 24h.",
        };
      }
    }

    phase = "provider";
    const together = getTogether(userAPIKey);
    providerStartedAt = performance.now();
    const response = await together.images.create({
      model,
      prompt,
      width: adjustedDimensions.width,
      height: adjustedDimensions.height,
      image_url: imageUrl,
    });
    const url = response.data?.[0]?.url;

    if (!url) {
      phase = "provider-response";
      throw new Error("Together returned no image URL");
    }

    logBraintrustEvent(
      span,
      buildImageEditTraceSuccess(
        response,
        model,
        performance.now() - startedAt,
        performance.now() - providerStartedAt,
      ),
    );
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
    ]);
    logBraintrustEvent(span, {
      error: serializedError,
      metadata: { success: false, phase },
      metrics,
    });
    console.error("Image edit failed:", serializedError);

    if (String(error).includes("403")) {
      return {
        success: false,
        error:
          "You need a paid Together AI account to use the Pro model. Please upgrade by purchasing credits here: https://api.together.xyz/settings/billing.",
      };
    }
    return {
      success: false,
      error: "Image could not be generated. Please try again.",
    };
  } finally {
    await endAndFlushBraintrustSpan(span);
  }
}
