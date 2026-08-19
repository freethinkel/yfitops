import { atom, onMount } from "nanostores";
import { spotifyApi } from "$lib/shared/api/spotify";
import { parseSpotifyLink } from "$lib/shared/helpers/spotify-link";

const DEBOUNCE_MS = 300;
const LIMIT = 20;

/** The endpoint returns artists, the package's typings just do not say so. */
export type SearchAlbum = SpotifyApi.AlbumObjectSimplified & {
  artists?: SpotifyApi.ArtistObjectSimplified[];
};

export type SearchResults = {
  tracks: SpotifyApi.TrackObjectFull[];
  artists: SpotifyApi.ArtistObjectFull[];
  albums: SearchAlbum[];
  playlists: SpotifyApi.PlaylistObjectSimplified[];
};

export const $query = atom("");
export const $results = atom<SearchResults | null>(null);
export const $isPending = atom(false);

export const search = (query: string) => $query.set(query);

/** Typing drives the request: debounced, and stale answers are dropped. */
onMount($results, () => {
  let timer: ReturnType<typeof setTimeout>;
  let latest = 0;

  const unbind = $query.subscribe((query) => {
    clearTimeout(timer);

    if (!query.trim()) {
      latest++;
      $isPending.set(false);
      $results.set(null);
      return;
    }

    timer = setTimeout(async () => {
      const request = ++latest;
      $isPending.set(true);

      try {
        // a pasted link is an exact answer — no point in searching for its id
        const link = parseSpotifyLink(query.trim());

        if (link?.kind === "track") {
          const track = await spotifyApi.getTrack(link.id);
          if (request !== latest) return;

          $results.set({
            tracks: [track],
            artists: [],
            albums: [],
            playlists: [],
          });
          return;
        }

        const res = await spotifyApi.search(
          query,
          ["track", "artist", "album", "playlist"],
          { limit: LIMIT },
        );

        if (request !== latest) return;

        // Spotify sometimes pads these lists with nulls
        $results.set({
          tracks: (res.tracks?.items ?? []).filter(Boolean),
          artists: (res.artists?.items ?? []).filter(Boolean),
          albums: (res.albums?.items ?? []).filter(Boolean),
          playlists: (res.playlists?.items ?? []).filter(Boolean),
        });
      } finally {
        if (request === latest) $isPending.set(false);
      }
    }, DEBOUNCE_MS);
  });

  return () => {
    clearTimeout(timer);
    unbind();
  };
});
