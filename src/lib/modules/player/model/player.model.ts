import { atom, onMount } from "nanostores";
import { authModel, internalSession } from "$lib/modules/auth/model";
import {
  getCluster,
  setQueue,
  skipTo,
  type QueueEntry,
} from "$lib/shared/api/connect-state";
import { spotifyApi } from "$lib/shared/api/spotify";
import { getAccentColorFromImage } from "$lib/shared/helpers/color";
import { loadWebSdk } from "./web-sdk";

export const $playerState = atom<Spotify.PlaybackState | null>(null);
export const $trackColor = atom("transparent");

let player: Spotify.Player | null = null;
let deviceId = "";
let tickTimer: ReturnType<typeof setInterval> | null = null;
let colorSource = "";

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

const sendToggle = <T>(key: ToggleKey, value: boolean | number, send: () => Promise<T>) => {
  pending.set(key, value);
  patchState({ [key]: value } as Partial<Spotify.PlaybackState>);

  toggleChain = toggleChain.then(send).catch((err) => {
    pending.delete(key);
    console.error(`player ${key}:`, err);
  });

  return toggleChain;
};

export const toggleShuffle = () => {
  const state = $playerState.get();
  if (!state) return;

  const shuffle = !state.shuffle;

  return sendToggle("shuffle", shuffle, () =>
    spotifyApi.setShuffle(shuffle, { device_id: deviceId }),
  );
};

/** off → context → track → off, the order the native clients cycle through. */
export const cycleRepeat = () => {
  const mode = $playerState.get()?.repeat_mode ?? 0;
  const next = (["context", "track", "off"] as const)[mode];

  return sendToggle("repeat_mode", (mode + 1) % 3, () =>
    spotifyApi.setRepeat(next, { device_id: deviceId }),
  );
};

export const prevTrack = () => player?.previousTrack();

export const seek = (position: number) => {
  player?.seek(position);

  const state = $playerState.get();
  if (state) $playerState.set({ ...state, position });
};

const startPlayback = (uris: string[]) => spotifyApi.play({ uris, device_id: deviceId });

/**
 * With shuffle on the API picks a random entry from `uris` instead of the
 * first one, so clicking a row started some other track. Shuffle is turned off
 * for the call and put back right after — re-enabling keeps the track that is
 * already playing and only reshuffles what comes next, which is what the
 * native clients do.
 */
export const play = async (uris: string[]) => {
  const shuffled = $playerState.get()?.shuffle ?? false;

  if (shuffled) await spotifyApi.setShuffle(false, { device_id: deviceId });
  await startPlayback(uris);
  if (shuffled) await spotifyApi.setShuffle(true, { device_id: deviceId });
};

/** Plays a whole playlist, album or artist by its uri. */
/** Same for a bare list of tracks — liked songs have no context uri. */
export const playShuffled = async (uris: string[]) => {
  patchState({ shuffle: true });
  pending.set("shuffle", true);

  await spotifyApi.setShuffle(true, { device_id: deviceId });
  await startPlayback(uris);
};

/** Starts a playlist or album shuffled, the way the native clients do. */
export const shuffleContext = async (uri: string) => {
  patchState({ shuffle: true });
  pending.set("shuffle", true);

  await spotifyApi.setShuffle(true, { device_id: deviceId });
  await playContext(uri);
};

export const playContext = (uri: string) =>
  spotifyApi.play({ context_uri: uri, device_id: deviceId });

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

const token = () => internalSession.ensureToken();

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
  const ids = [
    ...new Set(
      tracks
        .filter((track) => !track.name && track.uri.startsWith("spotify:track:"))
        .map((track) => track.uri.split(":")[2]),
    ),
  ];

  if (!ids.length) return;

  const found = new Map<string, SpotifyApi.TrackObjectFull>();

  for (let i = 0; i < ids.length; i += 50) {
    const res = await spotifyApi.getTracks(ids.slice(i, i + 50));
    for (const track of res.tracks) if (track) found.set(track.id, track);
  }

  if (mine !== epoch) return;

  $queue.set(
    ($queue.get() ?? []).map((track) => {
      const full = found.get(track.uri.split(":")[2]);
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
    console.error("queue:", message);
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
    const accessToken = await token();
    if (!accessToken || !deviceId) return;

    try {
      const cluster = await getCluster(accessToken);
      const state = cluster.player_state;
      if (!state) return;

      await setQueue({
        accessToken,
        deviceId,
        nextTracks: next.map(toEntry),
        prevTracks: state.prev_tracks ?? [],
        revision: state.queue_revision,
      });

      // only the last edit of a burst is worth syncing back
      if (mine === epoch) scheduleSync();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("queue edit:", message);
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
  const accessToken = await token();
  if (!accessToken || !deviceId) return;

  // skipping to a track drops everything queued ahead of it
  const queue = $queue.get() ?? [];
  const index = queue.indexOf(track);
  if (index >= 0) optimistic(queue.slice(index + 1));

  await skipTo({
    accessToken,
    deviceId,
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
    if (queue?.length && queue[0].uri === state?.track_window.current_track.uri) {
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

const addListeners = (player: Spotify.Player) => {
  player.addListener("ready", (event) => {
    deviceId = event.device_id;
  });

  // ponytail: position is ticked locally between SDK events, each event resyncs it
  player.addListener("player_state_changed", (event) => {
    $playerState.set(withPending(event));
    updateTrackColor(event);

    if (tickTimer) clearInterval(tickTimer);
    if (event.paused) return;

    let lastTick = Date.now();
    tickTimer = setInterval(() => {
      const state = $playerState.get();
      if (!state) return;

      $playerState.set({
        ...state,
        position: state.position + (Date.now() - lastTick),
      });
      lastTick = Date.now();
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

      await instance.connect();
      player = instance;
      addListeners(instance);
    };

    await loadWebSdk();
  }),
);
