import { persistentAtom } from "@nanostores/persistent";

const number = {
  encode: String,
  decode: (raw: string) => Number(raw),
};

const boolean = {
  encode: String,
  decode: (raw: string) => raw === "true",
};

export const $sidebarWidth = persistentAtom("sidebar_width", 200, number);
export const $detailsWidth = persistentAtom("details_width", 300, number);
export const $detailsOpen = persistentAtom("details_open", false, boolean);

export type DetailsView = "now-playing" | "queue" | "friends";
export const $detailsView = persistentAtom<DetailsView>(
  "details_view",
  "now-playing",
);

export const setSidebarWidth = (width: number) => $sidebarWidth.set(width);
export const setDetailsWidth = (width: number) => $detailsWidth.set(width);

export const openDetails = () => $detailsOpen.set(true);
export const closeDetails = () => $detailsOpen.set(false);
export const toggleDetails = () => $detailsOpen.set(!$detailsOpen.get());

/** Opens the panel on a view, or closes it if that view is already up. */
export const showDetails = (view: DetailsView) => {
  if ($detailsOpen.get() && $detailsView.get() === view) return closeDetails();

  $detailsView.set(view);
  openDetails();
};
