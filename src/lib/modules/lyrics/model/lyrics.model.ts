import { atom, onMount } from "nanostores";
import { fetch } from "@tauri-apps/plugin-http";
import { internalSession } from "$lib/modules/auth/model";
import { playerModel } from "$lib/modules/player/model";
import type { Lyrics } from "../types";

/**
 * The Web API serves no lyrics — these come from the internal color-lyrics
 * endpoint, the way librespot does it. It answers 401 without `app-platform`,
 * and it is CORS-less, hence Tauri's HTTP client instead of the webview's.
 *
 * Its RBAC also turns down tokens of unknown clients with 403, so this needs a
 * session of its own on librespot's client id — the app's own one is refused.
 */
const LYRICS_URL = "https://spclient.wg.spotify.com/color-lyrics/v2/track";

const session = internalSession;

export const $isEnabled = session.$isAuthorized;
export const enable = session.login;

export const $lyrics = atom<Lyrics | null>(null);
export const $isPending = atom(false);
export const $error = atom<string | null>(null);

type ColorLyrics = {
  lyrics?: {
    syncType?: string;
    lines?: { startTimeMs?: string; words?: string }[];
  };
};

const load = async (trackId: string): Promise<Lyrics | null> => {
  const response = await fetch(
    `${LYRICS_URL}/${trackId}?format=json&vocalRemoval=false&market=from_token`,
    {
      headers: {
        Authorization: `Bearer ${await session.ensureToken()}`,
        "app-platform": "WebPlayer",
      },
    },
  );

  // 404 — this track simply has no lyrics.
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`.trim());
  }

  const data = ((await response.json()) as ColorLyrics).lyrics;
  if (!data) return null;

  return {
    synced: data.syncType === "LINE_SYNCED",
    lines: (data.lines ?? []).map((line) => ({
      startMs: Number(line.startTimeMs ?? 0) || 0,
      text: line.words ?? "",
    })),
  };
};

/** Follows the player, and catches up when lyrics get enabled mid-track. */
onMount($lyrics, () => {
  let current = "";

  const sync = async () => {
    const trackId =
      playerModel.$playerState.get()?.track_window.current_track.id ?? "";

    if (trackId === current) return;
    if (!session.$isAuthorized.get()) return;

    current = trackId;
    $lyrics.set(null);
    $error.set(null);

    if (!trackId) return;

    $isPending.set(true);
    try {
      const lyrics = await load(trackId);
      if (current === trackId) $lyrics.set(lyrics);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("lyrics:", message);
      if (current === trackId) $error.set(message);
    } finally {
      if (current === trackId) $isPending.set(false);
    }
  };

  const unbindPlayer = playerModel.$playerState.subscribe(sync);
  const unbindSession = session.$isAuthorized.subscribe(sync);

  return () => {
    unbindPlayer();
    unbindSession();
  };
});
