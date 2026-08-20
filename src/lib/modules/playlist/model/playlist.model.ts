import {
  atom,
  computed,
  onMount,
  type ReadableAtom,
  type WritableAtom,
} from "nanostores";
import { webSession } from "$lib/modules/auth/model";
import { userModel } from "$lib/modules/user/model";
import { fetchLikedTracks, fetchPlaylists } from "$lib/shared/api/library";
import { fetchAlbum, fetchArtist, inLibrary } from "$lib/shared/api/catalog";
import {
  addTracks,
  removeTracks,
  setInLibrary,
} from "$lib/shared/api/mutations";
import { fetchInternalPlaylist } from "./internal-playlist";
import { forget, persisted, read, write } from "$lib/shared/helpers/persisted";
import { reportError } from "$lib/shared/helpers/errors";

export const $likedSongs = atom<SpotifyApi.SavedTrackObject[] | null>(null);
export const $playlists = atom<SpotifyApi.PlaylistObjectSimplified[] | null>(
  null,
);

// ponytail: a flag, not the store's own value — a persisted value must not
// pass for "already fetched", otherwise the cache never refreshes
let likedLoaded = false;
let playlistsLoaded = false;

/**
 * The gateway hands over the whole saved list in a page or two, so this is no
 * longer the burst of requests the Web API made of it — but it is still a few
 * hundred kilobytes on every launch for a list that rarely changes. Liking a
 * track updates the cached copy as it goes, so the only thing this delays is a
 * change made on another device.
 */
const LIKED = "liked";
const LIKED_FETCHED_AT = "liked-fetched-at";
const LIKED_MAX_AGE = 30 * 60 * 1000;

onMount($likedSongs, () => {
  const unbind = persisted($likedSongs, LIKED);

  const stop = webSession.whenAuthorized(async () => {
    if (likedLoaded) return;

    // read from the cache, not the store: the store is restored asynchronously
    // too, and which of the two lands first is not ours to say
    const [at, cached] = await Promise.all([
      read<number>(LIKED_FETCHED_AT),
      read<SpotifyApi.SavedTrackObject[]>(LIKED),
    ]);

    if (Date.now() - (at ?? 0) < LIKED_MAX_AGE && cached?.length) {
      likedLoaded = true;
      return;
    }

    $likedSongs.set(await fetchLikedTracks());
    likedLoaded = true;
    write(LIKED_FETCHED_AT, Date.now());
  });

  return () => {
    unbind();
    stop();
  };
});

onMount($playlists, () => {
  const unbind = persisted($playlists, "playlists");

  const stop = webSession.whenAuthorized(async () => {
    if (playlistsLoaded) return;
    $playlists.set(await fetchPlaylists());
    playlistsLoaded = true;
  });

  return () => {
    unbind();
    stop();
  };
});

// ponytail: fetched entities are cached forever, drop the map entry if staleness ever matters
const cache = new Map<string, ReadableAtom<unknown>>();

/** Store for one fetched entity — it loads itself on the first subscriber. */
const cached = <T>(key: string, load: () => Promise<T>) => {
  const hit = cache.get(key);
  if (hit) return hit as ReadableAtom<T | null>;

  const $store = atom<T | null>(null);
  let loaded = false;

  onMount($store, () => {
    const unbind = persisted($store, key);

    const stop = webSession.whenAuthorized(async () => {
      if (loaded) return;
      $store.set(await load());
      loaded = true;
    });

    return () => {
      unbind();
      stop();
    };
  });

  cache.set(key, $store);
  return $store as ReadableAtom<T | null>;
};

/** Playlists the user may write to — their own and collaborative ones. */
export const $editablePlaylists = computed(
  [$playlists, userModel.$userData],
  (playlists, user) =>
    (playlists ?? []).filter(
      (playlist) => playlist.collaborative || playlist.owner.id === user?.id,
    ),
);

export const addToPlaylist = async (playlistId: string, uri: string) => {
  await addTracks(`spotify:playlist:${playlistId}`, [uri]);

  // the playlist is cached in memory and on disk — both must forget it
  cache.delete(`playlist:${playlistId}`);
  await forget(`playlist:${playlistId}`);
};

export const playlist = (id: string) =>
  cached(`playlist:${id}`, () => fetchInternalPlaylist(id));

