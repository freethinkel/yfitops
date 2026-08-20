import { fetch } from "@tauri-apps/plugin-http";

/**
 * Spotify Connect's own control channel — the one first-party clients use.
 * The Web API can only append to the queue; this can reorder, insert and drop,
 * and the queue stays server-side, so other devices see the same thing.
 */
const BASE = "https://spclient.wg.spotify.com/connect-state/v1";

/**
 * A device ignores commands it appears to have sent itself, so the sender id
 * must differ from the target. Any value is accepted — it is never resolved.
 */
const SENDER_ID = "a1b2c3d4".repeat(5);

export type QueueEntry = {
  uri: string;
  uid?: string;
  metadata?: Record<string, string>;
};

export type PlayerState = {
  queue_revision: string;
  next_tracks?: QueueEntry[];
  prev_tracks?: QueueEntry[];
  track?: QueueEntry;
  is_playing?: boolean;
  is_paused?: boolean;
  /** Milliseconds, as strings — the gateway sends its numbers that way. */
  position_as_of_timestamp?: string;
  duration?: string;
};

export type Cluster = {
  active_device_id?: string;
  player_state?: PlayerState;
};

const headers = (accessToken: string) => ({
  authorization: `Bearer ${accessToken}`,
  "app-platform": "WebPlayer",
});

/** Connect explains a refusal in the body; the status alone rarely narrows it. */
const failed = async (what: string, response: Response) =>
  new Error(`${what}: HTTP ${response.status} ${await response.text()}`.trim());

export const getCluster = async (accessToken: string): Promise<Cluster> => {
  const response = await fetch(`${BASE}/cluster`, {
    headers: headers(accessToken),
  });

  if (!response.ok) throw await failed("Cluster", response);

  return response.json();
};

/**
 * Every player command travels the same way — this is also what starts
 * playback and sets shuffle, so the Web API is not needed for any of it.
 */
export const command = async ({
  accessToken,
  deviceId,
  endpoint,
  payload = {},
}: {
  accessToken: string;
  deviceId: string;
  endpoint: string;
  payload?: Record<string, unknown>;
}) => {
  const response = await fetch(
    `${BASE}/player/command/from/${SENDER_ID}/to/${deviceId}`,
    {
      method: "POST",
      headers: { ...headers(accessToken), "content-type": "application/json" },
      body: JSON.stringify({ command: { endpoint, ...payload } }),
    },
  );

  if (!response.ok) throw await failed(endpoint, response);
};

/**
 * Replaces the queue wholesale. `queue_revision` guards against overwriting a
 * change made elsewhere, so it has to come from a fresh cluster read.
 */
export const setQueue = ({
  accessToken,
  deviceId,
  nextTracks,
  prevTracks,
  revision,
}: {
  accessToken: string;
  deviceId: string;
  nextTracks: QueueEntry[];
  prevTracks: QueueEntry[];
  revision: string;
}) =>
  command({
    accessToken,
    deviceId,
    endpoint: "set_queue",
    payload: {
      next_tracks: nextTracks,
      prev_tracks: prevTracks,
      queue_revision: revision,
    },
  });
