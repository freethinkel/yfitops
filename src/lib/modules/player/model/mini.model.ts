import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { onMount } from "nanostores";
import {
  MINI_COMMAND,
  MINI_HELLO,
  MINI_LABEL,
  MINI_STATE,
  type MiniCommand,
  type MiniState,
} from "./mini-bridge";
import {
  $currentLiked,
  $playerState,
  $position,
  nextTrack,
  prevTrack,
  seek,
  toggleCurrentLike,
  togglePlaypause,
} from "./player.model";

const SIZE = 260;

/** Position ticks twice a second — no reason to emit that into the void. */
let open = false;

const stateOf = (): MiniState => {
  const state = $playerState.get();
  const track = state?.track_window.current_track;

  return {
    liked: $currentLiked.get(),
    cover: track?.album.images[0]?.url ?? "",
    name: track?.name ?? "",
    artist: track?.artists.map((artist) => artist.name).join(", ") ?? "",
    paused: state?.paused ?? true,
    position: $position.get(),
    duration: state?.duration ?? 0,
  };
};

export const openMini = async () => {
  const existing = await WebviewWindow.getByLabel(MINI_LABEL);

  if (existing) {
    await existing.show();
  } else {
    const mini = new WebviewWindow(MINI_LABEL, {
      url: "/mini",
      title: "",
      width: SIZE,
      height: SIZE,
      alwaysOnTop: true,
      visibleOnAllWorkspaces: true,
      resizable: false,
      /**
       * The titlebar stays: it is what macOS rounds the corners and casts the
       * shadow for, and a borderless window gets neither. The content runs
       * underneath it, and the buttons are hidden natively once the window
       * exists — no window option drops them on its own.
       */
      titleBarStyle: "overlay",
      hiddenTitle: true,
    });

    mini.once("tauri://created", () => {
      invoke("hide_window_buttons", { label: MINI_LABEL }).catch((err) =>
        console.error("mini buttons:", err),
      );
    });
  }

  open = true;
  await getCurrentWindow().hide();
};

const restore = async () => {
  const [main, mini] = await Promise.all([
    WebviewWindow.getByLabel("main"),
    WebviewWindow.getByLabel(MINI_LABEL),
  ]);

  open = false;

  await main?.show();
  await mini?.close();

  // last, and on its own: focus is the one step here that may be refused, and
  // an await on it would strand the companion on screen
  main?.setFocus().catch((err) => console.error("mini restore focus:", err));
};

/**
 * The bridge belongs to the main window — it is the one holding the SDK. Tied
 * to the player state so it comes up with the player rather than at import.
 */
onMount($playerState, () => {
  const publish = () => emit(MINI_STATE, stateOf());
  const publishWhileOpen = () => open && publish();

  const stopState = $playerState.subscribe(publishWhileOpen);
  const stopPosition = $position.subscribe(publishWhileOpen);
  const stopLiked = $currentLiked.subscribe(publishWhileOpen);

  const commands = listen<MiniCommand>(MINI_COMMAND, ({ payload }) => {
    if (payload.kind === "toggle") togglePlaypause();
    else if (payload.kind === "next") nextTrack();
    else if (payload.kind === "prev") prevTrack();
    else if (payload.kind === "seek") seek(payload.position);
    else if (payload.kind === "like") toggleCurrentLike();
    else if (payload.kind === "restore") restore();
  });

  // the companion asks the moment it mounts, before `open` can be trusted
  const hello = listen(MINI_HELLO, publish);

  return () => {
    stopState();
    stopPosition();
    stopLiked();
    commands.then((off) => off());
    hello.then((off) => off());
  };
});
