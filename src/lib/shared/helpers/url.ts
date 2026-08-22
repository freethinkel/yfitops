export const toQueryParams = (params: Record<string, unknown>) => {
  const sp = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    sp.append(key, String(value ?? ""));
  });

  return sp;
};

export const buildUrl = (url: string, queryParams: Record<string, unknown>) => {
  const uri = new URL(url);

  Object.entries(queryParams).forEach(([key, value]) => {
    uri.searchParams.append(key, String(value ?? ""));
  });

  return uri;
};

/** spclient and Connect hand cover art as a uri; only the CDN form loads in an img. */
export const coverUrl = (url: string) =>
  url.startsWith("spotify:image:")
    ? `https://i.scdn.co/image/${url.slice("spotify:image:".length)}`
    : url;
