import { atom, onMount } from "nanostores";
import { internalSession } from "$lib/modules/auth/model";
import { fetchBuddyList, type Friend } from "$lib/shared/api/buddylist";
import { persisted } from "$lib/shared/helpers/persisted";

export const $friends = atom<Friend[] | null>(null);
export const $isPending = atom(false);
export const $error = atom<string | null>(null);

export const $isEnabled = internalSession.$isAuthorized;
export const enable = internalSession.login;

/** Presence moves on the scale of a track, so once a minute is plenty. */
const REFRESH_MS = 60_000;

const load = async () => {
  if ($isPending.get()) return;

  $isPending.set(true);
  $error.set(null);

  try {
    $friends.set(await fetchBuddyList(internalSession.$accessToken.get()));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("friends:", message);
    $error.set(message);
  } finally {
    $isPending.set(false);
  }
};

onMount($friends, () => {
  const unbind = persisted($friends, "friends");
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = internalSession.$isAuthorized.subscribe((authorized) => {
    if (!authorized) return;

    load();
    timer ??= setInterval(load, REFRESH_MS);
  });

  return () => {
    if (timer) clearInterval(timer);
    unbind();
    stop();
  };
});

export const reload = load;
export type { Friend };
