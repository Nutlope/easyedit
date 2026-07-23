import { execFileSync } from "node:child_process";

const marker = requiredEnv("TRACE_MARKER");
const project = process.env.BRAINTRUST_PROJECT ?? "easyedit";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

type LogRow = {
  error: unknown;
  input: { prompt?: string } | null;
  is_root: boolean;
  metadata: Record<string, unknown> | null;
  metrics: Record<string, number>;
  output: Record<string, unknown> | null;
  root_span_id: string;
  span_attributes: { name?: string };
  span_id: string;
};

function queryRows(): LogRow[] {
  const output = execFileSync(
    "node_modules/.bin/bt",
    [
      "view",
      "logs",
      "-p",
      project,
      "--no-input",
      "--quiet",
      "--json",
      "--window",
      "30m",
      "--limit",
      "20",
      "--preview-length",
      "100000",
      "--list-mode",
      "spans",
      "--search",
      marker,
    ],
    { encoding: "utf8" },
  );

  const result = JSON.parse(output) as { items?: Array<{ row: LogRow }> };
  return result.items?.map((item) => item.row) ?? [];
}

async function main() {
  let rows: LogRow[] = [];
  for (let attempt = 0; attempt < 15; attempt += 1) {
    rows = queryRows();
    if (
      rows.some((row) => row.metadata?.success === true || row.error != null)
    ) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  const trace = rows.find(
    (row) => row.span_attributes.name === "easyedit.edit-image",
  );
  const serialized = JSON.stringify(trace);
  const outputUrl = trace?.output?.imageUrl;
  const failures = [
    [Boolean(trace), "image-edit span is missing"],
    [trace?.is_root === true, "image-edit span is not a root span"],
    [trace?.error == null, "image-edit span contains an error"],
    [trace?.metadata?.success === true, "image edit is not marked successful"],
    [
      trace?.metadata?.model === "black-forest-labs/FLUX.2-flex",
      "model metadata is wrong",
    ],
    [
      typeof trace?.metadata?.width === "number" &&
        typeof trace?.metadata?.height === "number",
      "adjusted dimensions are missing",
    ],
    [trace?.metadata?.byok === false, "BYOK metadata is wrong"],
    [(trace?.metrics.duration_ms ?? 0) > 0, "latency metric is missing"],
    [trace?.metrics.estimated_cost === 0.03, "estimated image cost is wrong"],
    [trace?.output?.imageCount === 1, "image count output is wrong"],
    [
      typeof outputUrl === "string" && outputUrl.startsWith("http"),
      "returned image URL is missing",
    ],
    [trace?.input?.prompt?.includes(marker) === true, "edit prompt is missing"],
    [!serialized.includes("b64_json"), "trace contains a base64 field"],
    [!serialized.includes("data:image"), "trace contains image payload bytes"],
    [!serialized.includes("userAPIKey"), "trace contains a user API key field"],
    [
      !serialized.includes("sourceImageUrl") &&
        !serialized.includes('"imageUrl":"data:'),
      "trace contains a source image field",
    ],
  ].filter(([passed]) => !passed);

  if (failures.length > 0) {
    throw new Error(
      `Braintrust trace verification failed:\n${failures
        .map(([, message]) => `- ${message}`)
        .join("\n")}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        rootSpanId: trace?.root_span_id,
        spanId: trace?.span_id,
        span: trace?.span_attributes.name,
        model: trace?.metadata?.model,
        dimensions: `${trace?.metadata?.width}x${trace?.metadata?.height}`,
        byok: trace?.metadata?.byok,
        durationMs: trace?.metrics.duration_ms,
        providerDurationMs: trace?.metrics.provider_duration_ms,
        estimatedCostUsd: trace?.metrics.estimated_cost,
        outputImageUrlRecorded: true,
        privacyChecksPassed: true,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
