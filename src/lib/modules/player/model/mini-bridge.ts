/**
 * The companion runs in a window of its own, which means a second JS context
 * with stores of its own. Importing the player there would mount the Web
 * Playback SDK a second time and register another device with Spotify, so the
 * two sides share only what is in this file — which imports nothing.
 */
export const MINI_LABEL = "mini";

/** Main window → companion. */
export const MINI_STATE = "mini:state";
/** Companion → main window. */
export const MINI_COMMAND = "mini:command";
/** Companion → main window, once on mount: otherwise it sits blank until the
 * track changes. */
export const MINI_HELLO = "mini:hello";

export type MiniState = {
  cover: string;
  name: string;
  artist: string;
  paused: boolean;
  /** Milliseconds, both — the companion turns them into the slider's 0..1. */
  position: number;
  duration: number;
};

export type MiniCommand =
  | { kind: "toggle" | "next" | "prev" | "restore" }
  | { kind: "seek"; position: number };
