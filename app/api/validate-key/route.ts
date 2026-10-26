import { logBraintrustFailure } from "@/lib/braintrust";
import { getTogether } from "@/lib/get-together";
import { API_KEY_VALIDATION_MODEL } from "@/lib/model-config";
import { serializeBraintrustError } from "@/lib/trace-safety";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { classifyTogetherError } from "@/lib/together-error";
import { MAX_USER_API_KEY_LENGTH, parseUserAPIKey } from "@/lib/user-api-key";
import { z } from "zod";

const requestSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(20)
    .max(MAX_USER_API_KEY_LENGTH)
    .refine((value) => parseUserAPIKey(value).ok),
});

export async function POST(request: Request) {
  const rateLimitResult = await enforceRateLimit("validateKey");
  if (rateLimitResult.status === "limited") {
    return jsonResponse(
      {
        success: false,
        message: "Too many attempts. Please wait a few minutes and try again.",
        code: "RATE_LIMITED",
      },
      429,
    );
  }
  if (rateLimitResult.status === "unavailable") {
    return jsonResponse(
      {
        success: false,
        message:
          "Key validation is temporarily unavailable. Please try again soon.",
        code: "UNAVAILABLE",
      },
      503,
    );
  }

  try {
    const parsed = requestSchema.safeParse(await request.json());

    if (!parsed.success) {
      return jsonResponse(
        {
          success: false,
          message: "Enter a valid Together API key.",
          code: "INVALID_REQUEST",
        },
        400,
      );
    }

    const { apiKey } = parsed.data;
    const together = getTogether(apiKey);

    try {
      // Make a simple chat completion call to validate the API key
      await together.chat.completions.create({
        model: API_KEY_VALIDATION_MODEL,
        messages: [
          {
            role: "user",
            content: "Hello, how are you?",
          },
        ],
        max_tokens: 1, // Minimal tokens for validation
      });

      return jsonResponse({
        success: true,
        message: "API key is valid",
      });
    } catch (error) {
      const failure = classifyTogetherError(error);
      console.warn(
        `API key validation rejected: ${failure.kind}`,
        serializeBraintrustError(error, [apiKey]),
      );

      // Record the validation failure so the key-check early return doesn't
      // disappear from Braintrust observability. The user's API key is passed
      // as a sensitive value so any accidental echo is redacted; the event
      // itself carries only route/phase/success — never the key or messages.
      await logBraintrustFailure(
        {
          name: "easyedit.validate-key",
          type: "llm",
          event: {
            metadata: {
              route: "validate-key",
              phase: "key-validation",
              success: false,
              failureKind: failure.kind,
            },
          },
        },
        error,
        [apiKey],
      );

      return jsonResponse(
        {
          success: false,
          message: failure.userMessage,
          code: failure.code ?? failure.kind.toUpperCase(),
        },
        validationStatus(failure.kind),
      );
    }
  } catch (error) {
    console.warn("API key validation rejected: invalid_request");
    return jsonResponse(
      {
        success: false,
        message: "Invalid request format",
        code: "INVALID_REQUEST",
      },
      400,
    );
  }
}

function validationStatus(
  kind: ReturnType<typeof classifyTogetherError>["kind"],
) {
  if (kind === "invalid_key") return 401;
  if (kind === "insufficient_credits") return 402;
  if (kind === "rate_limit") return 429;
  if (kind === "transient") return 503;
  return 502;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
