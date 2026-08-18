import { atom, onMount } from "nanostores";
import { authModel } from "$lib/modules/auth/model";
import { spotifyApi } from "$lib/shared/api/spotify";

export const $userData = atom<SpotifyApi.CurrentUsersProfileResponse | null>(null);

onMount($userData, () =>
  authModel.whenAuthorized(async () => {
    if ($userData.get()) return;
    $userData.set(await spotifyApi.getMe());
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
    authModel.whenAuthorized(async () => {
      if ($user.get()) return;

      const [profile, playlists] = await Promise.all([
        spotifyApi.getUser(id),
        spotifyApi.getUserPlaylists(id, { limit: 50 }),
      ]);

      $user.set({ profile, playlists: [...playlists.items] });
    }),
  );

  cache.set(id, $user);
  return $user;
};
