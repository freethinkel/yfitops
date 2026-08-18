/**
 * librespot's public client — its dashboard already registers the redirect
 * below, so no app of your own is needed. Its Web API quota is shared by every
 * librespot user though (search and likes hit 429), which an own client id in
 * `SPT_CLIENT_ID` lifts. Such an app must register the very same redirect URI.
 */
export const LIBRESPOT_CLIENT_ID = "65b708073fc0480ea92a077233ca87bd";

export const SPOTIFY_CLIENT_ID =
  import.meta.env.SPT_CLIENT_ID || LIBRESPOT_CLIENT_ID;

/** Belongs to the client id above — an own app must register its own value. */
export const REDIRECT_URI =
  import.meta.env.SPT_REDIRECT_URI || "http://127.0.0.1:8898/login";

export const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
  "user-library-modify",
  "user-top-read",
  "user-read-recently-played",
  "playlist-modify-private",
  "playlist-modify-public",
];
