import { pathfinderQuery } from "./pathfinder";
import { toTrack, type RawTrack } from "./catalog";
import { webSession } from "$lib/modules/auth/model";

const PROFILE_HASH =
  "08ffb4730af3746e04a8301396f20875dbbce10c75243803091a9274eacc8ac0";
const LIBRARY_HASH =
  "390c78e5b951029bad359785e69b07b536a509c581cbcd0aded5e5067f187455";
const LIKED_HASH =
  "087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240";

/** One page instead of the Web API's thirteen — the gateway takes far more at once. */
const LIKED_PAGE = 500;
const PLAYLIST_PAGE = 200;

const idOf = (uri = "") => uri.split(":").pop() ?? "";

const query = async <T>(
  operationName: string,
  fallbackHash: string,
  variables: Record<string, unknown>,
) =>
  pathfinderQuery<T>({
    operationName,
    fallbackHash,
    accessToken: await webSession.ensureToken(),
    variables,
  });

type RawProfile = {
  me?: {
    profile?: {
      username?: string;
      name?: string;
      avatar?: { sources?: { url?: string }[] };
    };
  };
};

export const fetchProfile = async () => {
  const data = await query<RawProfile>("profileAttributes", PROFILE_HASH, {});
  const profile = data.me?.profile;

  return {
    id: profile?.username ?? "",
    display_name: profile?.name ?? "",
    images: (profile?.avatar?.sources ?? []).map((source) => ({
      url: source.url ?? "",
    })),
  } as unknown as SpotifyApi.CurrentUsersProfileResponse;
};

type RawLibraryEntry = {
  item?: {
    data?: {
      __typename?: string;
      uri?: string;
      name?: string;
      images?: { items?: { sources?: { url?: string }[] }[] };
      ownerV2?: { data?: { name?: string; username?: string } };
    };
  };
};

export const fetchPlaylists = async () => {
  const data = await query<{
    me?: { libraryV3?: { items?: RawLibraryEntry[] } };
  }>("libraryV3", LIBRARY_HASH, {
    filters: ["Playlists"],
    order: null,
    textFilter: "",
    features: [],
    limit: PLAYLIST_PAGE,
    offset: 0,
    flatten: true,
    expandedFolders: [],
    folderUri: null,
    includeFoldersWhenFlattening: true,
  });

  const playlists: SpotifyApi.PlaylistObjectSimplified[] = [];

  for (const entry of data.me?.libraryV3?.items ?? []) {
    const item = entry.item?.data;
    if (item?.__typename !== "Playlist" || !item.uri) continue;

    playlists.push({
      id: idOf(item.uri),
      uri: item.uri,
      name: item.name ?? "",
      collaborative: false,
      images: (item.images?.items ?? []).map((image) => ({
        url: image.sources?.[0]?.url ?? "",
      })),
      owner: {
        id: item.ownerV2?.data?.username ?? "",
        display_name: item.ownerV2?.data?.name ?? "",
      },
    } as unknown as SpotifyApi.PlaylistObjectSimplified);
  }

  return playlists;
};

/** The track sits one level down, and only the wrapper carries its uri. */
type RawLikedEntry = {
  addedAt?: { isoString?: string };
  track?: { _uri?: string; data?: RawTrack };
};

export const fetchLikedTracks = async () => {
  const collected: SpotifyApi.SavedTrackObject[] = [];

  for (let offset = 0; ; offset += LIKED_PAGE) {
    const data = await query<{
      me?: { library?: { tracks?: { items?: RawLikedEntry[] } } };
    }>("fetchLibraryTracks", LIKED_HASH, { offset, limit: LIKED_PAGE });

    const items = data.me?.library?.tracks?.items ?? [];

    for (const entry of items) {
      const raw = entry.track?.data;
      const uri = entry.track?._uri;

      if (!raw?.name || !uri) continue;

      collected.push({
        added_at: entry.addedAt?.isoString ?? "",
        track: toTrack({ ...raw, uri }),
      } as unknown as SpotifyApi.SavedTrackObject);
    }

    if (items.length < LIKED_PAGE) break;
  }

  return collected;
};
