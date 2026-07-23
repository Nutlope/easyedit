import { getTogether } from "@/lib/get-together";
import { SUGGESTED_PROMPTS_MODEL } from "@/lib/model-config";
import {
  getIPAddress,
  getRateLimiter,
  isLocalRequest,
} from "@/lib/rate-limiter";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod/v4";

const schema = z.array(z.string());
const jsonSchema = z.toJSONSchema(schema);

export const revalidate = 86400;

const ratelimit = getRateLimiter();

const SYSTEM_PROMPT = `Suggest exactly 3 simple image edits. Output ONLY a JSON array of 3 short strings (5-8 words each). Example: ["edit 1","edit 2","edit 3"]`;

async function fetchAndCompressImage(imageUrl: string): Promise<string> {
  // Fetch image server-side (no CORS issues)
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Use sharp to resize and compress
  const compressedBuffer = await sharp(buffer)
    .resize(300, 300, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80, progressive: true })
    .toBuffer();

  // Convert to base64 data URL
  const base64 = compressedBuffer.toString("base64");
  return `data:image/jpeg;base64,${base64}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const imageUrl = searchParams.get("imageUrl");
  const model = searchParams.get("model") || SUGGESTED_PROMPTS_MODEL;

  if (!imageUrl) {
    return NextResponse.json(
      { error: "imageUrl query parameter is required" },
      { status: 400 },
    );
  }

  const userAPIKey = request.headers.get("x-api-key") || null;

  if (ratelimit && !userAPIKey) {
    // Skip the rate limit when running locally (see isLocalRequest) so
    // testing on localhost is never throttled. Production keeps the limit.
    const isLocal = await isLocalRequest();
    if (!isLocal) {
      const ipAddress = await getIPAddress();

      const { success } = await ratelimit.limit(`${ipAddress}-suggestions`);
      if (!success) {
        return NextResponse.json(
          { suggestions: [] },
          {
            status: 429,
            headers: { "Cache-Control": "no-store" },
          },
        );
      }
    }
  }

  const together = getTogether(userAPIKey);

  try {
    // Compress image server-side to reduce tokens
    const compressedImageUrl = await fetchAndCompressImage(imageUrl);

    const response = await together.chat.completions.create({
      model,
      max_tokens: 200,
      temperature: 0.6,
      // @ts-expect-error Together SDK 0.16 does not expose this supported field.
      reasoning: { enabled: false },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: compressedImageUrl } },
            { type: "text", text: "Suggest 3 edits." },
          ],
        },
      ],
      response_format: { type: "json_object", schema: jsonSchema },
    });

    if (!response?.choices?.[0]?.message?.content) {
      return NextResponse.json({ suggestions: [] });
    }

    const json = JSON.parse(response.choices[0].message.content);
    const result = schema.safeParse(json);

    if (result.error) {
      return NextResponse.json({ suggestions: [] });
    }

    return NextResponse.json(
      { suggestions: result.data },
      {
        headers: {
          "Vercel-CDN-Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=604800",
          "CDN-Cache-Control": "public, s-maxage=86400",
          "Cache-Control": "public, max-age=0, s-maxage=86400",
        },
      },
    );
  } catch (e) {
    console.error("suggested-prompts error:", e);
    return NextResponse.json({ suggestions: [] }, { status: 500 });
  }
}
