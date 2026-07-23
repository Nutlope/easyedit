export const IMAGE_EDIT_MODELS = [
  "black-forest-labs/FLUX.2-flex",
  "black-forest-labs/FLUX.2-pro",
] as const;

export type ImageEditModel = (typeof IMAGE_EDIT_MODELS)[number];

export const IMAGE_EDIT_PRICE_PER_IMAGE: Record<ImageEditModel, number> = {
  "black-forest-labs/FLUX.2-flex": 0.03,
  "black-forest-labs/FLUX.2-pro": 0.03,
};

export const SUGGESTED_PROMPTS_MODEL = "Qwen/Qwen3.5-9B" as const;
export const API_KEY_VALIDATION_MODEL = SUGGESTED_PROMPTS_MODEL;

export const SUGGESTED_PROMPTS_BENCHMARK_MODELS = [
  "Qwen/Qwen3.5-9B",
  "Qwen/Qwen3.5-397B-A17B",
] as const;

export const CONFIGURED_MODELS = [
  ...IMAGE_EDIT_MODELS,
  ...SUGGESTED_PROMPTS_BENCHMARK_MODELS,
] as const;
