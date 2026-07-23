import { SUGGESTED_PROMPTS_BENCHMARK_MODELS } from "../lib/model-config";

const API_KEY = process.env.TOGETHER_API_KEY;
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const IMAGE_URL = process.env.IMAGE_URL || "https://picsum.photos/200/300";

const RUNS = Number(process.env.RUNS || 3);

const models =
  process.argv.length > 2
    ? process.argv.slice(2)
    : SUGGESTED_PROMPTS_BENCHMARK_MODELS;

if (!API_KEY) {
  console.error("TOGETHER_API_KEY env var is required");
  process.exit(1);
}

interface BenchResult {
  model: string;
  run: number;
  elapsed: number;
  status: number;
  validJson: boolean;
  validSchema: boolean;
  suggestions: string[];
  finishReason: string;
}

async function bench(model: string, run: number): Promise<BenchResult> {
  const start = Date.now();
  const url = `${BASE_URL}/api/suggested-prompts?imageUrl=${encodeURIComponent(IMAGE_URL)}&model=${encodeURIComponent(model)}`;

  const res = await fetch(url, {
    headers: { "x-api-key": API_KEY! },
  });
  const elapsed = (Date.now() - start) / 1000;
  const status = res.status;
  let body: { suggestions?: unknown };
  try {
    body = await res.json();
  } catch {
    return {
      model,
      run,
      elapsed,
      status,
      validJson: false,
      validSchema: false,
      suggestions: [],
      finishReason: "parse_error",
    };
  }

  const rawSuggestions = body.suggestions;
  const validJson = true;
  const validSchema =
    Array.isArray(rawSuggestions) &&
    rawSuggestions.length === 3 &&
    rawSuggestions.every((s) => typeof s === "string" && s.length > 0);
  const suggestions = validSchema ? (rawSuggestions as string[]) : [];

  return {
    model,
    run,
    elapsed,
    status,
    validJson,
    validSchema,
    suggestions,
    finishReason: "stop",
  };
}

async function main() {
  console.log(`Benchmarking ${models.length} models, ${RUNS} runs each`);
  console.log(`API: ${BASE_URL}`);
  console.log(`Image: ${IMAGE_URL}`);
  console.log();

  const allResults: BenchResult[] = [];

  for (let run = 0; run < RUNS; run++) {
    console.log(`--- Run ${run + 1}/${RUNS} ---`);
    for (const model of models) {
      const r = await bench(model, run);
      allResults.push(r);
      const mark = r.validSchema ? "✓" : "✗";
      console.log(
        `  ${r.elapsed.toFixed(2)}s ${mark} ${r.model} [status=${r.status}] ${r.validSchema ? "" : "(invalid: " + JSON.stringify(r.suggestions).slice(0, 100) + ")"}`,
      );
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY (avg over runs, fastest first):\n");

  const summary = models.map((model) => {
    const runs = allResults.filter((r) => r.model === model);
    const avg = runs.reduce((sum, r) => sum + r.elapsed, 0) / runs.length;
    const validCount = runs.filter((r) => r.validSchema).length;
    return { model, avg, validCount, total: runs.length };
  });

  summary.sort((a, b) => a.avg - b.avg);

  for (const { model, avg, validCount, total } of summary) {
    console.log(`  ${avg.toFixed(2)}s  ${validCount}/${total} valid  ${model}`);
  }
}

main();
