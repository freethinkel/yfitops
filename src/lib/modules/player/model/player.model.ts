import { atom, computed, onMount } from "nanostores";
import { authModel, webSession } from "$lib/modules/auth/model";
import {
  command,
  getCluster,
  setQueue,
  skipTo,
  transfer,
  type QueueEntry,
} from "$lib/shared/api/connect-state";
import {
  $likedSongs,
  toggleLike,
} from "$lib/modules/playlist/model/playlist.model";
import { fetchTracks } from "$lib/shared/api/catalog";
import { getAccentColorFromImage } from "$lib/shared/helpers/color";
import { reportError } from "$lib/shared/helpers/errors";
import { loadWebSdk } from "./web-sdk";

export const $playerState = atom<Spotify.PlaybackState | null>(null);
/**
 * Ticks twice a second, so it lives apart from `$playerState` — otherwise every
 * component watching the track would re-render at the same rate.
 */
export const $position = atom(0);
export const $trackColor = atom("transparent");

let player: Spotify.Player | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let colorSource = "";

let announceDevice!: (id: string) => void;
let registered = new Promise<string>((resolve) => (announceDevice = resolve));

/**
 * The track list draws itself from cache, so it is clickable long before the
 * SDK has fetched its script and registered a device. Sending the empty id
 * that early is what the Web API answers with a 404, so playback waits for the
 * real one instead. The timeout keeps a player that never arrives — no
 * Premium, no output device — from swallowing the click in silence.
 */
const DEVICE_TIMEOUT = 10_000;

const device = () =>
  Promise.race([
    registered,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("The Spotify player never became ready")),
        DEVICE_TIMEOUT,
      ),
    ),
  ]);

/** Every player command goes down Connect's own channel, same as the queue. */
const send = async (endpoint: string, payload?: Record<string, unknown>) =>
  command({
    accessToken: await webSession.ensureToken(),
    deviceId: await device(),
    endpoint,
    payload,
  });

const setShuffle = (state: boolean) =>
  send("set_options", { shuffling_context: state });

const setRepeat = (state: "off" | "context" | "track") =>
  send("set_options", {
    repeating_context: state === "context",
    repeating_track: state === "track",
  });

export const togglePlaypause = () => player?.togglePlay();
export const nextTrack = () => {
  // whatever was first in the queue is the track now starting
  const queue = $queue.get();
  if (queue?.length) optimistic(queue.slice(1));

  player?.nextTrack();
};
/**
 * Shuffle and repeat live in the playback state the SDK reports, but only the
 * Web API can change them.
 */
type ToggleKey = "shuffle" | "repeat_mode";

/**
 * Values the user has chosen but the server has not confirmed yet. Without
 * them a state event arriving mid-flight would flash the old setting back.
 */
const pending = new Map<ToggleKey, boolean | number>();

/**
 * Overlays the unconfirmed choices on an incoming state, and forgets each one
 * as soon as the server reports the same value.
 */
const withPending = (state: Spotify.PlaybackState) => {
  if (!pending.size) return state;

  const merged = { ...state } as Record<string, unknown>;

  for (const [key, value] of pending) {
    if (state[key] === value) pending.delete(key);
    else merged[key] = value;
  }

  return merged as unknown as Spotify.PlaybackState;
};

/**
 * Optimistic: the SDK reports these only after the server has applied them,
 * which is a visible lag on a button that should feel instant.
 */
const patchState = (patch: Partial<Spotify.PlaybackState>) => {
  const state = $playerState.get();
  if (state) $playerState.set({ ...state, ...patch });
};

/** Rapid clicks must reach the server in the order they were made. */
let toggleChain: Promise<unknown> = Promise.resolve();

const sendToggle = <T>(
  key: ToggleKey,
  value: boolean | number,
  apply: () => Promise<T>,
) => {
  pending.set(key, value);
  patchState({ [key]: value } as Partial<Spotify.PlaybackState>);

  toggleChain = toggleChain.then(apply).catch((err) => {
    pending.delete(key);
    reportError(`player ${key}`, err);
  });

  return toggleChain;
};

