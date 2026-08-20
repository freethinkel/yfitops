import { fetch } from "@tauri-apps/plugin-http";

/**
 * The web player's GraphQL gateway. It carries what the public Web API does
 * not: the home feed with Discover Weekly, the daily mixes and the rest of
 * "Made for you". Queries are persisted — only a document hash goes over the
 * wire, and those hashes live in the player's JS bundle, so they change when
 * Spotify ships a new build.
 */
const PATHFINDER_URL = "https://api-partner.spotify.com/pathfinder/v2/query";
const CLIENT_TOKEN_URL = "https://clienttoken.spotify.com/v1/clienttoken";

/** The web player's own id — the gateway rejects requests from unknown ones. */
const WEB_PLAYER_CLIENT_ID = "d8a5ed958d274c2e8ee717e6a4b0971d";
const WEB_PLAYER_VERSION = "1.2.98.104.ga2fc9a0c-development";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const DEVICE_ID_KEY = "pathfinder_device_id";
const META_KEY = "web-player-meta";
const WEB_PLAYER_URL = "https://open.spotify.com/";
const CDN = "https://open.spotifycdn.com/cdn/build/web-player";

const deviceId = () => {
  let id = localStorage.getItem(DEVICE_ID_KEY);

  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }

  return id;
};

/**
 * A stalled connection used to leave the promise pending for good — the home
 * feed sat on its skeletons with nothing in the console. Two guards, because
 * neither covers the other: `connectTimeout` is the only one the Rust side can
 * actually act on, and the race is what guarantees the promise settles.
 *
 * Deliberately no AbortSignal: the plugin cancels by the request's resource id,
 * which `fetch_send` has already consumed by then, so aborting can only fail —
 * loudly, as an unhandled rejection, and without stopping anything. Losing the
 * race leaves the request running on the Rust side; the point is to stop
 * waiting on it, not to stop it.
 */
const TIMEOUT = 15_000;
const BUNDLE_TIMEOUT = 60_000;
// the gateway only starts executing once the token checks out, so the query
// legitimately takes longer than the rest
const QUERY_TIMEOUT = 20_000;

const request = async (
  leg: string,
  url: string,
  init: RequestInit = {},
  ms = TIMEOUT,
) => {
  const expired = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`no answer in ${ms / 1000}s`)), ms),
  );

  try {
    return await Promise.race([
      fetch(url, { ...init, connectTimeout: ms }),
      expired,
    ]);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`${leg} (${url.split("/")[2]}): ${reason}`);
  }
};

let clientToken: { token: string; expiresAt: number } | null = null;

/** Granted without any user credentials, and good for a fortnight. */
const getClientToken = async () => {
  if (clientToken && clientToken.expiresAt > Date.now()) {
    return clientToken.token;
  }

  const response = await request("client-token", CLIENT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_data: {
        client_version: WEB_PLAYER_VERSION,
        client_id: WEB_PLAYER_CLIENT_ID,
        js_sdk_data: {
          device_brand: "Apple",
          device_model: "unknown",
          os: "macos",
          os_version: "10.15.7",
          device_id: deviceId(),
          device_type: "computer",
        },
      },
    }),
  });

  const data = await response.json();
  const granted = data?.granted_token;

  if (!granted?.token) {
    throw new Error(
      `No client token: ${data?.response_type ?? response.status}`,
    );
  }

  clientToken = {
    token: granted.token,
    expiresAt: Date.now() + granted.expires_after_seconds * 1000,
  };

  return clientToken.token;
};

export type BundleMeta = {
  hashes: Record<string, string>;
  /** Newest first, the way the player itself reads them. */
  secrets: { secret: string; version: number }[];
  /** Chunk id → the name part of its filename, e.g. 4406 → "xpui-routes-search" */
  chunks: Record<string, string>;
  /** Chunk id → the content hash part of its filename. */
  chunkHashes: Record<string, string>;
  version: string;
};

const readMeta = (): BundleMeta | null => {
  try {
    const meta = JSON.parse(
      localStorage.getItem(META_KEY) ?? "null",
    ) as BundleMeta | null;

    // an entry written before this shape existed is worth no more than none
    return meta?.hashes && meta.secrets ? meta : null;
  } catch {
    return null;
  }
};

const idMap = (source: string, re: RegExp) =>
  Object.fromEntries(
    [...(source.match(re)?.[1] ?? "").matchAll(/"?(\d+)"?:"([^"]+)"/g)].map(
      ([, id, value]) => [id, value],
    ),
  );

