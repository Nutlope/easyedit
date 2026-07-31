import { SUGGESTED_PROMPTS_MODELS } from "./suggested-prompts-models";
import {
  buildSuggestedPromptsRequestBody,
  suggestedPromptsSchema,
} from "./suggested-prompts";
import {
  classifyTogetherError,
  type TogetherFailureKind,
} from "./together-error";

export const SUGGESTED_PROMPTS_REQUEST_TIMEOUT_MS = 2_500;

export const SUGGESTED_PROMPTS_REQUEST_OPTIONS = {
  maxRetries: 0,
  timeout: SUGGESTED_PROMPTS_REQUEST_TIMEOUT_MS,
} as const;

type SuggestedPromptsModel = (typeof SUGGESTED_PROMPTS_MODELS)[number];

type CompletionResponse = {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
};

export type CreateSuggestedPromptsCompletion = (
  body: Record<string, unknown>,
  options: typeof SUGGESTED_PROMPTS_REQUEST_OPTIONS,
) => Promise<CompletionResponse>;

export type SuggestedPromptsAttempt = {
  model: SuggestedPromptsModel;
  failureKind: TogetherFailureKind | "invalid_output";
};

export type SuggestedPromptsResult = {
  suggestions: string[];
  model: SuggestedPromptsModel | null;
  failedAttempts: SuggestedPromptsAttempt[];
};

/**
 * Keep the suggestion feature inside a deterministic five-second provider
 * budget: one 2.5s Qwen attempt, then one 2.5s Kimi attempt. Both calls disable
 * SDK retries, so a transient provider stall cannot consume Vercel's 300s
 * function window.
 */
export async function requestSuggestedPrompts(args: {
  imageUrl: string;
  createCompletion: CreateSuggestedPromptsCompletion;
}): Promise<SuggestedPromptsResult> {
  const failedAttempts: SuggestedPromptsAttempt[] = [];

  for (const [index, model] of SUGGESTED_PROMPTS_MODELS.entries()) {
    try {
      const response = await args.createCompletion(
        buildSuggestedPromptsRequestBody({ model, imageUrl: args.imageUrl }),
        SUGGESTED_PROMPTS_REQUEST_OPTIONS,
      );
      const content = response.choices?.[0]?.message?.content;
      const suggestions = parseSuggestedPrompts(content);

      if (suggestions) {
        return { suggestions, model, failedAttempts };
      }

      failedAttempts.push({ model, failureKind: "invalid_output" });
    } catch (error) {
      const failure = classifyTogetherError(error);
      failedAttempts.push({ model, failureKind: failure.kind });

      if (!shouldTryFallback(failure.kind)) {
        break;
      }
    }

    if (index === SUGGESTED_PROMPTS_MODELS.length - 1) break;
  }

  return { suggestions: [], model: null, failedAttempts };
}

function parseSuggestedPrompts(content: string | null | undefined) {
  if (!content) return null;

  try {
    const result = suggestedPromptsSchema.safeParse(JSON.parse(content));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function shouldTryFallback(kind: TogetherFailureKind) {
  return ![
    "moderation",
    "invalid_key",
    "insufficient_credits",
    "forbidden",
  ].includes(kind);
}
