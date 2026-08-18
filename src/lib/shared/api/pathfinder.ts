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
const HASHES_KEY = "pathfinder_query_hashes";
const WEB_PLAYER_URL = "https://open.spotify.com/";

const deviceId = () => {
  let id = localStorage.getItem(DEVICE_ID_KEY);

  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }

  return id;
};

let clientToken: { token: string; expiresAt: number } | null = null;

/** Granted without any user credentials, and good for a fortnight. */
const getClientToken = async () => {
  if (clientToken && clientToken.expiresAt > Date.now()) {
    return clientToken.token;
  }

  const response = await fetch(CLIENT_TOKEN_URL, {
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
    throw new Error(`No client token: ${data?.response_type ?? response.status}`);
  }

  clientToken = {
    token: granted.token,
    expiresAt: Date.now() + granted.expires_after_seconds * 1000,
  };

  return clientToken.token;
};

const readHashes = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(HASHES_KEY) ?? "{}");
  } catch {
    return {};
  }
};

const writeHash = (operationName: string, hash: string) => {
  localStorage.setItem(
    HASHES_KEY,
    JSON.stringify({ ...readHashes(), [operationName]: hash }),
  );
};

/**
 * Persisted query hashes are baked into the web player's main bundle, which is
 * served without any auth. Fetching it costs a few megabytes, so this only runs
 * when the gateway rejects a hash as unknown — after a new player release.
 */
const fetchHash = async (operationName: string) => {
  const page = await fetch(WEB_PLAYER_URL, {
    headers: { "user-agent": USER_AGENT },
  });
  const html = await page.text();

  const bundleUrl = html.match(
    /https:\/\/open\.spotifycdn\.com\/cdn\/build\/web-player\/web-player\.[\w-]+\.js/,
  )?.[0];

  if (!bundleUrl) throw new Error("Web player bundle not found");

  const bundle = await fetch(bundleUrl, {
    headers: { "user-agent": USER_AGENT },
  });
  const source = await bundle.text();

  const hash = source.match(
    new RegExp(`\\.l\\("${operationName}","query","([0-9a-f]{64})"`),
  )?.[1];

  if (!hash) throw new Error(`No persisted hash for ${operationName}`);

  writeHash(operationName, hash);
  return hash;
};

type Query = {
  operationName: string;
  /** Used until the gateway reports it stale; then it is refreshed and cached. */
  fallbackHash: string;
  variables: Record<string, unknown>;
  accessToken: string;
};

export const pathfinderQuery = async <T>({
  operationName,
  fallbackHash,
  variables,
  accessToken,
}: Query): Promise<T> => {
  const send = async (sha256Hash: string) => {
    const response = await fetch(PATHFINDER_URL, {
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
    });

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

  try {
    return await send(readHashes()[operationName] ?? fallbackHash);
  } catch (err) {
    if (!(err as { stale?: boolean }).stale) throw err;

    // A new web player build shipped — pick the fresh hash up and retry once.
    return send(await fetchHash(operationName));
  }
};
