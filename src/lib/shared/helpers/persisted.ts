import type { WritableAtom } from "nanostores";

const PREFIX = "yfitops:";

/**
 * localStorage holds ~5MB in total. A single oversized entry (liked songs run
 * to megabytes) used to blow the quota on every write, and the eviction that
 * followed took every other entry with it — playlists included. Anything this
 * big simply is not cached.
 */
const MAX_BYTES = 1_000_000;

export const forget = (key: string) => localStorage.removeItem(PREFIX + key);

/**
 * Stale-while-revalidate: the store starts with whatever the last session
 * left in localStorage, so the app paints instantly, and the usual fetch
 * still runs and overwrites it.
 */
export const persisted = <T>($store: WritableAtom<T>, key: string) => {
  const storageKey = PREFIX + key;
  const cached = localStorage.getItem(storageKey);

  if (cached && !$store.get()) {
    try {
      $store.set(JSON.parse(cached) as T);
    } catch {
      localStorage.removeItem(storageKey);
    }
  }

  return $store.listen((value) => {
    if (value == null) return;

    const json = JSON.stringify(value);

    if (json.length > MAX_BYTES) {
      localStorage.removeItem(storageKey);
      return;
    }

    try {
      localStorage.setItem(storageKey, json);
    } catch {
      // over quota — drop this one entry, never the neighbours
      localStorage.removeItem(storageKey);
    }
  });
};
