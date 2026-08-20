import { fetch } from "@tauri-apps/plugin-http";
import { pathfinderQuery } from "./pathfinder";
import { webSession } from "$lib/modules/auth/model";
// type-only on purpose: these live in stores that import this file back, and a
// value import would close the cycle at runtime
import type { ArtistPage } from "$lib/modules/playlist/model/playlist.model";
import type { SearchResults } from "$lib/modules/search/model/search.model";
import type { UserPage } from "$lib/modules/user/model/user.model";

const ALBUM_HASH =
  "b9bfabef66ed756e5e13f68a942deb60bd4125ec1f1be8cc42769dc0259b4b10";
const ARTIST_HASH =
  "ae0e2958a4ab645b35ca19ac04d0495ae12d9c5d7b7286217674801a9aab281a";
const IN_LIBRARY_HASH =
  "134337999233cc6fdd6b1e6dbf94841409f04a946c5c7b744b09ba0dfe5a85ed";
const TRACK_HASH =
  "1a2f0cce77c90a4a5b1730beecc4da7e34290d684324c16663bf09a268ebce48";
const DECORATE_HASH =
  "383de00240775c39a6afe0b1055dc562b2a3930894201f9762f3fc32a74971c7";

/**
 * Search does not ship in the player's main bundle — it lives in the chunk the
 * search route loads. Left empty deliberately: the first query answers
 * `PersistedQueryNotFound`, and the transport then picks the hash out of that
 * chunk by name. Hardcoding one would only go stale on the next release.
 */
const SEARCH_HASH = "";
const SEARCH_CHUNK = "xpui-routes-search";

const PROFILE_URL =
  "https://spclient.wg.spotify.com/user-profile-view/v3/profile";

const idOf = (uri = "") => uri.split(":").pop() ?? "";

const query = async <T>(
  operationName: string,
  fallbackHash: string,
  variables: Record<string, unknown>,
  chunk?: string,
) =>
  pathfinderQuery<T>({
    operationName,
    fallbackHash,
    accessToken: await webSession.ensureToken(),
    variables,
    chunk,
  });

type Source = { url?: string; width?: number };

const imagesOf = (sources: Source[] = []) =>
  sources
    .map((source) => ({
      url: source.url ?? "",
      width: source.width ?? null,
      height: null,
    }))
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));

export type RawTrack = {
  uri?: string;
  name?: string;
  trackDuration?: { totalMilliseconds?: number };
  duration?: { totalMilliseconds?: number };
  artists?: { items?: { uri?: string; profile?: { name?: string } }[] };
  albumOfTrack?: {
    uri?: string;
    name?: string;
    coverArt?: { sources?: Source[] };
  };
};

export const toTrack = (raw: RawTrack) =>
  ({
    id: idOf(raw.uri),
    uri: raw.uri ?? "",
    name: raw.name ?? "",
    duration_ms:
      raw.trackDuration?.totalMilliseconds ??
      raw.duration?.totalMilliseconds ??
      0,
    artists: (raw.artists?.items ?? []).map((artist) => ({
      id: idOf(artist.uri),
      uri: artist.uri ?? "",
      name: artist.profile?.name ?? "",
    })),
    album: {
      id: idOf(raw.albumOfTrack?.uri),
      uri: raw.albumOfTrack?.uri ?? "",
      name: raw.albumOfTrack?.name ?? "",
      images: imagesOf(raw.albumOfTrack?.coverArt?.sources),
    },
  }) as unknown as SpotifyApi.TrackObjectFull;

export const fetchTrack = async (id: string) => {
  const data = await query<{ trackUnion?: RawTrack }>("getTrack", TRACK_HASH, {
    uri: `spotify:track:${id}`,
  });

  if (!data.trackUnion?.uri) throw new Error(`Track ${id} not found`);

  return toTrack(data.trackUnion);
};

/**
 * Bulk metadata for a queue: Connect decorates only the tracks nearest the
 * current one, the rest arrive as bare uris.
 */
