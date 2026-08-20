import { atom, onMount } from "nanostores";
import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import { totp } from "$lib/shared/api/totp";
import { refreshBundleMeta } from "$lib/shared/api/pathfinder";
import * as oauth from "./auth.model";

/**
 * Exactly the session the web player runs on: the `sp_dc` cookie in exchange
 * for an hour-long token. There is no client id of our own here at all —
 * neither the public Web API quota nor a dependency on somebody else's app.
 */
const TOKEN_URL = "https://open.spotify.com/api/token";
const EARLY_MS = 60_000;
const HOUR_MS = 3_600_000;

type Token = { accessToken: string; expiresAt: number };

let token: Token | null = null;
let inflight: Promise<string> | null = null;

export const $isAuthorized = atom(false);
export const $error = atom<string | null>(null);

const request = async (reason: "init" | "transport"): Promise<Token> => {
  const cookie = await invoke<string | null>("spotify_cookie");
  if (!cookie) throw new Error("Не вижу cookie входа — войди заново");

  const { code, version } = await totp();

  const query = new URLSearchParams({
    reason,
    productType: "web-player",
    totp: code,
    totpServer: code,
    totpVer: String(version),
  });

  const response = await fetch(`${TOKEN_URL}?${query}`, {
    headers: {
      accept: "application/json",
      referer: "https://open.spotify.com/",
      "app-platform": "WebPlayer",
      cookie: `sp_dc=${cookie}`,
    },
  });

  const data = await response.json();

  if (!data?.accessToken) {
    throw new Error(`Токен не выдан: ${data?.message ?? response.status}`);
  }

  return {
    accessToken: data.accessToken,
    expiresAt:
      Number(data.accessTokenExpirationTimestampMs) || Date.now() + HOUR_MS,
  };
};

export const ensureToken = (): Promise<string> => {
  if (token && token.expiresAt - EARLY_MS > Date.now()) {
    return Promise.resolve(token.accessToken);
  }

  inflight ??= request(token ? "transport" : "init")
    .catch(async (err) => {
      // a stale secret and a stale login differ only by the text of the
      // answer, and the first one fixes itself — the bundle is re-read and
      // the code recomputed from the version that comes with it
      if (!/totp/i.test(String(err))) throw err;

      await refreshBundleMeta();
      return request("init");
    })
    .then((fresh) => {
      token = fresh;
      $isAuthorized.set(true);
      $error.set(null);
      return fresh.accessToken;
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      $error.set(message);
      $isAuthorized.set(false);
      console.error("web session:", message);
      return "";
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
};

/**
 * Signing in still goes through the old OAuth window — it is what puts the
 * cookie on the webview, and nothing here can do that on its own.
 */
export const login = async () => {
  await oauth.login();
  await ensureToken();
};

export const logout = () => {
  token = null;
  $isAuthorized.set(false);
};

onMount($isAuthorized, () => {
  ensureToken();
});

/** The same contract `createSession` offers, so dependent stores stay as they are. */
export const whenAuthorized = (load: () => void | Promise<void>) => {
  let loaded = false;

  return $isAuthorized.subscribe(async (authorized) => {
    if (!authorized || loaded) return;
    loaded = true;

    try {
      await load();
    } catch (err) {
      loaded = false;
      $error.set(err instanceof Error ? err.message : String(err));
    }
  });
};
