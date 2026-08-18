import type { WritableAtom } from "nanostores";

const PREFIX = "yfitops:";

const purge = () => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  }
};

/**
 * Stale-while-revalidate: the store starts with whatever the last session
 * left in localStorage, so the app paints instantly, and the usual fetch
 * still runs and overwrites it.
 */
export const forget = (key: string) => localStorage.removeItem(PREFIX + key);

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

    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // ponytail: over quota — wipe the whole cache and retry once; every
      // entry refills from the network anyway, so this is a coarse eviction
      purge();

      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
  });
};
