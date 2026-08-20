import { webSession } from "$lib/modules/auth/model";
import { pathfinderQuery } from "$lib/shared/api/pathfinder";

/**
 * Algorithmic playlists — Discover Weekly, the daily mixes — are invisible to
 * the Web API, which answers 404 for them. The web player's gateway serves them
 * fine, so this stands in whenever the public endpoint refuses.
 */
const FETCH_PLAYLIST_HASH =
  "86dde7b9d9356e2369414647cf6950cfed96e778e129cfdfc99aea6c1613b3b0";

type RawTrack = {
  __typename?: string;
  uri?: string;
  name?: string;
  trackDuration?: { totalMilliseconds?: number };
  artists?: { items?: { uri?: string; profile?: { name?: string } }[] };
  albumOfTrack?: {
    uri?: string;
    name?: string;
    coverArt?: { sources?: { url?: string; width?: number }[] };
  };
};

type RawPlaylist = {
  playlistV2?: {
    __typename?: string;
    name?: string;
    description?: string;
    images?: { items?: { sources?: { url?: string }[] }[] };
    ownerV2?: { data?: { name?: string } };
    content?: { items?: { itemV2?: { data?: RawTrack } }[] };
  };
};

const idOf = (uri = "") => uri.split(":").pop() ?? "";

const toTrack = (raw: RawTrack): SpotifyApi.TrackObjectFull | null => {
  if (!raw.uri || !raw.name) return null;

  const id = idOf(raw.uri);
  const images = (raw.albumOfTrack?.coverArt?.sources ?? [])
    .map((source) => ({
      url: source.url ?? "",
      width: source.width ?? null,
      height: null,
    }))
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));

  return {
    id,
    uri: raw.uri,
    name: raw.name,
    duration_ms: raw.trackDuration?.totalMilliseconds ?? 0,
    external_urls: { spotify: `https://open.spotify.com/track/${id}` },
    artists: (raw.artists?.items ?? []).map((artist) => ({
      id: idOf(artist.uri),
      uri: artist.uri ?? "",
      name: artist.profile?.name ?? "",
    })),
    album: {
      id: idOf(raw.albumOfTrack?.uri),
      uri: raw.albumOfTrack?.uri ?? "",
      name: raw.albumOfTrack?.name ?? "",
      images,
    },
  } as unknown as SpotifyApi.TrackObjectFull;
};

export const fetchInternalPlaylist = async (id: string) => {
  const data = await pathfinderQuery<RawPlaylist>({
    operationName: "fetchPlaylist",
    fallbackHash: FETCH_PLAYLIST_HASH,
    accessToken: await webSession.ensureToken(),
    variables: {
      uri: `spotify:playlist:${id}`,
      offset: 0,
      limit: 100,
      enableWatchFeedEntrypoint: true,
    },
  });

  const raw = data.playlistV2;
  if (!raw || raw.__typename !== "Playlist") {
    throw new Error(`Playlist ${id} not found`);
  }

  const tracks = (raw.content?.items ?? [])
    .map((item) => toTrack(item.itemV2?.data ?? {}))
    .filter((track): track is SpotifyApi.TrackObjectFull => track !== null);

  return {
    id,
    uri: `spotify:playlist:${id}`,
    name: raw.name ?? "",
    description: raw.description ?? "",
    images: (raw.images?.items ?? []).map((image) => ({
      url: image.sources?.[0]?.url ?? "",
      width: null,
      height: null,
    })),
    owner: { display_name: raw.ownerV2?.data?.name ?? "" },
    tracks: { items: tracks.map((track) => ({ track })) },
  } as unknown as SpotifyApi.PlaylistObjectFull;
};
