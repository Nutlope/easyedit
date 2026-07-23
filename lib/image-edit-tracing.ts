import {
  IMAGE_EDIT_PRICE_PER_IMAGE,
  type ImageEditModel,
} from "@/lib/model-config";

export type ImageEditTraceInput = {
  prompt: string;
  model: ImageEditModel;
  requestedWidth: number;
  requestedHeight: number;
  width: number;
  height: number;
  byok: boolean;
};

type TogetherImageResponse = {
  id?: string;
  model?: string;
  object?: unknown;
  usage?: unknown;
  data?: Array<{
    url?: string;
    b64_json?: string;
    timings?: Record<string, unknown>;
  }>;
};

const SENSITIVE_METADATA_KEY =
  /api.?key|authorization|b64|base64|image.?payload|image.?url/i;

export function buildImageEditTraceStart(input: ImageEditTraceInput) {
  return {
    input: {
      prompt: input.prompt,
    },
    metadata: {
      provider: "together",
      operation: "image-edit",
      model: input.model,
      requestedWidth: input.requestedWidth,
      requestedHeight: input.requestedHeight,
      width: input.width,
      height: input.height,
      byok: input.byok,
      hasSourceImage: true,
    },
  };
}

export function estimateImageEditCost(
  model: ImageEditModel,
  imageCount: number,
) {
  const pricePerImage = IMAGE_EDIT_PRICE_PER_IMAGE[model];

  return {
    estimatedCost: Number((pricePerImage * imageCount).toFixed(12)),
    pricePerImage,
    imageCount,
  };
}

export function buildImageEditTraceSuccess(
  response: TogetherImageResponse,
  model: ImageEditModel,
  durationMs: number,
  providerDurationMs: number,
) {
  const inferenceSeconds = response.data?.[0]?.timings?.inference;
  const imageCount = response.data?.length ?? 0;
  const cost = estimateImageEditCost(model, imageCount);
  const outputUrl = sanitizeOutputUrl(response.data?.[0]?.url);
  const metrics: Record<string, number> = {
    duration_ms: durationMs,
    provider_duration_ms: providerDurationMs,
    estimated_cost: cost.estimatedCost,
  };

  if (typeof inferenceSeconds === "number") {
    metrics.inference_ms = inferenceSeconds * 1_000;
  }

  return {
    output: {
      imageCount,
      imageUrl: outputUrl,
      responseId: response.id ?? null,
      responseModel: response.model ?? null,
      responseObject: response.object ?? null,
    },
    metadata: {
      success: true,
      phase: "provider",
      cost: {
        currency: "USD",
        pricingUnit: "image",
        ...cost,
      },
      usage: sanitizeUsageMetadata(response.usage),
      timings: response.data?.map((item) => item.timings ?? null) ?? [],
    },
    metrics,
  };
}

function sanitizeUsageMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeUsageMetadata);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_METADATA_KEY.test(key))
        .map(([key, item]) => [key, sanitizeUsageMetadata(item)]),
    );
  }

  return value;
}

function sanitizeOutputUrl(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}
