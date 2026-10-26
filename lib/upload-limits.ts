export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const UPLOAD_CONTENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
} as const;

export type UploadContentType = keyof typeof UPLOAD_CONTENT_TYPES;
