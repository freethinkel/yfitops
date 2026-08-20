import { atom, onMount } from "nanostores";
import { webSession } from "$lib/modules/auth/model";
import { fetchBuddyList, type Friend } from "$lib/shared/api/buddylist";
import { persisted } from "$lib/shared/helpers/persisted";

export const $friends = atom<Friend[] | null>(null);
export const $isPending = atom(false);
export const $error = atom<string | null>(null);

export const $isEnabled = webSession.$isAuthorized;
export const enable = webSession.login;

/** Presence moves on the scale of a track, so once a minute is plenty. */
const REFRESH_MS = 60_000;

const load = async () => {
  if ($isPending.get()) return;

  $isPending.set(true);
  $error.set(null);

  try {
    $friends.set(await fetchBuddyList(await webSession.ensureToken()));
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
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let started = false;

  // a fixed interval keeps hammering a service that is already refusing, so
  // each failure in a row doubles the wait and the first success resets it
  const tick = async () => {
    await load();
    failures = $error.get() ? Math.min(failures + 1, 4) : 0;
    timer = setTimeout(tick, REFRESH_MS * 2 ** failures);
  };

  const stop = webSession.$isAuthorized.subscribe((authorized) => {
    if (!authorized || started) return;

    started = true;
    tick();
  });

  return () => {
    if (timer) clearTimeout(timer);
    unbind();
    stop();
  };
});

export const reload = load;
export type { Friend };
