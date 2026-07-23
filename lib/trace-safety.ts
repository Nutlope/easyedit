export function serializeBraintrustError(
  error: unknown,
  sensitiveValues: Array<string | null | undefined> = [],
) {
  const redact = (value: string | undefined) => {
    if (value === undefined) return undefined;

    let redacted = value;
    for (const sensitiveValue of sensitiveValues) {
      if (sensitiveValue) {
        redacted = redacted.replaceAll(sensitiveValue, "[REDACTED]");
      }
    }
    return redacted;
  };

  if (error instanceof Error) {
    return {
      name: error.name,
      message: redact(error.message),
      stack: redact(error.stack),
    };
  }

  return { message: redact(String(error)) };
}