export const toggleShuffle = () => {
  const state = $playerState.get();
  if (!state) return;

  const shuffle = !state.shuffle;

  return sendToggle("shuffle", shuffle, () => setShuffle(shuffle));
};

/** off → context → track → off, the order the native clients cycle through. */
export const cycleRepeat = () => {
  const mode = $playerState.get()?.repeat_mode ?? 0;
  const next = (["context", "track", "off"] as const)[mode];

  return sendToggle("repeat_mode", (mode + 1) % 3, () => setRepeat(next));
};

export const prevTrack = () => player?.previousTrack();

export const $currentLiked = computed(
  [$playerState, $likedSongs],
  (state, liked) => {
    const id = state?.track_window.current_track.id;

    return !!id && (liked ?? []).some((item) => item.track.id === id);
  },
);

/**
 * The saved list holds Web API tracks and the SDK reports its own shape. The
 * fields the list renders line up but for the ids, which the SDK leaves out of
 * albums and artists and spells into the uri instead — without them the rows
 * link nowhere and key themselves on NaN.
 */
const idOf = (uri: string) => uri.split(":")[2] ?? "";

export const toggleCurrentLike = () => {
  const track = $playerState.get()?.track_window.current_track;
  if (!track) return;

  toggleLike({
    ...track,
    album: { ...track.album, id: idOf(track.album.uri) },
    artists: track.artists.map((artist) => ({
      ...artist,
      id: idOf(artist.uri),
    })),
  } as unknown as SpotifyApi.TrackObjectFull);
};

export const seek = (position: number) => {
  player?.seek(position);
  $position.set(position);
};

export const seekBy = (deltaMs: number) => {
  const duration = $playerState.get()?.duration ?? 0;
  seek(Math.min(Math.max($position.get() + deltaMs, 0), duration));
};

/**
 * A bare list of tracks has no context of its own, so it travels as a
 * single-page anonymous one — which is how the native clients play a
 * selection too.
 */
const startPlayback = (uris: string[], index = 0) =>
  send("play", {
    context: {
      uri: "",
      url: "",
      metadata: {},
      pages: [{ tracks: uris.map((uri) => ({ uri })) }],
    },
    options: { skip_to: { track_index: index }, license: "premium" },
    play_origin: { feature_identifier: "harmony", feature_version: "desktop" },
  });

/**
 * Every one of these is called straight from a click handler, so a rejection
 * has nowhere to go and used to vanish — a dead device looked exactly like a
 * click that did nothing at all.
 */
const withDevice = async (what: string, run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (err) {
    reportError(`player ${what}`, err);
  }
};

/**
 * `skip_to` pins the track the user clicked whatever shuffle is set to, so
 * the old dance of turning shuffle off around the call — three requests for
 * one click — is gone.
 */
export const play = (uris: string[]) =>
  withDevice("play", () => startPlayback(uris));

/** Same for a bare list of tracks — liked songs have no context uri. */
export const playShuffled = (uris: string[]) =>
  withDevice("playShuffled", async () => {
    patchState({ shuffle: true });
    pending.set("shuffle", true);

    await setShuffle(true);
    await startPlayback(uris);
  });

/** Starts a playlist or album shuffled, the way the native clients do. */
export const shuffleContext = (uri: string) =>
  withDevice("shuffleContext", async () => {
    patchState({ shuffle: true });
    pending.set("shuffle", true);

    await setShuffle(true);
    await startContext(uri);
  });

/** Plays a whole playlist, album or artist by its uri. */
const startContext = (uri: string) =>
  send("play", {
    context: { uri, url: `context://${uri}`, metadata: {} },
    options: { license: "premium" },
    play_origin: { feature_identifier: "harmony", feature_version: "desktop" },
  });

export const playContext = (uri: string) =>
  withDevice("playContext", () => startContext(uri));

export type QueueTrack = {
  uri: string;
  uid: string;
  name: string;
  artist: string;
  image: string;
  durationMs: number;
};

/**
 * The full queue, straight from Connect — the SDK only exposes the next track
 * or two, and the Web API can read but never rearrange.
 */
export const $queue = atom<QueueTrack[] | null>(null);
export const $queueError = atom<string | null>(null);

