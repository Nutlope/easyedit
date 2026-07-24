export type TogetherFailureKind =
  | "moderation"
  | "invalid_key"
  | "insufficient_credits"
  | "rate_limit"
  | "invalid_request"
  | "forbidden"
  | "transient"
  | "unknown";

export type TogetherFailure = {
  kind: TogetherFailureKind;
  status?: number;
  code?: string;
  userMessage: string;
};

type RetryOptions = {
  dimensionsAreValid: boolean;
  sleep?: (delayMs: number) => Promise<void>;
  onRetry?: (failure: TogetherFailure) => void;
};

export function classifyTogetherError(error: unknown): TogetherFailure {
  const message = errorMessage(error);
  const lower = message.toLowerCase();
  const parsed = parseProviderError(message);
  const sdkError = parseSdkError(error);
  const status = errorStatus(error) ?? parsed.status;
  const code = errorCode(error) ?? sdkError.code ?? parsed.code;
  const providerType = (sdkError.type ?? parsed.type)?.toLowerCase();
  const normalizedCode = code?.toLowerCase();

  if (
    normalizedCode === "content_policy_violation" ||
    lower.includes("content moderation")
  ) {
    return {
      kind: "moderation",
      status,
      code,
      userMessage:
        "This edit was blocked by the model's safety filters. Try changing the image or prompt.",
    };
  }

  if (
    status === 401 ||
    normalizedCode === "invalid_api_key" ||
    lower.includes("invalid api key")
  ) {
    return {
      kind: "invalid_key",
      status,
      code,
      userMessage: "This Together API key is invalid.",
    };
  }

  if (
    status === 402 ||
    providerType === "credit_limit" ||
    normalizedCode === "credit_limit" ||
    lower.includes("credit limit exceeded")
  ) {
    return {
      kind: "insufficient_credits",
      status,
      code,
      userMessage:
        "This Together account needs credits before it can generate images.",
    };
  }

  if (
    status === 429 ||
    normalizedCode === "rate_limit_exceeded" ||
    lower.includes("rate limit")
  ) {
    return {
      kind: "rate_limit",
      status,
      code,
      userMessage:
        "Together is receiving too many requests. Please try again shortly.",
    };
  }

  if (
    status === 408 ||
    (status !== undefined && status >= 500) ||
    lower.includes("connection error") ||
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("fetch failed")
  ) {
    return {
      kind: "transient",
      status,
      code,
      userMessage:
        "Together is temporarily unavailable. Please try again shortly.",
    };
  }

  if (status === 403) {
    return {
      kind: "forbidden",
      status,
      code,
      userMessage:
        "This Together account cannot use the selected model. Check its billing and model access.",
    };
  }

  if (status === 400 || status === 422) {
    return {
      kind: "invalid_request",
      status,
      code,
      userMessage:
        "The model could not process this image or prompt. Try a different input.",
    };
  }

  return {
    kind: "unknown",
    status,
    code,
    userMessage: "Image could not be generated. Please try again.",
  };
}

export function isExpectedTogetherRejection(kind: TogetherFailureKind) {
  return (
    kind === "moderation" ||
    kind === "invalid_request" ||
    kind === "forbidden" ||
    kind === "insufficient_credits" ||
    kind === "invalid_key" ||
    kind === "rate_limit"
  );
}

export async function withImageEditRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<{ value: T; retries: number }> {
  try {
    return { value: await operation(), retries: 0 };
  } catch (error) {
    const failure = classifyTogetherError(error);
    if (!isSafeImageEditRetry(error, failure, options.dimensionsAreValid)) {
      throw error;
    }

    options.onRetry?.(failure);
    const sleep = options.sleep ?? defaultSleep;
    await sleep(250);
    return { value: await operation(), retries: 1 };
  }
}

function isSafeImageEditRetry(
  error: unknown,
  failure: TogetherFailure,
  dimensionsAreValid: boolean,
) {
  if (
    !dimensionsAreValid ||
    failure.kind !== "invalid_request" ||
    failure.status !== 400
  ) {
    return false;
  }

  const lower = errorMessage(error).toLowerCase();
  return (
    lower.includes("invalid value for 'width'") ||
    lower.includes("invalid value for 'height'") ||
    lower.includes("unsupported use of width/height") ||
    lower.includes("an error has occurred")
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return undefined;
  }
  const status = Number((error as { status?: unknown }).status);
  return Number.isInteger(status) ? status : undefined;
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function parseSdkError(error: unknown): { code?: string; type?: string } {
  if (!error || typeof error !== "object" || !("error" in error)) return {};
  const nested = (error as { error?: unknown }).error;
  if (!nested || typeof nested !== "object") return {};

  const code = "code" in nested ? nested.code : undefined;
  const type = "type" in nested ? nested.type : undefined;
  return {
    code: typeof code === "string" ? code : undefined,
    type: typeof type === "string" ? type : undefined,
  };
}

function parseProviderError(message: string): {
  status?: number;
  code?: string;
  type?: string;
} {
  const statusMatch = message.match(/^(\d{3})\b/);
  const jsonStart = message.indexOf("{");
  if (jsonStart === -1) {
    return {
      status: statusMatch ? Number(statusMatch[1]) : undefined,
    };
  }

  try {
    const body = JSON.parse(message.slice(jsonStart)) as {
      error?: { code?: unknown; type?: unknown };
    };
    return {
      status: statusMatch ? Number(statusMatch[1]) : undefined,
      code: typeof body.error?.code === "string" ? body.error.code : undefined,
      type: typeof body.error?.type === "string" ? body.error.type : undefined,
    };
  } catch {
    return {
      status: statusMatch ? Number(statusMatch[1]) : undefined,
    };
  }
}

function defaultSleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}
