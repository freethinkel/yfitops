import { SCOPES, SPOTIFY_CLIENT_ID } from "$lib/config/spotify";
import { spotifyApi } from "$lib/shared/api/spotify";
import { createSession } from "./session";

const session = createSession({
  storageKey: "tokens",
  clientId: SPOTIFY_CLIENT_ID,
  requiredScopes: SCOPES,
  onTokens: (tokens) => spotifyApi.setAccessToken(tokens.accessToken),
});

export const {
  ensureToken,
  $tokens,
  $isAuthorized,
  $isPending,
  $error,
  $accessToken,
  login,
  logout,
  whenAuthorized,
} = session;
