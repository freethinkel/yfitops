import { atom } from "nanostores";

export const $lastError = atom<string | null>(null);

const VISIBLE_MS = 6000;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Everything here used to be a bare console.error inside a click handler, so a
 * failed request looked exactly like a click the app had ignored. The console
 * still gets the whole thing; the store carries one line to the toast.
 */
export const reportError = (scope: string, err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);

  console.error(`${scope}:`, err);
  $lastError.set(`${scope}: ${message}`);

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => $lastError.set(null), VISIBLE_MS);
};

export const dismissError = () => {
  if (timer) clearTimeout(timer);
  $lastError.set(null);
};
