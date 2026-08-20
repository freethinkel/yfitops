import { pathfinderQuery } from "./pathfinder";
import { webSession } from "$lib/modules/auth/model";

/**
 * Each pair below shares one persisted document — the player ships them under
 * a single hash and tells them apart by `operationName`, so both names go over
 * the wire with the same one.
 */
const LIBRARY_HASH =
  "1ad0d40b3c09660d818b9e770eb1e84745dfbe941df159a64f8772b6fa2bfc3a";
const PLAYLIST_HASH =
  "47b2a1234b17748d332dd0431534f22450e9ecbb3d5ddcdacbd83368636a0990";

const mutate = async (
  operationName: string,
  fallbackHash: string,
  variables: Record<string, unknown>,
) =>
  pathfinderQuery<Record<string, unknown>>({
    operationName,
    fallbackHash,
    accessToken: await webSession.ensureToken(),
    variables,
  });

/** Tracks, albums, artists and playlists are all one library here. */
export const setInLibrary = (uris: string[], saved: boolean) =>
  mutate(saved ? "addToLibrary" : "removeFromLibrary", LIBRARY_HASH, { uris });

export const addTracks = (playlistUri: string, uris: string[]) =>
  mutate("addToPlaylist", PLAYLIST_HASH, {
    uris,
    playlistUri,
    newPosition: { moveType: "BOTTOM_OF_PLAYLIST", fromUid: null },
  });

/** Removal goes by the item's uid inside the playlist, not by track uri. */
export const removeTracks = (playlistUri: string, uids: string[]) =>
  mutate("removeFromPlaylist", PLAYLIST_HASH, { playlistUri, uids });
