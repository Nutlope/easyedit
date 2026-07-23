/**
 * Suggested-prompts model configuration. This is the single place that changes
 * when a vision model is added to the suggestion / key-validation paths — kept
 * separate from image-edit model config (lib/image-edit-models.ts) so the two
 * feature areas don't share one edit surface. Re-exported through
 * lib/model-config.ts for existing importers.
 */

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