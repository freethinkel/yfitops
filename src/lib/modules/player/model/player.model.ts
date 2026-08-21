import { atom, computed, onMount } from "nanostores";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { webSession } from "$lib/modules/auth/model";
import {
  getCluster,
  setQueue,
  type QueueEntry,
} from "$lib/shared/api/connect-state";
import {
  $likedSongs,
  toggleLike,
} from "$lib/modules/playlist/model/playlist.model";
import { fetchTracks } from "$lib/shared/api/catalog";
import { webPlayerVersion } from "$lib/shared/api/pathfinder";
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

/**
 * The state we opened onto belongs to Connect, not to our player — it holds no
 * track, and telling it to play is telling it to play nothing. Claiming the
 * session is what hands it the track, and Spirc only starts once it has one.
 */
let restored: { uris: string[]; position: number } | null = null;

const claimPlayback = async (
  pending: NonNullable<typeof restored>,
  from?: string,
) => {
  restored = null;

  // skipping before anything has been claimed is still the first load, only
  // aimed a track further along — and the position belongs to the track that
  // was on screen, so it goes with nothing else
  const index = from ? Math.max(0, pending.uris.indexOf(from)) : 0;

  // the same call a click in a playlist makes — Spirc starts on its own, so
  // there is no play to send after it, and the position goes in with the load
  // rather than as a seek afterwards, which would be heard as a false start
  await invoke("player_load_tracks", {
    uris: pending.uris,
    index,
    seekTo: index ? 0 : Math.round(pending.position),
  });
};

/**
 * Which of the two to call is decided here rather than in Spirc: its task
 * queues commands behind its own network traffic, and the delay is audible.
 * The state flips optimistically for the same reason.
 */
export const togglePlaypause = () => {
  const state = $playerState.get();
  if (!state) return;

  const paused = !state.paused;

  patchState({ paused });
  retick(paused);

  if (!paused && restored) {
    return claimPlayback(restored).catch((err) =>
      reportError("player claim", err),
    );
  }

  return invoke(paused ? "player_pause" : "player_play").catch((err) =>
    reportError("player play/pause", err),
  );
};
/**
 * Tracks already played, so stepping back does not have to ask anyone.
 * Connect reports what comes next but keeps no history of its own.
 */
const history: QueueTrack[] = [];

/**
 * A queue entry carries what a 32px row needs and nothing more — its cover is
 * the smallest size Spotify offers, and the panels that show the current track
 * ask for the largest. So the real track is used wherever it is already known,
 * and what is built here is only the stand-in until it is.
 */
const asTrack = (item: QueueTrack) => {
  const known = trackCache.get(item.uri);
  if (known) return known as unknown as Spotify.Track;

  return {
    id: item.uri.split(":")[2] ?? "",
    uri: item.uri,
    name: item.name,
    duration_ms: item.durationMs,
    artists: [{ name: item.artist, uri: "" }],
    album: { name: "", uri: "", images: [{ url: item.image }] },
  } as unknown as Spotify.Track;
};

const asQueueTrackFromState = (state: Spotify.PlaybackState): QueueTrack => {
  const track = state.track_window.current_track;

  return {
    uri: track.uri,
    uid: "",
    name: track.name,
    artist: track.artists.map((artist) => artist.name).join(", "),
    image: track.album.images[0]?.url ?? "",
    durationMs: state.duration,
  };
};

/**
 * Until the player confirms this uri, events about any other track belong to
 * what was playing before and would drag the interface back a step.
 */
let expected = "";
let skipTimer: ReturnType<typeof setTimeout> | null = null;
let expectTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Long enough for the player to fetch the track and report it, short enough
 * that a wait nobody will end is not one the user sits through.
 */
const EXPECT_TIMEOUT_MS = 8_000;

/**
 * Nothing else may clear this: a jump that fails, or lands on a track the
 * player skips past unavailable, would otherwise leave it set for good — and
 * with it set every event is dropped and the interface stops moving at all.
 */
const expect = (uri: string) => {
  expected = uri;

  if (expectTimer) clearTimeout(expectTimer);
  expectTimer = uri ? setTimeout(() => expect(""), EXPECT_TIMEOUT_MS) : null;
};

/**
 * Switching shows the new track at once and sends a single command for the
 * whole burst — holding the key would otherwise queue one load per press and
 * the player would spend its time on tracks nobody waits for any more.
 */