export const album = (id: string) =>
  cached(`album:${id}`, () => fetchAlbum(id));

export type ArtistPage = {
  artist: SpotifyApi.ArtistObjectFull;
  topTracks: SpotifyApi.TrackObjectFull[];
  albums: SpotifyApi.AlbumObjectSimplified[];
};

export const artist = (id: string) =>
  cached<ArtistPage>(`artist:${id}`, () => fetchArtist(id));

/** Optimistic: the star flips first, the API call follows. */
export const toggleLike = async (track: SpotifyApi.TrackObjectFull) => {
  // local files and episodes carry no uri the library would accept
  if (!track.id || !track.uri) return;

  const liked = $likedSongs.get() ?? [];
  const isLiked = liked.some((item) => item.track.id === track.id);

  $likedSongs.set(
    isLiked
      ? liked.filter((item) => item.track.id !== track.id)
      : [{ added_at: new Date().toISOString(), track }, ...liked],
  );

  try {
    await setInLibrary([track.uri], !isLiked);
  } catch (err) {
    // the star was flipped ahead of the server: put it back rather than lie
    $likedSongs.set(liked);
    reportError("like", err);
  }
};

export const addToLiked = (track: SpotifyApi.TrackObjectFull) => {
  const liked = $likedSongs.get() ?? [];
  if (liked.some((item) => item.track.id === track.id)) return;

  return toggleLike(track);
};

export const removeFromPlaylist = async (playlistId: string, uid: string) => {
  await removeTracks(`spotify:playlist:${playlistId}`, [uid]);

  // the page reads from the cache, so it has to forget the stale copy
  cache.delete(`playlist:${playlistId}`);
  await forget(`playlist:${playlistId}`);
};

/**
 * Saved albums and followed artists, each a store that checks itself — and
 * kept, because a page revisited within a session used to pay for the same
 * answer again.
 */
const libraryChecks = new Map<string, WritableAtom<boolean | null>>();

const checked = (uri: string) => {
  const hit = libraryChecks.get(uri);
  if (hit) return hit;

  const $saved = atom<boolean | null>(null);

  onMount($saved, () =>
    webSession.whenAuthorized(async () => {
      if ($saved.get() !== null) return;

      const [saved] = await inLibrary([uri]);
      $saved.set(saved);
    }),
  );

  libraryChecks.set(uri, $saved);
  return $saved;
};

export const isSavedAlbum = (id: string) => checked(`spotify:album:${id}`);
export const isFollowedArtist = (id: string) => checked(`spotify:artist:${id}`);

const toggleLibrary = async (
  what: string,
  uri: string,
  $saved: WritableAtom<boolean | null>,
) => {
  const saved = $saved.get();
  $saved.set(!saved);

  try {
    await setInLibrary([uri], !saved);
  } catch (err) {
    $saved.set(saved);
    reportError(what, err);
  }
};

export const toggleSavedAlbum = (
  id: string,
  $saved: WritableAtom<boolean | null>,
) => toggleLibrary("save album", `spotify:album:${id}`, $saved);

export const toggleFollowedArtist = (
  id: string,
  $followed: WritableAtom<boolean | null>,
) => toggleLibrary("follow artist", `spotify:artist:${id}`, $followed);

/** Whether the playlist sits in the user's library — drives the add button. */
export const isFollowed = (id: string) =>
  computed($playlists, (playlists) =>
    (playlists ?? []).some((item) => item.id === id),
  );

export const followPlaylist = async (id: string) => {
  await setInLibrary([`spotify:playlist:${id}`], true);

  const playlists = $playlists.get() ?? [];
  if (playlists.some((item) => item.id === id)) return;

  // the entity is already loaded — the page the button sits on is what fetched it
  const added = playlist(id).get();
  if (!added) return;

  $playlists.set([
    added as unknown as SpotifyApi.PlaylistObjectSimplified,
    ...playlists,
  ]);
};

export const unfollowPlaylist = async (id: string) => {
  await setInLibrary([`spotify:playlist:${id}`], false);

  $playlists.set(($playlists.get() ?? []).filter((item) => item.id !== id));
  cache.delete(`playlist:${id}`);
  await forget(`playlist:${id}`);
};