const parseBundle = (source: string): Omit<BundleMeta, "version"> => {
  const hashes: Record<string, string> = {};

  for (const [, name, hash] of source.matchAll(
    /\.l\("([a-zA-Z0-9_]+)","(?:query|mutation)","([0-9a-f]{64})"/g,
  )) {
    hashes[name] = hash;
  }

  const secretBlock = source.match(
    /\[\{secret:(?:'[^']*'|"(?:[^"\\]|\\.)*"),version:\d+\}(?:,\{secret:(?:'[^']*'|"(?:[^"\\]|\\.)*"),version:\d+\})*\]/,
  );

  const secrets = [
    ...(secretBlock?.[0] ?? "").matchAll(
      /\{secret:('[^']*'|"(?:[^"\\]|\\.)*"),version:(\d+)\}/g,
    ),
  ].map(([, raw, version]) => ({
    secret: JSON.parse(
      raw.startsWith("'") ? JSON.stringify(raw.slice(1, -1)) : raw,
    ) as string,
    version: Number(version),
  }));

  return {
    hashes,
    secrets,
    chunks: idMap(source, /\.u=e=>""\+\(\{([^}]+)\}/),
    chunkHashes: idMap(source, /\)\[e\]\|\|e\)\+"\."\+\(?\{([^}]+)\}/),
  };
};

let loading: Promise<BundleMeta> | null = null;

/**
 * The player's main bundle carries every persisted query hash, the TOTP
 * secrets and the chunk maps at once, so one pass over it replaces what used
 * to be a separate multi-megabyte download per operation. A stale hash
 * usually breaks several calls at the same moment — hence the shared promise,
 * or each of them would fetch the same bundle in parallel.
 */
export const refreshBundleMeta = (): Promise<BundleMeta> => {
  loading ??= (async () => {
    try {
      const page = await request("web player page", WEB_PLAYER_URL, {
        headers: { "user-agent": USER_AGENT },
      });
      const html = await page.text();

      const bundleUrl = html.match(
        /https:\/\/open\.spotifycdn\.com\/cdn\/build\/web-player\/web-player\.[\w-]+\.js/,
      )?.[0];

      if (!bundleUrl) throw new Error("Web player bundle not found");

      // a few megabytes over IPC, so it gets a longer leash than the rest
      const bundle = await request(
        "web player bundle",
        bundleUrl,
        { headers: { "user-agent": USER_AGENT } },
        BUNDLE_TIMEOUT,
      );

      const meta: BundleMeta = {
        ...parseBundle(await bundle.text()),
        version: bundleUrl.split(".").at(-2) ?? "",
      };

      if (!Object.keys(meta.hashes).length) {
        throw new Error("No persisted queries in the bundle");
      }

      localStorage.setItem(META_KEY, JSON.stringify(meta));
      return meta;
    } finally {
      loading = null;
    }
  })();

  return loading;
};

export const bundleMeta = async (): Promise<BundleMeta> =>
  readMeta() ?? (await refreshBundleMeta());

/**
 * Part of the operations live in chunks the player loads per route. Main
 * carries both maps — id → name and id → content hash — so the one chunk that
 * holds the operation is fetched by name, without walking the rest.
 */
const fetchFromChunk = async (
  meta: BundleMeta,
  chunk: string,
  operationName: string,
) => {
  const id = Object.keys(meta.chunks).find((key) => meta.chunks[key] === chunk);
  const contentHash = id && meta.chunkHashes[id];

  if (!contentHash) throw new Error(`No chunk ${chunk} in the bundle`);

  const response = await request(
    `chunk ${chunk}`,
    `${CDN}/${chunk}.${contentHash}.js`,
    { headers: { "user-agent": USER_AGENT } },
    BUNDLE_TIMEOUT,
  );

  const hash = (await response.text()).match(
    new RegExp(
      `\\.l\\("${operationName}","(?:query|mutation)","([0-9a-f]{64})"`,
    ),
  )?.[1];

  if (!hash) throw new Error(`No persisted hash for ${operationName}`);

  meta.hashes[operationName] = hash;
  localStorage.setItem(META_KEY, JSON.stringify(meta));

  return hash;
};

type Query = {
  operationName: string;
  /** Used until the gateway reports it stale; then it is refreshed and cached. */
  fallbackHash: string;
  variables: Record<string, unknown>;
  accessToken: string;
  /** Name of the route chunk holding the operation, when main does not. */
  chunk?: string;
};

export const pathfinderQuery = async <T>({
  operationName,
  fallbackHash,
  variables,
  accessToken,
  chunk,
}: Query): Promise<T> => {
  const send = async (sha256Hash: string) => {
    const response = await request(
      `${operationName} query`,
      PATHFINDER_URL,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "client-token": await getClientToken(),
          "content-type": "application/json;charset=UTF-8",
          "app-platform": "WebPlayer",
          "spotify-app-version": WEB_PLAYER_VERSION,
          "accept-language": "en",
          // The gateway answers 403 without a browser's origin and agent.
          origin: "https://open.spotify.com",
          referer: "https://open.spotify.com/",
          "user-agent": USER_AGENT,
        },
        body: JSON.stringify({
          operationName,
          variables,
          extensions: { persistedQuery: { version: 1, sha256Hash } },
        }),
      },
      QUERY_TIMEOUT,
    );

    const data = await response.json();
    const error = data?.errors?.[0];

    if (error || !response.ok) {
      const message = error?.message ?? data?.error?.message ?? response.status;
      throw Object.assign(new Error(`${operationName}: ${message}`), {
        stale: String(error?.extensions?.code ?? error?.message ?? "").includes(
          "PersistedQueryNotFound",
        ),
      });
    }

    return data.data as T;
  };

  const meta = await bundleMeta();

  try {
    return await send(meta.hashes[operationName] ?? fallbackHash);
  } catch (err) {
    if (!(err as { stale?: boolean }).stale) throw err;

    // A new web player build shipped — pick the fresh hash up and retry once.
    const fresh = await refreshBundleMeta();
    const hash =
      fresh.hashes[operationName] ??
      (chunk ? await fetchFromChunk(fresh, chunk, operationName) : null);

    if (!hash) throw err;

    return send(hash);
  }
};
