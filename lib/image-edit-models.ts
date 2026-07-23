/**
 * Image-edit model configuration. This module is the single place that changes
 * when an image-edit model is added, priced, or re-verified — kept separate from
 * the suggested-prompt model config so the two feature areas don't share one
 * edit surface (see lib/suggested-prompts-models.ts). Re-exported through
 * lib/model-config.ts for existing importers.
 */

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

/**
 * Build the Together image-edit request body shared by the server action and the
 * benchmark script. FLUX.2 accepts a single `image_url`; Seedream-5.0-lite
 * requires `reference_images` instead. together-ai 0.16 does not type
 * `reference_images`, so the body is returned as a plain record and cast to the
 * SDK param at the call site — keeping the param-branching logic in one place so
 * the bench can't drift from production.
 */
export function buildImageEditRequestBody(args: {
  model: ImageEditModel;
  prompt: string;
  width: number;
  height: number;
  imageUrl: string;
}): Record<string, unknown> {
  const param = IMAGE_EDIT_MODEL_SPEC[args.model].param;
  return {
    model: args.model,
    prompt: args.prompt,
    width: args.width,
    height: args.height,
    ...(param === "reference_images"
      ? { reference_images: [args.imageUrl] }
      : { image_url: args.imageUrl }),
  };
}