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
