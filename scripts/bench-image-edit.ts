import { getAdjustedDimensions } from "../lib/get-adjusted-dimentions";
import {
  IMAGE_EDIT_MODELS,
  IMAGE_EDIT_MODEL_SPEC,
  type ImageEditModel,
} from "../lib/model-config";

const API_KEY = process.env.TOGETHER_API_KEY;
if (!API_KEY) {
  console.error("TOGETHER_API_KEY env var is required");
  process.exit(1);
}

const RUNS = Number(process.env.RUNS || 3);

// Source image used for every edit so models are compared fairly. Defaults to
// the cafe sample (986x1752, portrait); its natural dimensions drive
// getAdjustedDimensions so each model gets the output size the app would send.
const IMAGE_URL =
  process.env.IMAGE_URL ||
  "https://napkinsdev.s3.us-east-1.amazonaws.com/next-s3-uploads/39f8ea0e-000f-49bc-9f52-ed1cfb4e4230/free-photo-of-casual-man-working-on-laptop-in-cozy-cafe.jpeg";
const SOURCE_WIDTH = Number(process.env.SOURCE_WIDTH || 986);
const SOURCE_HEIGHT = Number(process.env.SOURCE_HEIGHT || 1752);
const PROMPT = process.env.PROMPT || "Make the background a solid blue color.";

const models = [...IMAGE_EDIT_MODELS];

type Run = {
  model: string;
  run: number;
  elapsed: number;
  ok: boolean;
  status: number;
  dims: string;
  error?: string;
};

async function editOnce(model: ImageEditModel, run: number): Promise<Run> {
  const dims = getAdjustedDimensions(SOURCE_WIDTH, SOURCE_HEIGHT, model);
  const param = IMAGE_EDIT_MODEL_SPEC[model].param;
  const body: Record<string, unknown> = {
    model,
    prompt: PROMPT,
    width: dims.width,
    height: dims.height,
  };
  if (param === "image_url") body.image_url = IMAGE_URL;
  else body.reference_images = [IMAGE_URL];

  const start = Date.now();
  let status = 0;
  let ok = false;
  let error: string | undefined;
  try {
    const res = await fetch("https://api.together.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    status = res.status;
    ok = res.ok;
    if (!ok) {
      const p = (await res.json()) as { error?: { message?: string } };
      error = p?.error?.message?.slice(0, 160);
    }
  } catch (e) {
    status = 0;
    error = String((e as Error).message).slice(0, 160);
  }
  const elapsed = (Date.now() - start) / 1000;
  return { model, run, elapsed, ok, status, dims: `${dims.width}x${dims.height}`, error };
}

function summarize(samples: number[]) {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  return {
    min: Number(sorted[0].toFixed(2)),
    median: Number(median.toFixed(2)),
    mean: Number(mean.toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    samples: samples.length,
  };
}

async function main() {
  console.log(`Benchmarking ${models.length} image-edit models, ${RUNS} runs each`);
  console.log(`Image: ${IMAGE_URL} (${SOURCE_WIDTH}x${SOURCE_HEIGHT})`);
  console.log(`Prompt: ${PROMPT}\n`);

  const all: Run[] = [];
  for (let run = 0; run < RUNS; run++) {
    console.log(`--- Run ${run + 1}/${RUNS} ---`);
    // Models run concurrently within a round (independent model endpoints);
    // rounds are sequential so latency is measured across time, not contended.
    const results = await Promise.all(models.map((m) => editOnce(m, run)));
    for (const r of results) {
      all.push(r);
      const mark = r.ok ? "✓" : "✗";
      console.log(
        `  ${r.elapsed.toFixed(1)}s ${mark} ${r.model} [${r.dims}, status=${r.status}]${r.error ? " " + r.error : ""}`,
      );
    }
  }

  console.log("\n" + "=".repeat(64));
  console.log("SUMMARY (median edit latency, fastest first):\n");

  const summary = models
    .map((model) => {
      const runs = all.filter((r) => r.model === model);
      const okRuns = runs.filter((r) => r.ok).map((r) => r.elapsed);
      return {
        model,
        dims: runs[0]?.dims ?? "",
        stats: summarize(okRuns),
        failures: runs.length - okRuns.length,
      };
    })
    .sort(
      (a, b) =>
        (a.stats?.median ?? Infinity) - (b.stats?.median ?? Infinity),
    );

  for (const { model, dims, stats, failures } of summary) {
    if (!stats) {
      console.log(`  FAILED   ${model}  (${failures}/${RUNS} runs failed)`);
    } else {
      console.log(
        `  ${stats.median.toFixed(1)}s  (mean ${stats.mean.toFixed(1)}, min ${stats.min.toFixed(1)}, max ${stats.max.toFixed(1)})  ${model} [${dims}]${failures ? `   ${failures}/${RUNS} failed` : ""}`,
      );
    }
  }

  console.log(
    "\n" +
      JSON.stringify(
        { benchmarkedAt: new Date().toISOString(), runs: RUNS, summary },
        null,
        2,
      ),
  );
}

main();