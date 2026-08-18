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