const token = () => webSession.ensureToken();

type TrackMeta = Pick<QueueTrack, "name" | "artist" | "image" | "durationMs">;

/**
 * Metadata by uri, kept for the lifetime of the session. Connect decorates only
 * the nearest tracks, so without this the rest would blank out on every resync.
 */
const metaCache = new Map<string, TrackMeta>();

const remember = (uri: string, meta: TrackMeta) => {
  if (meta.name) metaCache.set(uri, meta);
  return meta;
};

const toTrack = (entry: QueueEntry): QueueTrack => {
  const fromCluster: TrackMeta = {
    name: entry.metadata?.title ?? "",
    artist: entry.metadata?.artist_name ?? "",
    image: entry.metadata?.image_url ?? "",
    durationMs: Number(entry.metadata?.duration ?? 0) || 0,
  };

  const meta = fromCluster.name
    ? remember(entry.uri, fromCluster)
    : (metaCache.get(entry.uri) ?? fromCluster);

  return { uri: entry.uri, uid: entry.uid ?? "", ...meta };
};

const toEntry = (track: QueueTrack): QueueEntry => ({
  uri: track.uri,
  ...(track.uid ? { uid: track.uid } : {}),
  metadata: { is_queued: "true" },
});

/** A uri alone is enough; the name fills in from cache or the next sync. */
const asQueueTrack = (track: QueueTrack | string): QueueTrack => {
  if (typeof track !== "string") return track;

  return {
    uri: track,
    uid: "",
    name: "",
    artist: "",
    image: "",
    durationMs: 0,
    ...metaCache.get(track),
  };
};

/**
 * Connect only decorates the tracks right after the current one; the rest of
 * the queue arrives as bare uris, so the missing names and covers are fetched
 * in bulk from the Web API.
 */
const hydrate = async (tracks: QueueTrack[], mine: number) => {
  const uris = [
    ...new Set(
      tracks
        .filter(
          (track) => !track.name && track.uri.startsWith("spotify:track:"),
        )
        .map((track) => track.uri),
    ),
  ];

  if (!uris.length) return;

  const found = new Map<string, SpotifyApi.TrackObjectFull>();

  for (const track of await fetchTracks(uris)) found.set(track.uri, track);

  if (mine !== epoch) return;

  $queue.set(
    ($queue.get() ?? []).map((track) => {
      const full = found.get(track.uri);
      if (!full || track.name) return track;

      return {
        ...track,
        ...remember(track.uri, {
          name: full.name,
          artist: full.artists.map((artist) => artist.name).join(", "),
          image: full.album.images.at(-1)?.url ?? "",
          durationMs: full.duration_ms,
        }),
      };
    }),
  );
};

const loadQueue = async () => {
  const accessToken = await token();

  if (!accessToken) {
    $queueError.set("Очередь читается через internal-сессию — включи её");
    return;
  }

  const mine = ++epoch;

  try {
    const cluster = await getCluster(accessToken);
    if (mine !== epoch) return;

    const tracks = (cluster.player_state?.next_tracks ?? []).map(toTrack);
    $queue.set(tracks);
    $queueError.set(null);

    await hydrate(tracks, mine);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportError("queue", err);
    $queueError.set(message);
  }
};

/** Connect applies the command a moment after acking it. */
const SYNC_DELAY_MS = 700;

/**
 * Every queue change bumps this. A reply carrying an older epoch belongs to a
 * request the user has already overtaken, so it is dropped instead of being
 * written over the newer state.
 */
let epoch = 0;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

/** Edits run one after another: each needs the revision the previous produced. */
let chain: Promise<unknown> = Promise.resolve();

const scheduleSync = () => {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(loadQueue, SYNC_DELAY_MS);
};

/** Shows the queue the server is about to confirm, and syncs shortly after. */
const optimistic = (next: QueueTrack[]) => {
  epoch++;
  $queue.set(next);
  scheduleSync();
};

/**
 * Optimistic: the new order shows at once and the server confirms it later.
 * On failure the previous queue comes back.
 */
