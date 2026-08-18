import { atom } from "nanostores";

const MIME = "application/x-yfitops-track";

/** True while a track is in flight, so drop targets can show what accepts it. */
export const $dragging = atom(false);

/**
 * The default drag image is a screenshot of the whole row, table columns and
 * all. This is a small pill instead — built in the DOM because setDragImage
 * only accepts a rendered node.
 */
const previewOf = (track: SpotifyApi.TrackObjectFull) => {
  const node = document.createElement("div");
  node.style.cssText = `
    position: fixed;
    top: -1000px;
    left: -1000px;
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 260px;
    padding: 6px 10px 6px 6px;
    border-radius: 999px;
    background: var(--color-background);
    box-shadow: var(--shadow-1);
    color: var(--color-text);
    font: 500 0.85rem system-ui, sans-serif;
    white-space: nowrap;
  `;

  const cover = document.createElement("img");
  cover.src = track.album.images.at(-1)?.url ?? "";
  cover.style.cssText = "width: 28px; height: 28px; border-radius: 50%; object-fit: cover;";

  const text = document.createElement("span");
  text.textContent = track.name;
  text.style.cssText = "overflow: hidden; text-overflow: ellipsis;";

  node.append(cover, text);
  document.body.append(node);

  return node;
};

export const startTrackDrag = (
  event: DragEvent,
  track: SpotifyApi.TrackObjectFull,
) => {
  event.dataTransfer?.setData(MIME, JSON.stringify(track));
  // plain text so the track is also droppable outside the app
  event.dataTransfer?.setData("text/plain", track.external_urls.spotify);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";

  const preview = previewOf(track);
  event.dataTransfer?.setDragImage(preview, 20, 20);
  // the browser snapshots it synchronously, so it can go on the next frame
  requestAnimationFrame(() => preview.remove());

  $dragging.set(true);
  addEventListener("dragend", () => $dragging.set(false), { once: true });
};

export const isTrackDrag = (event: DragEvent) =>
  event.dataTransfer?.types.includes(MIME) ?? false;

export const droppedTrack = (event: DragEvent) => {
  const raw = event.dataTransfer?.getData(MIME);
  return raw ? (JSON.parse(raw) as SpotifyApi.TrackObjectFull) : null;
};
