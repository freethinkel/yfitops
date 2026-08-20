import { atom, onMount } from "nanostores";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { fetch } from "@tauri-apps/plugin-http";
import { totp } from "$lib/shared/api/totp";
import { refreshBundleMeta } from "$lib/shared/api/pathfinder";

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
export const $isPending = atom(false);
export const $error = atom<string | null>(null);

const withPending = async (action: () => Promise<void>) => {
  $isPending.set(true);
  $error.set(null);

  try {
    await action();
  } catch (err) {
    $error.set(err instanceof Error ? err.message : String(err));
  } finally {
    $isPending.set(false);
  }
};

const request = async (
  reason: "init" | "transport",
  cookie: string,
): Promise<Token> => {
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

  inflight ??= (async () => {
    const cookie = await invoke<string | null>("spotify_cookie");

    // no cookie is not a failure — it is simply nobody signed in yet
    if (!cookie) {
      $isAuthorized.set(false);
      return "";
    }

    const reason = token ? "transport" : "init";

    try {
      const fresh = await request(reason, cookie).catch(async (err) => {
        // a stale secret and a stale login differ only by the text of the
        // answer, and the first one fixes itself — the bundle is re-read and
        // the code recomputed from the version that comes with it
        if (!/totp/i.test(String(err))) throw err;

        await refreshBundleMeta();
        return request("init", cookie);
      });

      token = fresh;
      $isAuthorized.set(true);
      $error.set(null);

      return fresh.accessToken;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      $error.set(message);
      $isAuthorized.set(false);
      console.error("web session:", message);

      return "";
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
};

const LOGIN_URL =
  "https://accounts.spotify.com/login?continue=https%3A%2F%2Fopen.spotify.com%2F";
const LOGOUT_URL = "https://www.spotify.com/logout/";
const LANDED = "https://open.spotify.com";
const AUTH_WINDOW = "oauth_window";

/**
 * No OAuth and no client id of our own: the user signs in on Spotify's own
 * form exactly as they would in a browser, and the cookie it leaves behind is
 * the whole credential. Landing back on the player means it worked.
 */
const inWindow = async (url: string, done: (url: string) => boolean) => {
  await invoke("create_auth_window", {
    uri: url,
    label: AUTH_WINDOW,
    title: "Spotify",
  });

  const window = new WebviewWindow(AUTH_WINDOW);

  // closing the window by hand has to end this too, or the promise never
  // settles and the button it was called from stays spinning for good
  return new Promise<boolean>((resolve) => {
    const off: UnlistenFn[] = [];

    const finish = (reached: boolean) => {
      off.forEach((stop) => stop());
      off.length = 0;
      resolve(reached);
    };

    listen(
      "change_navigation_url",
      ({ payload }: { payload: { url: string } }) => {
        if (!done(payload.url)) return;

        finish(true);
        window.close();
      },
    ).then((stop) => off.push(stop));

    window.onCloseRequested(() => finish(false)).then((stop) => off.push(stop));
  });
};

export const login = () =>
  withPending(async () => {
    // walked away from the form — not something to report as a failure
    if (!(await inWindow(LOGIN_URL, (url) => url.startsWith(LANDED)))) return;

    await ensureToken();

    if (!$isAuthorized.get()) throw new Error($error.get() ?? "Вход не удался");
  });

/**
 * Signing out has to happen on Spotify's side: the cookie is theirs, and there
 * is no way to drop it from here.
 */
export const logout = () =>
  withPending(async () => {
    token = null;
    $isAuthorized.set(false);

    await inWindow(LOGOUT_URL, (url) => !url.includes("/logout"));
  });

// through `withPending` on purpose: the app layout sends anyone who is neither
// authorised nor pending back to the login page, and restoring a saved session
// takes a moment — without this the window flashes the form on every launch
onMount($isAuthorized, () => {
  withPending(async () => {
    await ensureToken();
  });
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
