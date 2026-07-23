import { CONFIGURED_MODELS } from "../lib/model-config";

const apiKey = process.env.TOGETHER_API_KEY;
if (!apiKey) {
  throw new Error("TOGETHER_API_KEY is required to query the live catalog");
}

type CatalogModel = {
  id?: string;
  type?: string;
  pricing?: {
    input?: number;
    output?: number;
    image?:
      | number
      | {
          example_price?: number;
          example_description?: string;
        };
  };
};

const expected = {
  "black-forest-labs/FLUX.2-flex": {
    type: "image",
    imagePrice: 0.03,
  },
  "black-forest-labs/FLUX.2-pro": {
    type: "image",
    imagePrice: 0.03,
  },
  "Qwen/Qwen3.5-9B": {
    type: "chat",
    inputPrice: 0.17,
    outputPrice: 0.25,
  },
  "Qwen/Qwen3.5-397B-A17B": {
    type: "chat",
    inputPrice: 0.6,
    outputPrice: 3.6,
  },
} as const;

async function main() {
  const response = await fetch("https://api.together.xyz/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`Together model catalog returned ${response.status}`);
  }

  const body = (await response.json()) as
    | CatalogModel[]
    | { data?: CatalogModel[] };
  const catalog = Array.isArray(body) ? body : (body.data ?? []);

  const results = CONFIGURED_MODELS.map((model) => {
    const entry = catalog.find((candidate) => candidate.id === model);
    const expectation = expected[model];
    const imagePrice =
      typeof entry?.pricing?.image === "object"
        ? (entry.pricing.image.example_price ?? null)
        : null;
    const matches =
      entry?.type === expectation.type &&
      ("imagePrice" in expectation
        ? imagePrice === expectation.imagePrice
        : entry?.pricing?.input === expectation.inputPrice &&
          entry?.pricing?.output === expectation.outputPrice);

    return {
      model,
      present: Boolean(entry),
      type: entry?.type ?? null,
      inputPrice: entry?.pricing?.input ?? null,
      outputPrice: entry?.pricing?.output ?? null,
      imagePrice,
      matches,
    };
  });

  if (results.some((result) => !result.matches)) {
    throw new Error(`Model verification failed: ${JSON.stringify(results)}`);
  }

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        catalogModels: catalog.length,
        configuredModels: results,
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
