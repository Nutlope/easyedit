import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_CONTENT_TYPES,
  type UploadContentType,
} from "./upload-limits";

export const UPLOAD_KEY_PREFIX = "next-s3-uploads/";

const uploadRequestSchema = z.object({
  filetype: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value): value is UploadContentType =>
      Object.hasOwn(UPLOAD_CONTENT_TYPES, value),
    ),
  filesize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export type UploadRequest = {
  contentType: UploadContentType;
  contentLength: number;
};

export function parseUploadRequest(body: unknown): UploadRequest | null {
  const parsed = uploadRequestSchema.safeParse(body);
  if (!parsed.success) return null;
  return {
    contentType: parsed.data.filetype as UploadContentType,
    contentLength: parsed.data.filesize,
  };
}

export function createUploadKey(
  contentType: UploadContentType,
  id: string = randomUUID(),
) {
  return `${UPLOAD_KEY_PREFIX}${id}/image.${UPLOAD_CONTENT_TYPES[contentType]}`;
}