const applyQueue = (next: QueueTrack[]) => {
  const previous = $queue.get();
  const mine = ++epoch;
  $queue.set(next);
  if (syncTimer) clearTimeout(syncTimer);

  chain = chain.then(async () => {
    const [accessToken, id] = await Promise.all([token(), device()]);
    if (!accessToken) return;

    try {
      const cluster = await getCluster(accessToken);
      const state = cluster.player_state;
      if (!state) return;

      await setQueue({
        accessToken,
        deviceId: id,
        nextTracks: next.map(toEntry),
        prevTracks: state.prev_tracks ?? [],
        revision: state.queue_revision,
      });

      // only the last edit of a burst is worth syncing back
      if (mine === epoch) scheduleSync();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      reportError("queue edit", err);
      $queueError.set(message);
      if (mine === epoch) $queue.set(previous);
    }
  });

  return chain;
};

const currentQueue = () => $queue.get() ?? [];

export const addToQueue = (track: QueueTrack | string) =>
  applyQueue([...currentQueue(), asQueueTrack(track)]);

export const insertInQueue = (track: QueueTrack | string, index: number) => {
  const next = [...currentQueue()];
  next.splice(index, 0, asQueueTrack(track));
  return applyQueue(next);
};

export const moveInQueue = (from: number, to: number) => {
  const next = [...currentQueue()];
  const [moved] = next.splice(from, 1);
  next.splice(from < to ? to - 1 : to, 0, moved);
  return applyQueue(next);
};

export const removeFromQueue = (index: number) =>
  applyQueue(currentQueue().filter((_, i) => i !== index));

/** Plays a queued track right away, skipping everything ahead of it. */
export const playFromQueue = async (track: QueueTrack) => {
  try {
    await skipToQueued(track);
  } catch (err) {
    reportError("player playFromQueue", err);
  }
};

const skipToQueued = async (track: QueueTrack) => {
  const [accessToken, id] = await Promise.all([token(), device()]);
  if (!accessToken) return;

  // skipping to a track drops everything queued ahead of it
  const queue = $queue.get() ?? [];
  const index = queue.indexOf(track);
  if (index >= 0) optimistic(queue.slice(index + 1));

  await skipTo({
    accessToken,
    deviceId: id,
    uri: track.uri,
    uid: track.uid,
  });

  scheduleSync();
};

onMount($queue, () => {
  let current = "";

  return $playerState.subscribe((state) => {
    const trackId = state?.track_window.current_track.id ?? "";
    if (trackId === current) return;

    current = trackId;

    // the track that just started is usually the head of the queue: drop it
    // right away instead of waiting for the round trip
    const queue = $queue.get();
    if (
      queue?.length &&
      queue[0].uri === state?.track_window.current_track.uri
    ) {
      optimistic(queue.slice(1));
      return;
    }

    loadQueue();
  });
});

const updateTrackColor = async (state: Spotify.PlaybackState) => {
  const url = state.track_window.current_track.album.images[0]?.url ?? "";
  if (url === colorSource) return;

  colorSource = url;
  $trackColor.set(await getAccentColorFromImage(url));
};

/**
 * The SDK plays inside a cross-origin iframe, so the system's Now Playing
 * entry belongs to that document — which is why it read "Spotify Embedded"
 * and offered seek keys. media_session.js runs inside it and relays the
 * ⏮/⏭ keys back here; play/pause the webview already handles itself.
 */
let mediaKeysClaimed = false;

const claimMediaKeys = () => {
  if (mediaKeysClaimed) return;
  mediaKeysClaimed = true;

  window.addEventListener("message", (event) => {
    if (event.data?.yfitops !== "media-key") return;

    if (event.data.key === "next") nextTrack();
    else if (event.data.key === "previous") prevTrack();
  });
};

/** Fills the system entry with the track that is actually playing. */
const publishNowPlaying = () => {
  const state = $playerState.get();
  if (!state) return;

  const track = state.track_window.current_track;

  const message = {
    yfitops: "now-playing",
    title: track.name,
    artist: track.artists.map((artist) => artist.name).join(", "),
    album: track.album.name,
    cover: track.album.images[0]?.url ?? "",
  };

  for (const frame of document.querySelectorAll("iframe")) {
    frame.contentWindow?.postMessage(message, "*");
  }
};

