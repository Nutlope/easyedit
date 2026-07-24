import "server-only";

import {
  initLogger,
  type ExperimentLogPartialArgs,
  type Logger,
  type Span,
  type StartSpanArgs,
} from "braintrust";
import { serializeBraintrustError } from "@/lib/trace-safety";

let logger: Logger<true> | null | undefined;

function getBraintrustLogger() {
  if (!process.env.BRAINTRUST_API_KEY) return undefined;

  if (logger !== undefined) {
    return logger ?? undefined;
  }

  try {
    logger = initLogger({
      apiKey: process.env.BRAINTRUST_API_KEY,
      projectName: process.env.BRAINTRUST_PROJECT ?? "easyedit",
      asyncFlush: true,
    });
  } catch (error) {
    logger = null;
    console.warn("Braintrust logger initialization failed:", error);
  }

  return logger ?? undefined;
}

export function startBraintrustSpan(args: StartSpanArgs) {
  try {
    return getBraintrustLogger()?.startSpan(args);
  } catch (error) {
    console.warn("Braintrust span initialization failed:", error);
    return undefined;
  }
}

export function logBraintrustEvent(
  span: Span | undefined,
  event: ExperimentLogPartialArgs,
) {
  try {
    span?.log(event);
  } catch (error) {
    console.warn("Braintrust span logging failed:", error);
  }
}

export async function endAndFlushBraintrustSpan(span: Span | undefined) {
  try {
    span?.end();
    await span?.flush();
  } catch (error) {
    console.warn("Braintrust span flush failed:", error);
  }
}

export async function logBraintrustFailure(
  args: StartSpanArgs,
  error: unknown,
  sensitiveValues: Array<string | null | undefined> = [],
) {
  const span = startBraintrustSpan({
    ...args,
    event: {
      ...args.event,
      error: serializeBraintrustError(error, sensitiveValues),
    },
  });
  await endAndFlushBraintrustSpan(span);
}

export async function logBraintrustOutcome(args: StartSpanArgs) {
  const span = startBraintrustSpan(args);
  await endAndFlushBraintrustSpan(span);
}

export type { Span };