const skipBy = (delta: number) => {
  const state = $playerState.get();
  const queue = [...($queue.get() ?? [])];
  if (!state) return;

  const current = asQueueTrackFromState(state);
  const target = delta > 0 ? queue.shift() : history.pop();

  if (!target) {
    // what the button promises when there is nothing behind, and what every
    // other player does with it
    if (delta < 0) seek(0);
    return;
  }

  if (delta > 0) history.push(current);
  else queue.unshift(current);

  expect(target.uri);

  // the track being left behind would otherwise keep playing until the next
  // one has loaded, which is most of a second of the wrong music
  invoke("player_halt").catch(() => {});

  $playerState.set({
    ...state,
    paused: false,
    // we know the wait starts here; the player's own loading event never
    // fires for a track it has already fetched
    loading: true,
    position: 0,
    duration: target.durationMs,
    track_window: {
      ...state.track_window,
      current_track: asTrack(target),
    },
  } as Spotify.PlaybackState);

  $position.set(0);
  $queue.set(queue);
  retick(false);

  if (skipTimer) clearTimeout(skipTimer);

  skipTimer = setTimeout(() => {
    skipTimer = null;

    // the state we opened onto is Connect's: our player holds nothing yet, and
    // a jump against nothing is refused — the claim is what loads the list, so
    // it is made here with the target named instead
    const jump = restored
      ? claimPlayback(restored, expected)
      : invoke("player_skip_to", { uri: expected });

    jump
      .then(() => {
        // the jump makes Spirc rebuild its queue, so the local one has to be
        // read back — otherwise the two drift apart and the next press picks a
        // track the player is no longer anywhere near
        scheduleSync();
      })
      .catch((err) => {
        // nothing is going to confirm a jump that never happened
        expect("");
        loadQueue();
        reportError("player skip", err);
      });
  }, SKIP_DEBOUNCE_MS);
};

/** Long enough to collapse a burst of presses, short enough to feel immediate. */
const SKIP_DEBOUNCE_MS = 300;

export const nextTrack = () => skipBy(1);

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

export const prevTrack = () => skipBy(-1);

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

/**
 * Whatever was played before is behind a different context now: stepping back
 * into it would ask the player for a track it is nowhere near.
 */
const forgetHistory = () => (history.length = 0);

/**
 * A bare list of tracks — liked songs have no context uri of their own.
 * Without an index the player picks the starting track itself, which is what
 * shuffled play wants; a click pins the track it was made on.
 */
const startPlayback = (uris: string[], index?: number) => {
  forgetHistory();

  return invoke("player_load_tracks", { uris, index });
};

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
  withDevice("play", () => startPlayback(uris, 0));

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
const startContext = (uri: string) => {
  forgetHistory();

  return invoke("player_load_context", { uri });
};

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

  // the same tracks the panels ask for by uri: fetched once, kept for both
  for (const track of await fetchTracks(uris)) {
    found.set(track.uri, track);
    trackCache.set(track.uri, track);
  }

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
    $queueError.set("Очередь читается веб-сессией — войди заново");
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
  // skipping to a track drops everything queued ahead of it
  const queue = $queue.get() ?? [];
  const index = queue.indexOf(track);
  if (index >= 0) optimistic(queue.slice(index + 1));

  // straight to the player rather than asking Connect to skip for us: that
  // request travels to the server and back to this very device
  await invoke("player_skip_to", { uri: track.uri });

  scheduleSync();
};

