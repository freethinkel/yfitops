import { atom, computed, onMount } from "nanostores";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { webSession } from "$lib/modules/auth/model";
import {
  getCluster,
  setQueue,
  skipTo,
  type QueueEntry,
} from "$lib/shared/api/connect-state";
import {
  $likedSongs,
  toggleLike,
} from "$lib/modules/playlist/model/playlist.model";
import { fetchTracks } from "$lib/shared/api/catalog";
import { getAccentColorFromImage } from "$lib/shared/helpers/color";
import { reportError } from "$lib/shared/helpers/errors";

/**
 * Playback happens in Rust now — librespot decodes the stream itself, so
 * nothing here touches the Web Playback SDK, Widevine or the public Web API.
 * The shape below is the one the SDK used to report, kept as it was so the
 * components reading it stay untouched.
 */
export const $playerState = atom<Spotify.PlaybackState | null>(null);
/**
 * Ticks twice a second, so it lives apart from `$playerState` — otherwise every
 * component watching the track would re-render at the same rate.
 */
export const $position = atom(0);
export const $trackColor = atom("transparent");

let tickTimer: ReturnType<typeof setInterval> | null = null;
let colorSource = "";

/** Connect still addresses the queue by device, and Rust owns that id. */
let announceDevice!: (id: string) => void;
let registered = new Promise<string>((resolve) => (announceDevice = resolve));

const DEVICE_TIMEOUT = 15_000;

const device = () =>
  Promise.race([
    registered,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("The player never became ready")),
        DEVICE_TIMEOUT,
      ),
    ),
  ]);

const setShuffle = (shuffle: boolean) =>
  invoke("player_set_shuffle", { shuffle });

const setRepeat = (mode: "off" | "context" | "track") =>
  invoke("player_set_repeat", { mode });

export const togglePlaypause = () =>
  invoke("player_play_pause").catch((err) =>
    reportError("player play/pause", err),
  );
export const nextTrack = () => {
  // whatever was first in the queue is the track now starting
  const queue = $queue.get();
  if (queue?.length) optimistic(queue.slice(1));

  invoke("player_next").catch((err) => reportError("player next", err));
};

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

export const prevTrack = () =>
  invoke("player_previous").catch((err) => reportError("player previous", err));

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
  invoke("player_seek", { positionMs: Math.round(position) }).catch((err) =>
    reportError("player seek", err),
  );

  $position.set(position);
};

export const seekBy = (deltaMs: number) => {
  const duration = $playerState.get()?.duration ?? 0;
  seek(Math.min(Math.max($position.get() + deltaMs, 0), duration));
};

/** A bare list of tracks — liked songs have no context uri of their own. */
const startPlayback = (uris: string[], index = 0) =>
  invoke("player_load_tracks", { uris, index });

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
 * The index pins the track the user clicked whatever shuffle is set to, so the
 * old dance of turning shuffle off around the call — three requests for one
 * click — is gone.
 */
export const play = (uris: string[]) =>
  withDevice("play", () => startPlayback(uris));

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
const startContext = (uri: string) => invoke("player_load_context", { uri });

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

const updateTrackColor = async (url: string) => {
  if (url === colorSource) return;

  colorSource = url;
  $trackColor.set(await getAccentColorFromImage(url));
};

/** librespot names the track by uri; everything else about it we fetch. */
const trackCache = new Map<string, SpotifyApi.TrackObjectFull>();

const trackOf = async (uri: string) => {
  const hit = trackCache.get(uri);
  if (hit) return hit;

  // `getTrack` knows the name and the length but neither the artists nor the
  // album; decorating is what fills those in, and the queue needs it anyway
  const [track] = await fetchTracks([uri]);
  if (!track) throw new Error(`No metadata for ${uri}`);

  trackCache.set(uri, track);

  return track;
};

type PlayerEvent = {
  kind:
    | "playing"
    | "paused"
    | "stopped"
    | "track"
    | "seeked"
    | "position"
    | "end";
  uri?: string;
  position_ms?: number;
};

/** Position is ticked locally between events; each event resyncs it. */
const retick = (paused: boolean) => {
  if (tickTimer) clearInterval(tickTimer);
  if (paused) return;

  let lastTick = Date.now();

  tickTimer = setInterval(() => {
    const now = Date.now();
    $position.set($position.get() + (now - lastTick));
    lastTick = now;
  }, 500);
};

const applyEvent = async (event: PlayerEvent) => {
  if (event.kind === "end") return;

  const previous = $playerState.get();
  const uri = event.uri ?? previous?.track_window.current_track.uri ?? "";
  if (!uri) return;

  const changed = uri !== previous?.track_window.current_track.uri;
  const track = changed ? await trackOf(uri) : null;
  const paused = event.kind === "paused" || event.kind === "stopped";

  const current = (track ??
    previous?.track_window.current_track) as Spotify.Track;

  const state = {
    ...previous,
    paused,
    position: event.position_ms ?? previous?.position ?? 0,
    duration: track?.duration_ms ?? previous?.duration ?? 0,
    shuffle: previous?.shuffle ?? false,
    repeat_mode: previous?.repeat_mode ?? 0,
    // the SDK reported the neighbours too; librespot does not, and the queue
    // panel is where that information lives now
    track_window: {
      current_track: current,
      previous_tracks: [],
      next_tracks: [],
    },
  } as unknown as Spotify.PlaybackState;

  $playerState.set(withPending(state));

  if (event.position_ms !== undefined) $position.set(event.position_ms);
  if (track) updateTrackColor(track.album.images[0]?.url ?? "");

  retick(paused);
};

/** librespot starts as soon as anything observes the player state. */
let starting = false;

onMount($playerState, () =>
  webSession.whenAuthorized(async () => {
    if (starting) return;
    starting = true;

    const stop = listen<PlayerEvent>("player-event", ({ payload }) =>
      applyEvent(payload).catch((err) => reportError("player event", err)),
    );

    try {
      const id = await invoke<string>("player_start", {
        token: await webSession.ensureToken(),
        name: "Yfitops",
      });

      announceDevice(id);
    } catch (err) {
      starting = false;
      stop.then((off) => off());
      throw err;
    }
  }),
);
