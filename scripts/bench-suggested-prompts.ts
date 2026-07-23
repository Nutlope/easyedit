// Benchmarks Together vision models for the suggested-prompts feature.
// Calls the Together chat completions API directly with the EXACT request
// shape used by app/api/suggested-prompts/route.ts — image input, reasoning
// disabled, and JSON-schema output — so results reflect pure model latency
// and compatibility, independent of the Next.js route, CDN caching, and the
// server-side image fetch.
//
// Usage:
//   TOGETHER_API_KEY=... npx tsx scripts/bench-suggested-prompts.ts
//   RUNS=5 IMAGE_URL=https://... npx tsx scripts/bench-suggested-prompts.ts
//   npx tsx scripts/bench-suggested-prompts.ts google/gemma-3n-E4B-it Qwen/Qwen3.5-9B
//
// Env:
//   TOGETHER_API_KEY  (required) Together API key.
//   IMAGE_URL         Source image; compressed to a 300x300 JPEG like the route.
//   RUNS              Runs per model (default 3).
//   TIMEOUT_MS        Per-call timeout (default 90000).

import { SUGGESTED_PROMPTS_BENCHMARK_MODELS } from "../lib/model-config";
import {
  buildSuggestedPromptsRequestBody,
  fetchAndCompressImage,
} from "../lib/suggested-prompts";

const API_KEY = process.env.TOGETHER_API_KEY;
const IMAGE_URL = process.env.IMAGE_URL || "https://picsum.photos/200/300";
const RUNS = Number(process.env.RUNS || 3);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 90_000);

const models =
  process.argv.length > 2
    ? process.argv.slice(2)
    : [...SUGGESTED_PROMPTS_BENCHMARK_MODELS];

// Calls fired at once per round. Defaults to all models concurrent (the mode
// used for the wide benchmark); set CONCURRENCY=1 for sequential runs that
// remove cross-model queueing when confirming a shortlist.
const CONCURRENCY = process.env.CONCURRENCY
  ? Number(process.env.CONCURRENCY)
  : models.length;

if (!API_KEY) {
  console.error("TOGETHER_API_KEY env var is required");
  process.exit(1);
}

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface BenchResult {
  model: string;
  run: number;
  elapsed: number;
  status: number;
  valid: boolean;
  error: string | null;
  suggestions: string[];
  usage: Usage | null;
}

function isValidSuggestions(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((s) => typeof s === "string" && s.length > 0)
  );
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

async function probe(model: string, run: number, dataUrl: string): Promise<BenchResult> {
  const start = Date.now();
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let status = 0;
  let error: string | null = null;
  let parsed: unknown = null;
  let usage: Usage | null = null;
  try {
    const response = await fetch("https://api.together.xyz/v1/chat/completions", {
      method: "POST",
      signal: ac.signal,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        buildSuggestedPromptsRequestBody({ model, imageUrl: dataUrl }),
      ),
    });
    status = response.status;
    const body = await response.json();
    usage = (body?.usage ?? null) as Usage | null;
    if (!response.ok) {
      error = (body?.error?.message || JSON.stringify(body)).slice(0, 220);
    } else {
      const content = body?.choices?.[0]?.message?.content;
      try {
        parsed = JSON.parse(content);
      } catch {
        error = `json_parse_fail: ${String(content).slice(0, 120)}`;
      }
    }
  } catch (e) {
    error = (
      e instanceof Error && e.name === "AbortError"
        ? "timeout"
        : e instanceof Error
          ? e.message
          : String(e)
    ).slice(0, 220);
  } finally {
    clearTimeout(timeout);
  }
  const elapsed = (Date.now() - start) / 1000;
  const valid = error === null && isValidSuggestions(parsed);
  if (!valid && error === null) {
    error = `invalid_schema: ${JSON.stringify(parsed).slice(0, 120)}`;
  }
  const suggestions = valid ? (parsed as string[]) : [];
  return { model, run, elapsed, status, valid, error, suggestions, usage };
}

// Catalog prices are USD per million tokens.
async function fetchPrices(
  modelIds: string[],
): Promise<Map<string, { input: number; output: number }>> {
  const prices = new Map<string, { input: number; output: number }>();
  try {
    const response = await fetch("https://api.together.xyz/v1/models", {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!response.ok) return prices;
    const body = await response.json();
    const catalog: { id: string; pricing?: { input?: number; output?: number } }[] =
      Array.isArray(body) ? body : (body.data ?? []);
    for (const entry of catalog) {
      if (modelIds.includes(entry.id) && entry.pricing) {
        prices.set(entry.id, {
          input: entry.pricing.input ?? 0,
          output: entry.pricing.output ?? 0,
        });
      }
    }
  } catch {
    // Prices are optional — the benchmark still runs without cost estimates.
  }
  return prices;
}

function formatCost(cost: number | null): string {
  if (cost === null || !Number.isFinite(cost)) return "   --   ";
  return cost < 0.01 ? `$${cost.toFixed(6)}` : `$${cost.toFixed(4)}`;
}

async function main() {
  console.log(`Benchmarking ${models.length} models, ${RUNS} runs each`);
  console.log(`Image: ${IMAGE_URL} (compressed to 300x300 JPEG)`);
  console.log(`Reasoning: disabled for all models`);
  console.log(`Direct calls to api.together.xyz (bypassing the route)`);
  console.log(
    `Concurrency: ${CONCURRENCY === 1 ? "sequential" : `${CONCURRENCY} at a time`}\n`,
  );

  const dataUrl = await fetchAndCompressImage(IMAGE_URL);
  const prices = await fetchPrices(models);

  const allResults: BenchResult[] = [];

  for (let run = 1; run <= RUNS; run++) {
    console.log(`--- Run ${run}/${RUNS} ---`);
    // Each call is timed independently with a timeout. CONCURRENCY controls how
    // many fire at once (default: all concurrent; 1 = sequential).
    const results = await mapLimit(models, CONCURRENCY, (m) => probe(m, run, dataUrl));
    for (const r of results) {
      allResults.push(r);
      const mark = r.valid ? "✓" : "✗";
      const detail = r.valid
        ? JSON.stringify(r.suggestions).slice(0, 90)
        : `[${r.status}] ${r.error}`;
      console.log(`  ${r.elapsed.toFixed(2)}s ${mark} ${r.model}  ${detail}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY (fastest first; valid runs only):\n");

  const summary = models.map((model) => {
    const runs = allResults.filter((r) => r.model === model);
    const valid = runs.filter((r) => r.valid);
    const avg =
      valid.length > 0 ? valid.reduce((sum, r) => sum + r.elapsed, 0) / valid.length : NaN;
    let cost: number | null = null;
    if (valid.length > 0 && prices.has(model)) {
      const { input, output } = prices.get(model)!;
      cost =
        valid.reduce((sum, r) => {
          const prompt = r.usage?.prompt_tokens ?? 0;
          const completion = r.usage?.completion_tokens ?? 0;
          return sum + (prompt * input + completion * output) / 1e6;
        }, 0) / valid.length;
    }
    return { model, avg, valid: valid.length, total: runs.length, cost };
  });

  summary.sort((a, b) =>
    Number.isNaN(a.avg) ? 1 : Number.isNaN(b.avg) ? -1 : a.avg - b.avg,
  );

  for (const { model, avg, valid, total, cost } of summary) {
    const time = Number.isNaN(avg) ? "  --  " : `${avg.toFixed(2)}s`;
    console.log(
      `  ${time}  ${valid}/${total} valid  ${formatCost(cost)}/call  ${model}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});