export const fetchTracks = async (uris: string[]) => {
  const data = await query<{ decorateContextTracks?: RawTrack[] }>(
    "decorateContextTracks",
    DECORATE_HASH,
    { uris },
  );

  return (data.decorateContextTracks ?? [])
    .filter((raw) => raw?.uri)
    .map(toTrack);
};

type RawAlbum = {
  uri?: string;
  name?: string;
  date?: { isoString?: string };
  coverArt?: { sources?: Source[] };
  artists?: { items?: { uri?: string; profile?: { name?: string } }[] };
  tracksV2?: { items?: { track?: RawTrack }[] };
  tracks?: { items?: { track?: RawTrack }[] };
};

export const fetchAlbum = async (id: string) => {
  const data = await query<{ albumUnion?: RawAlbum }>("getAlbum", ALBUM_HASH, {
    uri: `spotify:album:${id}`,
    locale: "",
    offset: 0,
    limit: 50,
  });

  const raw = data.albumUnion;
  if (!raw?.uri) throw new Error(`Album ${id} not found`);

  const items = raw.tracksV2?.items ?? raw.tracks?.items ?? [];

  return {
    id,
    uri: raw.uri,
    name: raw.name ?? "",
    release_date: raw.date?.isoString?.slice(0, 10) ?? "",
    images: imagesOf(raw.coverArt?.sources),
    artists: (raw.artists?.items ?? []).map((artist) => ({
      id: idOf(artist.uri),
      uri: artist.uri ?? "",
      name: artist.profile?.name ?? "",
    })),
    tracks: {
      items: items.map((item) => toTrack({ ...item.track, albumOfTrack: raw })),
    },
  } as unknown as SpotifyApi.AlbumObjectFull;
};

type RawRelease = {
  uri?: string;
  name?: string;
  type?: string;
  coverArt?: { sources?: Source[] };
  releases?: { items?: RawRelease[] };
};

type RawArtist = {
  uri?: string;
  profile?: { name?: string; genres?: { items?: { name?: string }[] } };
  visuals?: { avatarImage?: { sources?: Source[] } };
  discography?: {
    topTracks?: { items?: { track?: RawTrack }[] };
    popularReleasesAlbums?: { items?: RawRelease[] };
    albums?: { items?: RawRelease[] };
  };
};

export const fetchArtist = async (id: string): Promise<ArtistPage> => {
  const data = await query<{ artistUnion?: RawArtist }>(
    "queryArtistOverview",
    ARTIST_HASH,
    { uri: `spotify:artist:${id}`, locale: "", includePrerelease: false },
  );

  const raw = data.artistUnion;
  if (!raw?.uri) throw new Error(`Artist ${id} not found`);

  const releases =
    raw.discography?.popularReleasesAlbums?.items ??
    raw.discography?.albums?.items ??
    [];

  return {
    artist: {
      id,
      uri: raw.uri,
      name: raw.profile?.name ?? "",
      genres: (raw.profile?.genres?.items ?? []).map(
        (genre) => genre.name ?? "",
      ),
      images: imagesOf(raw.visuals?.avatarImage?.sources),
    } as unknown as SpotifyApi.ArtistObjectFull,
    topTracks: (raw.discography?.topTracks?.items ?? []).map((item) =>
      toTrack(item.track ?? {}),
    ),
    albums: releases.map((item) => {
      // the discography nests one level deeper than the plain album list does
      const release = item.releases?.items?.[0] ?? item;

      return {
        id: idOf(release.uri),
        uri: release.uri ?? "",
        name: release.name ?? "",
        album_type: release.type?.toLowerCase() ?? "album",
        images: imagesOf(release.coverArt?.sources),
      } as unknown as SpotifyApi.AlbumObjectSimplified;
    }),
  };
};

export const inLibrary = async (uris: string[]) => {
  const data = await query<{ lookup?: { data?: { isInLibrary?: boolean } }[] }>(
    "areEntitiesInLibrary",
    IN_LIBRARY_HASH,
    { uris },
  );

  return (data.lookup ?? []).map((entry) => entry.data?.isInLibrary ?? false);
};

