/**
 * Barrel that composes the image-edit and suggested-prompt model configs and
 * exposes the union used by the live catalog verifier. The two configs live in
 * their own modules (lib/image-edit-models.ts, lib/suggested-prompts-models.ts)
 * so adding a model only edits the file for its feature area — this file changes
 * only when a whole new config module is introduced. Existing importers keep
 * importing from "@/lib/model-config" unchanged.
 */
export {
  IMAGE_EDIT_MODELS,
  IMAGE_EDIT_PRICE_PER_IMAGE,
  IMAGE_EDIT_MODEL_SPEC,
  buildImageEditRequestBody,
  type ImageEditModel,
  type ImageEditDimensionSpec,
} from "./image-edit-models";
export {
  SUGGESTED_PROMPTS_MODEL,
  SUGGESTED_PROMPTS_FALLBACK_MODEL,
  SUGGESTED_PROMPTS_MODELS,
  API_KEY_VALIDATION_MODEL,
  SUGGESTED_PROMPTS_BENCHMARK_MODELS,
} from "./suggested-prompts-models";

import { IMAGE_EDIT_MODELS } from "./image-edit-models";
import { SUGGESTED_PROMPTS_BENCHMARK_MODELS } from "./suggested-prompts-models";

export const CONFIGURED_MODELS = [
  ...IMAGE_EDIT_MODELS,
  ...SUGGESTED_PROMPTS_BENCHMARK_MODELS,
] as const;
