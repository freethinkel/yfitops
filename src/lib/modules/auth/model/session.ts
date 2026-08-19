import { atom, computed, onMount } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { REDIRECT_URI } from "$lib/config/spotify";
import type { AuthTokens } from "../types";
import { createAuthRequest, getTokensFromCode, refreshTokens } from "./tokens";

type Options = {
  /** When the app asks for more than the stored token has, it must be redone. */
  requiredScopes?: string[];
  /** localStorage key — one per client id, the tokens are not interchangeable. */
  storageKey: string;
  clientId: string;
  onTokens?: (tokens: AuthTokens) => void;
};

/**
 * One OAuth session. There are two: the app's own client for the Web API, and
 * librespot's for the internal endpoints its RBAC lets only known clients into.
 */
export const createSession = ({
  storageKey,
  clientId,
  onTokens,
  requiredScopes = [],
}: Options) => {
  const $tokens = persistentAtom<AuthTokens | null>(storageKey, null, {
    encode: JSON.stringify,
    // a throw here happens while the module is still initialising, which takes
    // the whole app down and leaves no way back except clearing storage by
    // hand — a corrupt entry costs a re-login instead
    decode: (raw) => {
      try {
        const tokens = JSON.parse(raw) as AuthTokens | null;
        return tokens && { ...tokens, expiration: new Date(tokens.expiration) };
      } catch {
        console.error(`session ${storageKey}: unreadable, signing out`);
        return null;
      }
    },
  });

  const $isAuthorized = atom(false);
  const $isPending = atom(false);
  const $error = atom<string | null>(null);
  const $accessToken = computed($tokens, (tokens) => tokens?.accessToken ?? "");

  const applyTokens = (tokens: AuthTokens) => {
    $tokens.set(tokens);
    onTokens?.(tokens);
    $isAuthorized.set(true);
  };

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

  const covers = (tokens: AuthTokens) =>
    requiredScopes.every((scope) => tokens.scopes?.includes(scope));

  /** Restores the persisted session as soon as anything observes it. */
  onMount($isAuthorized, () => {
    const tokens = $tokens.get();
    if (!tokens || $isAuthorized.get()) return;

    // the app grew a permission the stored token never had
    if (!covers(tokens)) {
      logout();
      $error.set("Права приложения изменились — войди заново");
      return;
    }

    if (tokens.expiration.getTime() > Date.now()) {
      applyTokens(tokens);
      return;
    }

    withPending(async () => applyTokens(await refreshTokens(tokens, clientId)));
  });

  let unlisten: UnlistenFn | null = null;

  const login = () =>
    withPending(async () => {
      const { url, verifier } = await createAuthRequest(clientId);

      await invoke("create_auth_window", {
        uri: url.toString(),
        label: "oauth_window",
        title: "Authorization",
      });

      const authWindow = new WebviewWindow("oauth_window");
      unlisten?.();
      unlisten = await listen(
        "change_navigation_url",
        ({ payload }: { payload: { url: string } }) => {
          if (!payload.url.startsWith(REDIRECT_URI)) return;

          unlisten?.();
          unlisten = null;
          authWindow.close();

          const code = new URL(payload.url).searchParams.get("code") ?? "";
          withPending(async () =>
            applyTokens(await getTokensFromCode(code, verifier, clientId)),
          );
        },
      );
    });

  /**
   * Tokens live an hour, the app lives longer. This keeps one refresh in flight
   * at a time and hands out a token that is good for at least another minute.
   */
  let refreshing: Promise<string> | null = null;

  const ensureToken = (): Promise<string> => {
    const tokens = $tokens.get();
    if (!tokens) return Promise.resolve("");

    if (tokens.expiration.getTime() - 60_000 > Date.now()) {
      return Promise.resolve(tokens.accessToken);
    }

    refreshing ??= refreshTokens(tokens, clientId)
      .then((fresh) => {
        applyTokens(fresh);
        return fresh.accessToken;
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        $error.set(message);
        // callers pass this straight into an Authorization header, so a failure
        // here surfaces far away as a 401 on whatever asked next
        console.error(`session ${storageKey}: refresh failed —`, message);
        return "";
      })
      .finally(() => {
        refreshing = null;
      });

    return refreshing;
  };

  /** Refreshes ahead of expiry so long-lived clients never see a 401. */
  const scheduleRefresh = () => {
    const tokens = $tokens.get();
    if (!tokens) return;

    const due = tokens.expiration.getTime() - Date.now() - 60_000;
    setTimeout(() => ensureToken(), Math.max(due, 1_000));
  };

  $tokens.listen(scheduleRefresh);

  const logout = () => {
    $tokens.set(null);
    $isAuthorized.set(false);
  };

  /**
   * Runs `load` once this session is ready. Returns an unbind function, so it
   * composes with `onMount` in dependent stores. A failed load is reported and
   * retried on the next mount instead of dying as an unhandled rejection.
   */
  const whenAuthorized = (load: () => void | Promise<void>) => {
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

  return {
    ensureToken,
    $tokens,
    $isAuthorized,
    $isPending,
    $error,
    $accessToken,
    login,
    logout,
    whenAuthorized,
  };
};
