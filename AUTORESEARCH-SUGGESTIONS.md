# Image Suggestions API - AutoResearch Report

**Date:** April 16, 2026

## Problem Statement

The image suggestions feature was stuck in loading state forever due to:

1. Using a non-serverless model (`meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8`) that required a dedicated endpoint
2. Models with "thinking/reasoning" capability consuming all tokens on internal reasoning instead of producing content
3. Large uncompressed images increasing prompt token count

## Solutions Implemented

### 1. Model Selection

Tested available serverless vision models:

- `Qwen/Qwen3.5-9B` - Hybrid reasoning model, cheapest option
- `Qwen/Qwen3.5-397B-A17B` - Hybrid reasoning model, faster but expensive
- `moonshotai/Kimi-K2.5` - Hybrid reasoning model, good balance

**Key Finding:** These models burn tokens on `reasoning` field before producing `content`, causing empty responses with low `max_tokens`.

### 2. Disabling Reasoning

Used `reasoning: { enabled: false }` to disable thinking mode on hybrid models:

- Reduces latency from 30-47s to ~1-2s
- Eliminates empty content issue
- Requires `temperature: 0.6` for instant mode (per docs)

### 3. Image Compression (Server-Side)

Added server-side image processing using Sharp:

- Fetches image from any URL (no CORS issues server-side)
- Resizes to max 300px on longest edge
- Converts to JPEG at 80% quality
- Sends base64 data URL to Together AI
- Reduces vision tokens significantly

**Note:** Client-side canvas compression was attempted but reverted due to CORS issues with S3-hosted images.

### 4. API Route Caching

Configured CDN caching via headers:

- `Vercel-CDN-Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800`
- Same image URL cached for 24 hours
- Served stale for up to 7 days during revalidation

**Note:** Client-side image compression was attempted but reverted due to CORS issues with S3-hosted images.

## Benchmark Results (with server-side compression + reasoning disabled)

| Model          | Avg Time  | Valid | Input Cost   | Output Cost  | Total Cost\* |
| -------------- | --------- | ----- | ------------ | ------------ | ------------ |
| **Qwen3.5-9B** | **1.27s** | 3/3   | **$0.10/1M** | **$0.15/1M** | ~$0.0003     |
| Kimi K2.5      | 1.44s     | 3/3   | $0.50/1M     | $2.80/1M     | ~$0.005      |
| Qwen3.5-397B   | 1.17s     | 3/3   | $0.60/1M     | $3.60/1M     | ~$0.006      |

\*Est. cost per request (~200 input tokens, ~20 output tokens)

## Final Configuration

```typescript
// Route defaults
model: "Qwen/Qwen3.5-9B"
max_tokens: 200
temperature: 0.6
reasoning: { enabled: false }
response_format: { type: "json_object", schema: jsonSchema }

// Server-side compression (Sharp)
maxWidth: 300px
quality: 0.8 JPEG
```

## Recommendation

**Use Qwen3.5-9B as default** - Only 0.48s slower than Kimi but **19x cheaper** on output tokens. Perfectly adequate for simple edit suggestions.

## July 31, 2026 reliability follow-up

A production Qwen request reached Vercel's 300-second limit because the SDK's
automatic retries multiplied a rare upstream stall. The model's normal latency
was not the cause:

| Model                       | Strict budget | Valid | Average | Estimated cost/call |
| --------------------------- | ------------: | ----: | ------: | ------------------: |
| `Qwen/Qwen3.5-9B`           |     3 seconds | 20/20 |   0.68s |           $0.000033 |
| `moonshotai/Kimi-K2.7-Code` |     3 seconds | 20/20 |   0.66s |           $0.000285 |

This change keeps Qwen as the cheap primary and uses Kimi K2.7 Code as a diverse
fallback. Each attempt has a 2.5-second timeout and `maxRetries: 0`, so the
provider path is bounded to about five seconds instead of 300 seconds.

## Files Changed

- `app/api/suggested-prompts/route.ts` - New API route with Sharp image compression + CDN caching
- `app/suggested-prompts/SuggestedPrompts.tsx` - Fetch from API
- `scripts/bench-suggested-prompts.ts` - Benchmarking tool
- Deleted: `app/suggested-prompts/actions.ts` - Old server action

## Notes

- Removed `dedent` and long system prompts - short prompts work better
- Removed `FLUX 2` context - not needed for simple suggestions
- SDK types don't include `reasoning` param yet, cast to `any`
- Added `sharp` dependency for server-side image processing