/**
 * Spotify keeps the last playback server-side, so nothing has to be stored
 * locally: handing the session to this device without starting it brings the
 * track, its position and the queue back exactly where they stopped. Playback
 * running somewhere else is left alone — taking it over would yank the music
 * off the phone.
 */
let restored = false;

const restoreLastSession = async (id: string) => {
  // only the first `ready` of the session — a reconnect after sleep must not
  // pull a paused session back off whatever device has it now
  if (restored) return;
  restored = true;

  try {
    const accessToken = await webSession.ensureToken();
    const cluster = await getCluster(accessToken);
    if (cluster.player_state?.is_playing) return;

    await transfer({ accessToken, deviceId: id });
  } catch (err) {
    reportError("player restore", err);
  }
};

/**
 * `ready` is the only thing that ever sets the device id, so a drop has to be
 * answered or the next click waits forever. But answering it immediately and
 * for ever is how a rate-limited account turns one refusal into a storm: the
 * SDK registers, is turned away, drops, and asks again. Hence the backoff and
 * the ceiling — past it the player stays down until the app restarts, which is
 * the honest outcome when Spotify keeps saying no.
 */
const RECONNECT_LIMIT = 5;
const RECONNECT_BASE_MS = 2_000;

let attempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const reconnect = (instance: Spotify.Player) => {
  if (reconnectTimer) return;

  if (attempts >= RECONNECT_LIMIT) {
    reportError(
      "player",
      new Error(`gave up reconnecting after ${RECONNECT_LIMIT} attempts`),
    );
    return;
  }

  const wait = RECONNECT_BASE_MS * 2 ** attempts;
  attempts++;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    instance.connect().catch((err) => reportError("player reconnect", err));
  }, wait);
};

const addListeners = (player: Spotify.Player) => {
  player.addListener("ready", (event) => {
    attempts = 0;
    announceDevice(event.device_id);
    claimMediaKeys();
    restoreLastSession(event.device_id);
  });

  // the device goes away on sleep or when another client takes over; without
  // this the next click would reach for an id the server no longer knows
  player.addListener("not_ready", () => {
    registered = new Promise((resolve) => (announceDevice = resolve));
    reconnect(player);
  });

  // the SDK's own dealer socket drops on sleep and network changes, and it
  // reconnects on its own — but when that reconnect fails for good, these are
  // the only trace of why. account_error is the common one: no Premium.
  for (const event of [
    "initialization_error",
    "authentication_error",
    "account_error",
    "playback_error",
  ] as const) {
    player.addListener(event, ({ message }) => {
      // the first three end playback for good — no Premium, a dead token, a
      // player that never came up — and the user has to be told. A playback
      // error is usually one track the CDN refused, and the SDK moves on
      if (event === "playback_error")
        console.error(`player ${event}:`, message);
      else reportError(`player ${event}`, new Error(message));
    });
  }

  // ponytail: position is ticked locally between SDK events, each event resyncs it
  player.addListener("player_state_changed", (event) => {
    $playerState.set(withPending(event));
    $position.set(event.position);
    updateTrackColor(event);
    publishNowPlaying();

    if (tickTimer) clearInterval(tickTimer);
    if (event.paused) return;

    let lastTick = Date.now();
    tickTimer = setInterval(() => {
      const now = Date.now();
      $position.set($position.get() + (now - lastTick));
      lastTick = now;
    }, 500);
  });
};

/** The Web Playback SDK connects as soon as the player state is observed. */
onMount($playerState, () =>
  authModel.whenAuthorized(async () => {
    if (player) return;

    window.onSpotifyWebPlaybackSDKReady = async () => {
      const instance = new window.Spotify.Player({
        name: "Yfitops",
        getOAuthToken: (cb) => authModel.ensureToken().then(cb),
        volume: 1,
      });

      // listeners first: `ready` fires right after connect, and attaching
      // afterwards can miss it — leaving the device id empty for good
      addListeners(instance);
      await instance.connect();
      player = instance;
    };

    await loadWebSdk();
  }),
);
