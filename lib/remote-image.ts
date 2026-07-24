import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export type RemoteImageErrorCode =
  | "invalid_url"
  | "unsafe_url"
  | "fetch_failed"
  | "too_many_redirects"
  | "unsupported_type"
  | "too_large"
  | "decode_failed";

export class RemoteImageError extends Error {
  constructor(
    public readonly code: RemoteImageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RemoteImageError";
  }
}

type LookupAddress = { address: string; family: number };
type Lookup = (hostname: string) => Promise<LookupAddress[]>;
type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type FetchRemoteImageOptions = {
  fetch?: Fetch;
  lookup?: Lookup;
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
};

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;
const TRUSTED_IMAGE_HOSTS = new Set([
  "api.together.ai",
  "api.together.xyz",
  "s3.amazonaws.com",
]);
const S3_HOST_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.)?s3(?:-accelerate)?(?:\.dualstack)?(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/i;

export async function fetchRemoteImage(
  imageUrl: string,
  options: FetchRemoteImageOptions = {},
): Promise<Buffer> {
  const fetchImpl = options.fetch ?? fetch;
  const lookup = options.lookup ?? lookupPublicAddresses;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let currentUrl = await validateRemoteImageUrl(imageUrl, lookup);

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: "image/*" },
      });
    } catch (error) {
      throw new RemoteImageError(
        "fetch_failed",
        `Failed to fetch image: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new RemoteImageError(
          "fetch_failed",
          "Image redirect is missing a location",
        );
      }
      if (redirects === maxRedirects) {
        throw new RemoteImageError(
          "too_many_redirects",
          "Image redirected too many times",
        );
      }
      currentUrl = await validateRemoteImageUrl(
        new URL(location, currentUrl).toString(),
        lookup,
      );
      continue;
    }

    if (!response.ok) {
      throw new RemoteImageError(
        "fetch_failed",
        `Failed to fetch image: ${response.status}`,
      );
    }

    const contentType = response.headers.get("content-type")?.toLowerCase();
    if (
      !contentType?.startsWith("image/") &&
      contentType !== "application/octet-stream"
    ) {
      throw new RemoteImageError(
        "unsupported_type",
        `Unsupported image content type: ${contentType ?? "missing"}`,
      );
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new RemoteImageError("too_large", "Image exceeds the size limit");
    }

    return readResponseWithLimit(response, maxBytes);
  }

  throw new RemoteImageError(
    "too_many_redirects",
    "Image redirected too many times",
  );
}

export async function validateRemoteImageUrl(
  imageUrl: string,
  lookup: Lookup = lookupPublicAddresses,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    throw new RemoteImageError("invalid_url", "Image URL is invalid");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new RemoteImageError(
      "unsafe_url",
      "Only HTTP(S) image URLs are allowed",
    );
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new RemoteImageError("unsafe_url", "Private image URLs are blocked");
  }
  if (!TRUSTED_IMAGE_HOSTS.has(hostname) && !S3_HOST_PATTERN.test(hostname)) {
    throw new RemoteImageError(
      "unsafe_url",
      "Image host is not trusted by this application",
    );
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname);
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicIp(address))
  ) {
    throw new RemoteImageError("unsafe_url", "Private image URLs are blocked");
  }

  return url;
}

async function lookupPublicAddresses(hostname: string) {
  try {
    return await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new RemoteImageError(
      "fetch_failed",
      "Image hostname could not be resolved",
    );
  }
}

function isPublicIp(address: string) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "::1" || normalized === "::") return false;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
  if (/^fe[89ab]/.test(normalized)) return false;
  if (normalized.startsWith("::ffff:")) {
    return isPublicIpv4(normalized.slice("::ffff:".length));
  }
  if (isIP(normalized) === 4) return isPublicIpv4(normalized);
  return isIP(normalized) === 6;
}

function isPublicIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [a, b] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

async function readResponseWithLimit(response: Response, maxBytes: number) {
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new RemoteImageError("too_large", "Image exceeds the size limit");
    }
    chunks.push(value);
  }

  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    total,
  );
}
