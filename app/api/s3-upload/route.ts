import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { createUploadKey, parseUploadRequest } from "@/lib/upload-policy";
import { NextResponse } from "next/server";

const UPLOAD_URL_TTL_SECONDS = 5 * 60;

export async function POST(request: Request) {
  const rateLimitResult = await enforceRateLimit("uploadBurst", "uploadDaily");
  if (rateLimitResult.status === "limited") {
    return errorResponse("Too many uploads. Please try again later.", 429);
  }
  if (rateLimitResult.status === "unavailable") {
    return errorResponse(
      "Uploads are temporarily unavailable. Please try again soon.",
      503,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid upload request.", 400);
  }

  const upload = parseUploadRequest(body);
  if (!upload) {
    return errorResponse(
      "Please upload a JPEG, PNG, WebP, GIF, or AVIF image up to 10 MB.",
      400,
    );
  }

  const bucket = process.env.S3_UPLOAD_BUCKET;
  const region = process.env.S3_UPLOAD_REGION;
  const accessKeyId = process.env.S3_UPLOAD_KEY;
  const secretAccessKey = process.env.S3_UPLOAD_SECRET;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    console.error("S3 upload is not configured");
    return errorResponse(
      "Uploads are temporarily unavailable. Please try again soon.",
      503,
    );
  }

  try {
    const client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
    const key = createUploadKey(upload.contentType);
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: upload.contentType,
        ContentLength: upload.contentLength,
      }),
      {
        expiresIn: UPLOAD_URL_TTL_SECONDS,
        signableHeaders: new Set(["content-type", "content-length"]),
      },
    );

    return NextResponse.json(
      { url, key, bucket, region },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "S3 upload presign failed:",
      error instanceof Error ? error.name : "unknown",
    );
    return errorResponse(
      "Uploads are temporarily unavailable. Please try again soon.",
      503,
    );
  }
}

function errorResponse(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
