import { LIBRESPOT_CLIENT_ID } from "$lib/config/spotify";
import { createSession } from "./session";

/**
 * Session on librespot's client id, for Spotify's internal backends: their
 * RBAC turns down tokens of apps registered in the developer dashboard. Feeds
 * lyrics and the pathfinder home feed; the Web API keeps using the app's own
 * session, which has a rate limit of its own.
 */
export const internalSession = createSession({
  // Kept from when lyrics were the only user, so existing tokens still load.
  storageKey: "lyrics_tokens",
  clientId: LIBRESPOT_CLIENT_ID,
});