onMount($queue, () => {
  let current = "";

  return $playerState.subscribe((state) => {
    const trackId = state?.track_window.current_track.id ?? "";
    if (trackId === current) return;

    current = trackId;

    // a switch of our own is still settling: it moved the queue by hand and
    // re-reads it once the player confirms, so reading it now would only be a
    // request per press
    if (expected) return;

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
    | "loading"
    | "track"
    | "seeked"
    | "position"
    | "options"
    | "end";
  uri?: string;
  position_ms?: number;
  shuffle?: boolean;
  repeat_mode?: number;
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

/** Events arrive faster than the metadata each one may need to look up. */
let eventChain: Promise<unknown> = Promise.resolve();

const applyEvent = async (event: PlayerEvent) => {
  if (event.kind === "end") return;

  // no track involved: Spirc saying what it actually has shuffle and repeat
  // set to. Until now the interface only ever heard its own guess back
  if (event.kind === "options") {
    const state = $playerState.get();
    if (!state) return;

    $playerState.set(
      withPending({
        ...state,
        ...(event.shuffle !== undefined && { shuffle: event.shuffle }),
        ...(event.repeat_mode !== undefined && {
          repeat_mode: event.repeat_mode,
        }),
      } as Spotify.PlaybackState),
    );

    return;
  }

  const previous = $playerState.get();
  const uri = event.uri ?? previous?.track_window.current_track.uri ?? "";
  if (!uri) return;

  // a switch is in flight: everything the player still says about the track
  // being left behind would only pull the interface back to it
  if (expected) {
    if (uri !== expected) return;
    expect("");
  }

  const changed = uri !== previous?.track_window.current_track.uri;

  // a skip puts the stand-in on screen before the player confirms anything,
  // and the confirmation names the track already showing — so without this the
  // panels keep the queue's thumbnail and the accent colour for the whole
  // track. Once fetched it is a cache hit, not a request
  const standIn = !previous?.track_window.current_track.album?.name;
  const track = changed || standIn ? await trackOf(uri) : null;
  const paused = event.kind === "paused" || event.kind === "stopped";

  const current = (track ??
    previous?.track_window.current_track) as Spotify.Track;

  const state = {
    ...previous,
    paused,
    // the field the SDK used to report: fetched and decoded, but no sound yet.
    // Anything that reports a position means sound is out, so the wait is over
    loading: event.kind === "loading",
    // a track event carries no position, and the one the previous track was
    // at is the one thing it certainly is not
    position: event.position_ms ?? (changed ? 0 : (previous?.position ?? 0)),
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

  restored = null;

  if (event.position_ms !== undefined) $position.set(event.position_ms);

  if (track) updateTrackColor(track.album.images[0]?.url ?? "");

  publishNowPlaying(state);
  retick(paused);
};

/**
 * The system panel doubles as our claim on the media keys: macOS hands them to
 * whichever app reports that it is playing something.
 */
const publishNowPlaying = (state: Spotify.PlaybackState) => {
  const track = state.track_window.current_track;

  invoke("media_publish", {
    title: track?.name ?? "",
    artist: (track?.artists ?? []).map((artist) => artist.name).join(", "),
    album: track?.album?.name ?? "",
    durationMs: state.duration ?? 0,
    positionMs: state.position ?? 0,
    playing: !state.paused,
  }).catch(() => {});
};

/** librespot starts as soon as anything observes the player state. */
let starting = false;

/** Long enough that a dropped connection is not hammered while it recovers. */
const RESTART_DELAY_MS = 2_000;

/**
 * Opens onto whatever the account is playing rather than an empty player.
 * The cluster names the track by uri and decorates it only when the device
 * that was playing bothered to, so the metadata is fetched like anywhere else.
 */
const restoreState = async () => {
  if ($playerState.get()) return;

  const cluster = await getCluster(await webSession.ensureToken());
  const state = cluster.player_state;
  const uri = state?.track?.uri;

  if (!uri) return;

  const track = await trackOf(uri);
  const position = Number(state?.position_as_of_timestamp ?? 0) || 0;

  // whatever the account was left playing with — our player starts with both
  // off, so they are pushed into it as well or the first load would clear them
  const shuffle = state?.options?.shuffling_context ?? false;
  const repeat = state?.options?.repeating_track
    ? 2
    : state?.options?.repeating_context
      ? 1
      : 0;

  if (shuffle)
    setShuffle(true).catch((err) => reportError("player shuffle", err));
  if (repeat) {
    setRepeat(repeat === 2 ? "track" : "context").catch((err) =>
      reportError("player repeat", err),
    );
  }

  const playback = {
    paused: !state?.is_playing || state?.is_paused === true,
    loading: false,
    position,
    duration: track.duration_ms || Number(state?.duration ?? 0) || 0,
    shuffle,
    repeat_mode: repeat,
    track_window: {
      current_track: track,
      previous_tracks: [],
      next_tracks: [],
    },
  } as unknown as Spotify.PlaybackState;

  $playerState.set(playback);
  $position.set(position);

  // our player holds nothing yet — this is what the first press loads, and the
  // rest of the queue comes along so it does not stop after the one track
  restored = {
    uris: [uri, ...(state?.next_tracks ?? []).map((entry) => entry.uri)].filter(
      (candidate) => candidate.startsWith("spotify:track:"),
    ),
    position,
  };

  updateTrackColor(track.album.images[0]?.url ?? "");
  publishNowPlaying(playback);
};

/** librespot serves its cached token until the lifetime it was given runs out. */
const secondsLeft = (expiresAt: number) =>
  Math.max(1, Math.round((expiresAt - Date.now()) / 1000));

/** The token the running session was last given, so it is not handed twice. */
let handed = "";

/**
 * The session outlives the token it started on, and librespot has no way of
 * fetching another — ours was issued to the web player, which is exactly what
 * login5 refuses. So every renewal is pushed in as it is issued; without it
 * metadata, CDN urls and audio keys all start answering 401 within the hour.
 */
const handToken = ({
  accessToken,
  expiresAt,
}: {
  accessToken: string;
  expiresAt: number;
}) => {
  handed = accessToken;

  return invoke("player_set_token", {
    token: accessToken,
    expiresIn: secondsLeft(expiresAt),
  }).catch((err) => {
    // nothing to hand it to yet: `start` passes the current one itself
    if (String(err).includes("session is not running")) return;

    reportError("player token", err);
  });
};

const start = async () => {
  const token = await webSession.ensureToken();
  const expiresAt = webSession.$token.get()?.expiresAt ?? Date.now();

  handed = token;

  const id = await invoke<string>("player_start", {
    token,
    expiresIn: secondsLeft(expiresAt),
    // librespot asks for the client token under this, and a stale one is
    // refused — the bundle names the version the web player is actually on
    version: webPlayerVersion(),
    name: "Yfitops",
  });

  announceDevice(id);

  // after the device exists, so a cluster read sees this session too
  await restoreState().catch((err) => reportError("player restore", err));
};

const onMediaKey = (key: string) => {
  const paused = $playerState.get()?.paused;

  if (key === "next") nextTrack();
  else if (key === "previous") prevTrack();
  else if (key === "toggle") togglePlaypause();
  else if (key === "play" && paused) togglePlaypause();
  else if (key === "pause" && !paused) togglePlaypause();
};

onMount($playerState, () => {
  // both listeners have to come off with the store, or a remount leaves the
  // old ones in place — every event then arrives twice and one press skips
  // two tracks
  const listeners: Promise<UnlistenFn>[] = [];

  const stopToken = webSession.$token.subscribe((fresh) => {
    if (fresh && fresh.accessToken !== handed) handToken(fresh);
  });

  const stop = webSession.whenAuthorized(async () => {
    if (starting) return;
    starting = true;

    listeners.push(
      listen<PlayerEvent>("player-event", ({ payload }) => {
        // one at a time: each handler reads the state the previous one left,
        // and two of them in flight apply in whichever order their metadata
        // lookups happen to finish
        eventChain = eventChain
          .then(() => applyEvent(payload))
          .catch((err) => reportError("player event", err));
      }),
      // the keys land in Rust and come back here, so a press runs exactly what
      // a click on the same button runs
      listen<string>("media-key", ({ payload }) => onMediaKey(payload)),
      // the access point drops the session eventually; without a fresh one
      // every button stays dead until the app is restarted
      listen("player-gone", () => {
        registered = new Promise((resolve) => (announceDevice = resolve));

        // the session that replaces this one starts empty, and `restoreState`
        // steps aside as long as there is a state on screen — without this the
        // transport buttons reach an idle Spirc and do nothing at all
        const state = $playerState.get();

        if (state) {
          restored = {
            uris: [
              state.track_window.current_track.uri,
              ...($queue.get() ?? []).map((track) => track.uri),
            ].filter((uri) => uri?.startsWith("spotify:track:")),
            position: $position.get(),
          };
        }

        setTimeout(
          () => start().catch((err) => reportError("player restart", err)),
          RESTART_DELAY_MS,
        );
      }),
    );

    try {
      await start();
    } catch (err) {
      starting = false;
      throw err;
    }
  });

  return () => {
    listeners.forEach((pending) => pending.then((off) => off()));
    listeners.length = 0;
    starting = false;
    handed = "";
    stopToken();
    stop();
  };
});