type RawSearch = {
  tracksV2?: { items?: { item?: { data?: RawTrack } }[] };
  artists?: {
    items?: {
      data?: {
        uri?: string;
        profile?: { name?: string };
        visuals?: { avatarImage?: { sources?: Source[] } };
      };
    }[];
  };
  albumsV2?: {
    items?: {
      data?: {
        uri?: string;
        name?: string;
        coverArt?: { sources?: Source[] };
        artists?: { items?: { uri?: string; profile?: { name?: string } }[] };
      };
    }[];
  };
  playlists?: {
    items?: {
      data?: {
        uri?: string;
        name?: string;
        images?: { items?: { sources?: Source[] }[] };
        ownerV2?: { data?: { name?: string } };
      };
    }[];
  };
};

export const searchAll = async (
  term: string,
  limit: number,
): Promise<SearchResults> => {
  const data = await query<{ searchV2?: RawSearch }>(
    "searchDesktop",
    SEARCH_HASH,
    {
      searchTerm: term,
      offset: 0,
      limit,
      numberOfTopResults: 5,
      includeAudiobooks: false,
      includePreReleases: false,
    },
    SEARCH_CHUNK,
  );

  const raw = data.searchV2 ?? {};

  return {
    tracks: (raw.tracksV2?.items ?? []).map((item) =>
      toTrack(item.item?.data ?? {}),
    ),
    artists: (raw.artists?.items ?? []).map(
      (item) =>
        ({
          id: idOf(item.data?.uri),
          uri: item.data?.uri ?? "",
          name: item.data?.profile?.name ?? "",
          images: imagesOf(item.data?.visuals?.avatarImage?.sources),
        }) as unknown as SpotifyApi.ArtistObjectFull,
    ),
    albums: (raw.albumsV2?.items ?? []).map((item) => ({
      id: idOf(item.data?.uri),
      uri: item.data?.uri ?? "",
      name: item.data?.name ?? "",
      images: imagesOf(item.data?.coverArt?.sources),
      artists: (item.data?.artists?.items ?? []).map((artist) => ({
        id: idOf(artist.uri),
        uri: artist.uri ?? "",
        name: artist.profile?.name ?? "",
      })),
    })) as unknown as SearchResults["albums"],
    playlists: (raw.playlists?.items ?? []).map(
      (item) =>
        ({
          id: idOf(item.data?.uri),
          uri: item.data?.uri ?? "",
          name: item.data?.name ?? "",
          images: (item.data?.images?.items ?? []).map((image) => ({
            url: image.sources?.[0]?.url ?? "",
          })),
          owner: { display_name: item.data?.ownerV2?.data?.name ?? "" },
        }) as unknown as SpotifyApi.PlaylistObjectSimplified,
    ),
  };
};

/**
 * Someone else's profile comes from spclient rather than the gateway: it
 * answers with the person and their public playlists in one call, where the
 * Web API needed two.
 */
export const fetchUser = async (id: string): Promise<UserPage> => {
  const response = await fetch(
    `${PROFILE_URL}/${id}?playlist_limit=50&artist_limit=0`,
    {
      headers: {
        authorization: `Bearer ${await webSession.ensureToken()}`,
        "app-platform": "WebPlayer",
      },
    },
  );

  if (!response.ok) throw new Error(`Profile ${id}: HTTP ${response.status}`);

  const data = (await response.json()) as {
    name?: string;
    image_url?: string;
    public_playlists?: {
      uri?: string;
      name?: string;
      image_url?: string;
      owner_name?: string;
    }[];
  };

  return {
    profile: {
      id,
      display_name: data.name ?? "",
      images: data.image_url ? [{ url: data.image_url }] : [],
    } as unknown as SpotifyApi.UserProfileResponse,
    playlists: (data.public_playlists ?? []).map(
      (playlist) =>
        ({
          id: idOf(playlist.uri),
          uri: playlist.uri ?? "",
          name: playlist.name ?? "",
          images: playlist.image_url ? [{ url: playlist.image_url }] : [],
          owner: { display_name: playlist.owner_name ?? "" },
        }) as unknown as SpotifyApi.PlaylistObjectSimplified,
    ),
  };
};
