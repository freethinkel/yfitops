import {
  atom,
  computed,
  onMount,
  type ReadableAtom,
  type WritableAtom,
} from "nanostores";
import { authModel, webSession } from "$lib/modules/auth/model";
import { userModel } from "$lib/modules/user/model";
import { spotifyApi } from "$lib/shared/api/spotify";
import { httpError } from "$lib/shared/api/http-error";
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
 * The saved list is paged fifty at a time, so a library of any size is a burst
 * of requests — and Spotify measures its rate limit over a rolling 30 second
 * window. Doing that on every launch was most of the way to a 429 on its own.
 * Liking a track updates the cached copy as it goes, so the only thing this
 * delays is a change made on another device.
 */
const LIKED = "liked";
const LIKED_FETCHED_AT = "liked-fetched-at";
const LIKED_MAX_AGE = 30 * 60 * 1000;

onMount($likedSongs, () => {
  const unbind = persisted($likedSongs, LIKED);

  const stop = authModel.whenAuthorized(async () => {
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

    const load = async (
      tracks: SpotifyApi.SavedTrackObject[],
      offset = 0,
    ): Promise<SpotifyApi.SavedTrackObject[]> => {
      const res = await spotifyApi.getMySavedTracks({ limit: 50, offset });

      if (res.items.length === 50) {
        return load([...tracks, ...res.items], offset + 50);
      }

      return [...tracks, ...res.items];
    };

    $likedSongs.set(await load([]));
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

  const stop = authModel.whenAuthorized(async () => {
    if (playlistsLoaded) return;
    $playlists.set((await spotifyApi.getUserPlaylists()).items);
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

    const stop = authModel.whenAuthorized(async () => {
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
  await spotifyApi.addTracksToPlaylist(playlistId, [uri]);

  // the playlist is cached in memory and on disk — both must forget it
  cache.delete(`playlist:${playlistId}`);
  await forget(`playlist:${playlistId}`);
};

export const playlist = (id: string) =>
  cached(`playlist:${id}`, async () => {
    try {
      return await spotifyApi.getPlaylist(id);
    } catch (err) {
      // Algorithmic playlists are 404 on the Web API — the gateway has them.
      if (!webSession.$isAuthorized.get()) throw err;
      return fetchInternalPlaylist(id);
    }
  });

export const album = (id: string) =>
  cached(`album:${id}`, () => spotifyApi.getAlbum(id));

export type ArtistPage = {
  artist: SpotifyApi.ArtistObjectFull;
  topTracks: SpotifyApi.TrackObjectFull[];
  albums: SpotifyApi.AlbumObjectSimplified[];
};

export const artist = (id: string) =>
  cached<ArtistPage>(`artist:${id}`, async () => {
    const [artist, top, albums] = await Promise.all([
      spotifyApi.getArtist(id),
      spotifyApi.getArtistTopTracks(id, "from_token"),
      spotifyApi.getArtistAlbums(id, {
        limit: 50,
        include_groups: "album,single",
      }),
    ]);

    return { artist, topTracks: [...top.tracks], albums: [...albums.items] };
  });

/**
 * The API wrapper sends the ids as a bare array body, which both library
 * endpoints now answer with a 400 — they want an object. The ids go in the
 * query instead, which they have always accepted and needs no body at all.
 */
const saveToLibrary = async (
  kind: "tracks" | "albums",
  method: "PUT" | "DELETE",
  ids: string[],
) => {
  const response = await fetch(
    `https://api.spotify.com/v1/me/${kind}?ids=${ids.join(",")}`,
    {
      method,
      headers: { Authorization: `Bearer ${await authModel.ensureToken()}` },
    },
  );

  if (!response.ok) throw httpError(`saved ${kind}`, response);
};

/** Optimistic: the star flips first, the API call follows. */
export const toggleLike = async (track: SpotifyApi.TrackObjectFull) => {
  // local files and episodes carry no track id, and `ids=` is a 400
  if (!track.id) return;

  const liked = $likedSongs.get() ?? [];
  const isLiked = liked.some((item) => item.track.id === track.id);

  $likedSongs.set(
    isLiked
      ? liked.filter((item) => item.track.id !== track.id)
      : [{ added_at: new Date().toISOString(), track }, ...liked],
  );

  try {
    await saveToLibrary("tracks", isLiked ? "DELETE" : "PUT", [track.id]);
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

export const removeFromPlaylist = async (playlistId: string, uri: string) => {
  await spotifyApi.removeTracksFromPlaylist(playlistId, [uri]);

  // the page reads from the cache, so it has to forget the stale copy
  cache.delete(`playlist:${playlistId}`);
  await forget(`playlist:${playlistId}`);
};

/** Saved albums and followed artists, each a store that checks itself. */
export const isSavedAlbum = (id: string) => {
  const $saved = atom<boolean | null>(null);

  onMount($saved, () =>
    authModel.whenAuthorized(async () => {
      const [saved] = await spotifyApi.containsMySavedAlbums([id]);
      $saved.set(saved);
    }),
  );

  return $saved;
};

export const toggleSavedAlbum = async (
  id: string,
  $saved: WritableAtom<boolean | null>,
) => {
  const saved = $saved.get();
  $saved.set(!saved);

  try {
    await saveToLibrary("albums", saved ? "DELETE" : "PUT", [id]);
  } catch (err) {
    $saved.set(saved);
    reportError("save album", err);
  }
};

export const isFollowedArtist = (id: string) => {
  const $followed = atom<boolean | null>(null);

  onMount($followed, () =>
    authModel.whenAuthorized(async () => {
      const [followed] = await spotifyApi.isFollowingArtists([id]);
      $followed.set(followed);
    }),
  );

  return $followed;
};

export const toggleFollowedArtist = async (
  id: string,
  $followed: WritableAtom<boolean | null>,
) => {
  const followed = $followed.get();
  $followed.set(!followed);

  try {
    if (followed) {
      await spotifyApi.unfollowArtists([id]);
    } else {
      await spotifyApi.followArtists([id]);
    }
  } catch (err) {
    $followed.set(followed);
    reportError("follow artist", err);
  }
};

/** Whether the playlist sits in the user's library — drives the add button. */
export const isFollowed = (id: string) =>
  computed($playlists, (playlists) =>
    (playlists ?? []).some((item) => item.id === id),
  );

export const followPlaylist = async (id: string) => {
  await spotifyApi.followPlaylist(id);

  const added = await spotifyApi.getPlaylist(id);
  const playlists = $playlists.get() ?? [];

  if (!playlists.some((item) => item.id === id)) {
    $playlists.set([
      added as SpotifyApi.PlaylistObjectSimplified,
      ...playlists,
    ]);
  }
};

export const unfollowPlaylist = async (id: string) => {
  await spotifyApi.unfollowPlaylist(id);

  $playlists.set(($playlists.get() ?? []).filter((item) => item.id !== id));
  cache.delete(`playlist:${id}`);
  await forget(`playlist:${id}`);
};
