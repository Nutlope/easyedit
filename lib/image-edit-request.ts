/**
 * The Together SDK retries request timeouts five times by default. Its default
 * 60-second timeout can therefore occupy Vercel's entire 300-second function
 * budget before the server action can return a useful error.
 *
 * Image generation is billable and not safe to retry implicitly. Keep the
 * provider timeout, but disable SDK retries; the existing application retry is
 * limited to the one known-safe inconsistent-dimension rejection.
 */
const IMAGE_EDIT_REQUEST_OPTIONS = {
  maxRetries: 0,
  timeout: 60_000,
};

export function requestImageEdit<TRequest, TResponse>(
  create: (
    body: TRequest,
    options: { maxRetries: number; timeout: number },
  ) => Promise<TResponse>,
  body: TRequest,
) {
  return create(body, IMAGE_EDIT_REQUEST_OPTIONS);
}
