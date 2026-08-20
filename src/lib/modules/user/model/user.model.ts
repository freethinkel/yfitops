import { atom, onMount } from "nanostores";
import { webSession } from "$lib/modules/auth/model";
import { fetchProfile } from "$lib/shared/api/library";
import { fetchUser } from "$lib/shared/api/catalog";

export const $userData = atom<SpotifyApi.CurrentUsersProfileResponse | null>(
  null,
);

onMount($userData, () =>
  webSession.whenAuthorized(async () => {
    if ($userData.get()) return;
    $userData.set(await fetchProfile());
  }),
);

export type UserPage = {
  profile: SpotifyApi.UserProfileResponse;
  playlists: SpotifyApi.PlaylistObjectSimplified[];
};

// ponytail: cached for the session, profiles change about as often as never
const cache = new Map<string, ReturnType<typeof atom<UserPage | null>>>();

/** Someone else's public profile: who they are and what they share. */
export const user = (id: string) => {
  const hit = cache.get(id);
  if (hit) return hit;

  const $user = atom<UserPage | null>(null);

  onMount($user, () =>
    webSession.whenAuthorized(async () => {
      if ($user.get()) return;

      $user.set(await fetchUser(id));
    }),
  );

  cache.set(id, $user);
  return $user;
};
