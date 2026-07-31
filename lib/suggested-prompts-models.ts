/**
 * Suggested-prompts model configuration. This is the single place that changes
 * when a vision model is added to the suggestion / key-validation paths — kept
 * separate from image-edit model config (lib/image-edit-models.ts) so the two
 * feature areas don't share one edit surface. Re-exported through
 * lib/model-config.ts for existing importers.
 */

// Production primary for suggested-prompts (vision + JSON-schema, reasoning
// disabled). Qwen3.5-9B was 20/20 valid at ~0.68s under a strict 3-second
// budget. Kimi K2.7 Code was also 20/20 valid at ~0.66s, so it is the diverse
// fallback when Qwen stalls or returns invalid structured output. See
// scripts/bench-suggested-prompts.ts and AUTORESEARCH-SUGGESTIONS.md.
export const SUGGESTED_PROMPTS_MODEL = "Qwen/Qwen3.5-9B" as const;
export const SUGGESTED_PROMPTS_FALLBACK_MODEL =
  "moonshotai/Kimi-K2.7-Code" as const;

export const SUGGESTED_PROMPTS_MODELS = [
  SUGGESTED_PROMPTS_MODEL,
  SUGGESTED_PROMPTS_FALLBACK_MODEL,
] as const;

// Trivial 1-token text completion used to check a user's API key (see
// app/api/validate-key/route.ts). Reuses the cheap primary; fallback behavior
// belongs only to the user-facing suggestion path. The model is
// catalog-verified via CONFIGURED_MODELS.
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
  SUGGESTED_PROMPTS_FALLBACK_MODEL,
  "moonshotai/Kimi-K2.6",
  "google/gemma-4-31B-it",
  "pearl-ai/gemma-4-31b-it",
  SUGGESTED_PROMPTS_MODEL,
] as const;
