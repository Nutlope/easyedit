/**
 * Shared suggested-prompts request shape, used by both the Next.js route
 * (app/api/suggested-prompts/route.ts) and the benchmark script
 * (scripts/bench-suggested-prompts.ts). Extracting the prompt, JSON schema,
 * image compression, and request body here keeps the bench from drifting from
 * production — the script no longer has to "mirror the route verbatim".
 */
import sharp from "sharp";
import { z } from "zod/v4";
import { fetchRemoteImage, RemoteImageError } from "./remote-image";

const SUGGESTED_PROMPTS_SYSTEM_PROMPT = `Suggest exactly 3 simple image edits. Output ONLY a JSON array of 3 short strings (5-8 words each). Example: ["edit 1","edit 2","edit 3"]`;

/** Zod schema for the 3-string suggestion array (used to validate the model output). */
export const suggestedPromptsSchema = z
  .array(z.string().trim().min(1).max(120))
  .length(3);

/** JSON-schema sent to the model via `response_format` so output is parseable. */
const suggestedPromptsJsonSchema = z.toJSONSchema(suggestedPromptsSchema);

/**
 * Fetch the source image server-side (no CORS issues) and compress it to a
 * 300x300 JPEG data URL — small enough that token cost stays negligible. Shared
 * so the benchmark compresses exactly the way production does.
 */
export async function fetchAndCompressImage(imageUrl: string): Promise<string> {
  const buffer = await fetchRemoteImage(imageUrl);
  return compressImageBuffer(buffer);
}

export async function compressImageBuffer(buffer: Buffer): Promise<string> {
  let compressedBuffer: Buffer;
  try {
    compressedBuffer = await sharp(buffer)
      .resize(300, 300, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();
  } catch {
    throw new RemoteImageError("decode_failed", "Image could not be decoded");
  }

  return `data:image/jpeg;base64,${compressedBuffer.toString("base64")}`;
}

/**
 * Build the Together chat-completions body for a suggested-prompts request.
 * The body is returned as a plain record so the untyped `reasoning` field (the
 * together-ai 0.16 SDK does not expose it) needs no per-field suppression; the
 * caller casts to the SDK param type at the call site. Both the route and the
 * bench build the body through this so the request shape stays identical.
 */
export function buildSuggestedPromptsRequestBody(args: {
  model: string;
  imageUrl: string;
}): Record<string, unknown> {
  return {
    model: args.model,
    max_tokens: 200,
    temperature: 0.6,
    // Reasoning is disabled for every model, matching the route. Non-reasoning
    // models ignore the field; reasoning models skip the thinking step so the
    // measured latency reflects suggestion generation only.
    reasoning: { enabled: false },
    messages: [
      { role: "system", content: SUGGESTED_PROMPTS_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: args.imageUrl } },
          { type: "text", text: "Suggest 3 edits." },
        ],
      },
    ],
    response_format: {
      type: "json_object",
      schema: suggestedPromptsJsonSchema,
    },
  };
}
