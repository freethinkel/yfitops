import { fetch } from "@tauri-apps/plugin-http";

/**
 * Friend activity — what the desktop client shows in its right rail. The Web
 * API has no endpoint for it; this is the internal presence service, so it
 * needs the internal session's token, same as lyrics and the home feed.
 */
const URL = "https://spclient.wg.spotify.com/presence-view/v1/buddylist";

type RawFriend = {
  timestamp?: number;
  user?: { uri?: string; name?: string; imageUrl?: string };
  track?: {
    uri?: string;
    name?: string;
    imageUrl?: string;
    album?: { uri?: string; name?: string };
    artist?: { uri?: string; name?: string };
    context?: { uri?: string; name?: string };
  };
};

export type Friend = {
  id: string;
  name: string;
  avatar: string;
  playedAt: number;
  cover: string;
  track: string;
  /** The album behind the track — where clicking the title goes. */
  albumUri: string;
  artist: string;
  artistUri: string;
  /** The playlist or album they play from; empty when Spotify gives none. */
  context: string;
  contextUri: string;
};

const toFriend = (raw: RawFriend): Friend | null => {
  const id = raw.user?.uri?.split(":").pop();
  if (!id || !raw.track?.name) return null;

  return {
    id,
    name: raw.user?.name ?? "",
    avatar: raw.user?.imageUrl ?? "",
    playedAt: raw.timestamp ?? 0,
    cover: raw.track.imageUrl ?? "",
    track: raw.track.name,
    albumUri: raw.track.album?.uri ?? "",
    artist: raw.track.artist?.name ?? "",
    artistUri: raw.track.artist?.uri ?? "",
    context: raw.track.context?.name ?? "",
    contextUri: raw.track.context?.uri ?? "",
  };
};

export const fetchBuddyList = async (
  accessToken: string,
): Promise<Friend[]> => {
  const response = await fetch(URL, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      "app-platform": "WebPlayer",
    },
  });

  // the body is where this endpoint says what it disliked — a bare status
  // leaves nothing to act on
  if (!response.ok) {
    throw new Error(
      `Buddy list: HTTP ${response.status} ${await response.text()}`.trim(),
    );
  }

  const data = (await response.json()) as { friends?: RawFriend[] };

  return (data.friends ?? [])
    .map(toFriend)
    .filter((friend): friend is Friend => friend !== null)
    .sort((a, b) => b.playedAt - a.playedAt);
};
