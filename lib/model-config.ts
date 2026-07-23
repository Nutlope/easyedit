export const IMAGE_EDIT_MODELS = [
  "black-forest-labs/FLUX.2-flex",
  "black-forest-labs/FLUX.2-pro",
  "ByteDance/Seedream-5.0-lite",
] as const;

export type ImageEditModel = (typeof IMAGE_EDIT_MODELS)[number];

export const IMAGE_EDIT_PRICE_PER_IMAGE: Record<ImageEditModel, number> = {
  "black-forest-labs/FLUX.2-flex": 0.03,
  "black-forest-labs/FLUX.2-pro": 0.03,
  "ByteDance/Seedream-5.0-lite": 0.035,
};

/**
 * Together image models accept image-to-image edits through one of two request
 * parameters and enforce model-specific output-dimension rules. Both were
 * verified against the live Together API:
 *  - FLUX.2 flex/pro:   `image_url`, longest side <= 1024 (multiples of 16).
 *  - Seedream-5.0-lite: `reference_images`, total area in [3,686,400, 10,404,496] (mult. 8).
 */
export type ImageEditParam = "image_url" | "reference_images";

export type ImageEditDimensionSpec = {
  /** Output dimensions are rounded to a multiple of this value. */
  multipleOf: number;
  /** Source aspect ratio (width / height) is clamped into this range. */
  aspectMin: number;
  aspectMax: number;
  /**
   * "flux" preserves the existing FLUX.2 scaling (longest side capped at
   * 1024, shortest side floored at 64) byte-for-byte, so the working FLUX path
   * is unchanged. "fitArea" scales preserving aspect so the total pixel area
   * lands in [`areaMin`, `areaMax`].
   */
  strategy: "flux" | "fitArea";
  areaMin?: number;
  areaMax?: number;
  /** Target area for the "fitArea" strategy; kept inside [areaMin, areaMax]. */
  areaTarget?: number;
};

export const IMAGE_EDIT_MODEL_SPEC: Record<
  ImageEditModel,
  { param: ImageEditParam; dimensions: ImageEditDimensionSpec }
> = {
  "black-forest-labs/FLUX.2-flex": {
    param: "image_url",
    dimensions: {
      strategy: "flux",
      multipleOf: 16,
      aspectMin: 1 / 16,
      aspectMax: 16,
    },
  },
  "black-forest-labs/FLUX.2-pro": {
    param: "image_url",
    dimensions: {
      strategy: "flux",
      multipleOf: 16,
      aspectMin: 1 / 16,
      aspectMax: 16,
    },
  },
  "ByteDance/Seedream-5.0-lite": {
    param: "reference_images",
    dimensions: {
      strategy: "fitArea",
      multipleOf: 8,
      aspectMin: 1 / 4,
      aspectMax: 4,
      areaMin: 3_686_400,
      areaMax: 10_404_496,
      areaTarget: 5_000_000,
    },
  },
};

// Production default for suggested-prompts (vision + JSON-schema, reasoning
// disabled). Picked on value: cheapest per call and ~0.7s steady-state, 3/3
// valid — it dominates the prior default (Qwen3.5-9B) on both speed and cost.
// See scripts/bench-suggested-prompts.ts (run with CONCURRENCY=1 for clean
// latency; concurrent runs show per-key queueing artifacts).
export const SUGGESTED_PROMPTS_MODEL = "google/gemma-3n-E4B-it" as const;

// Trivial 1-token text completion used to check a user's API key (see
// app/api/validate-key/route.ts). Reuses SUGGESTED_PROMPTS_MODEL so a single
// model swap covers both the suggestion and key-validation paths; the model
// is catalog-verified via CONFIGURED_MODELS.
export const API_KEY_VALIDATION_MODEL = SUGGESTED_PROMPTS_MODEL;

/**
 * Vision-capable chat models benchmarked for the suggested-prompts feature.
 * Every model here accepts image input and is called with reasoning disabled
 * (see app/api/suggested-prompts/route.ts and scripts/bench-suggested-prompts.ts).
 * IDs + pricing were verified against the live Together catalog.
 */
export const SUGGESTED_PROMPTS_BENCHMARK_MODELS = [
  "thinkingmachines/Inkling",
  "MiniMaxAI/MiniMax-M3",
  "moonshotai/Kimi-K2.7-Code",
  "moonshotai/Kimi-K2.6",
  "google/gemma-4-31B-it",
  "pearl-ai/gemma-4-31b-it",
  "Qwen/Qwen3.5-9B",
  "google/gemma-3n-E4B-it",
] as const;

export const CONFIGURED_MODELS = [
  ...IMAGE_EDIT_MODELS,
  ...SUGGESTED_PROMPTS_BENCHMARK_MODELS,
] as const;
