import { atom, computed, onMount, type ReadableAtom } from "nanostores";
import { authModel, internalSession } from "$lib/modules/auth/model";
import { userModel } from "$lib/modules/user/model";
import { spotifyApi } from "$lib/shared/api/spotify";
import { fetchInternalPlaylist } from "./internal-playlist";
import { forget, persisted } from "$lib/shared/helpers/persisted";

export const $likedSongs = atom<SpotifyApi.SavedTrackObject[] | null>(null);
export const $playlists = atom<SpotifyApi.PlaylistObjectSimplified[] | null>(null);

// ponytail: a flag, not the store's own value — a persisted value must not
// pass for "already fetched", otherwise the cache never refreshes
let likedLoaded = false;
let playlistsLoaded = false;

onMount($likedSongs, () => {
  const unbind = persisted($likedSongs, "liked");

  const stop = authModel.whenAuthorized(async () => {
    if (likedLoaded) return;

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
  forget(`playlist:${playlistId}`);
};

export const playlist = (id: string) =>
  cached(`playlist:${id}`, async () => {
    try {
      return await spotifyApi.getPlaylist(id);
    } catch (err) {
      // Algorithmic playlists are 404 on the Web API — the gateway has them.
      if (!internalSession.$isAuthorized.get()) throw err;
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
      spotifyApi.getArtistAlbums(id, { limit: 50, include_groups: "album,single" }),
    ]);

    return { artist, topTracks: [...top.tracks], albums: [...albums.items] };
  });

/** Optimistic: the star flips first, the API call follows. */
export const toggleLike = async (track: SpotifyApi.TrackObjectFull) => {
  const liked = $likedSongs.get() ?? [];
  const isLiked = liked.some((item) => item.track.id === track.id);

  $likedSongs.set(
    isLiked
      ? liked.filter((item) => item.track.id !== track.id)
      : [{ added_at: new Date().toISOString(), track }, ...liked],
  );

  await (isLiked
    ? spotifyApi.removeFromMySavedTracks([track.id])
    : spotifyApi.addToMySavedTracks([track.id]));
};

export const addToLiked = (track: SpotifyApi.TrackObjectFull) => {
  const liked = $likedSongs.get() ?? [];
  if (liked.some((item) => item.track.id === track.id)) return;

  return toggleLike(track);
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
    $playlists.set([added as SpotifyApi.PlaylistObjectSimplified, ...playlists]);
  }
};

export const unfollowPlaylist = async (id: string) => {
  await spotifyApi.unfollowPlaylist(id);

  $playlists.set(($playlists.get() ?? []).filter((item) => item.id !== id));
  cache.delete(`playlist:${id}`);
  forget(`playlist:${id}`);
};
