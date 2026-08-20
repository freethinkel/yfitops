/**
 * Spotify measures its rate limit over a rolling 30 second window and answers
 * a 429 with `Retry-After` in seconds. Nothing here retries by itself — the
 * point is that "rate limited, 12s" reads as something to wait out, where a
 * bare "HTTP 429" reads as a fault.
 */
export const httpError = (scope: string, response: Response) => {
  if (response.status !== 429) {
    return new Error(`${scope}: HTTP ${response.status}`);
  }

  const after = response.headers.get("retry-after");

  return new Error(
    after ? `${scope}: rate limited, retry in ${after}s` : `${scope}: rate limited`,
  );
};
