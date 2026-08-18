import { Image } from "@tauri-apps/api/image";

/** Menu icons are tiny; 32px covers retina and keeps the decode cheap. */
const SIZE = 32;

// ponytail: cached for the session — covers change about as often as playlists do
const cache = new Map<string, Promise<Image | null>>();

const render = async (url: string): Promise<Image | null> => {
  try {
    const source = new window.Image();
    source.crossOrigin = "anonymous";
    source.src = url;
    await source.decode();

    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;

    const context = canvas.getContext("2d");
    if (!context) return null;

    // slight rounding, the same idea as the covers elsewhere in the app
    context.beginPath();
    context.roundRect(0, 0, SIZE, SIZE, SIZE / 6);
    context.clip();
    context.drawImage(source, 0, 0, SIZE, SIZE);
    const { data } = context.getImageData(0, 0, SIZE, SIZE);

    // getImageData hands back a Uint8ClampedArray, which the IPC layer does not
    // recognise as binary — it has to go over as a plain Uint8Array.
    return await Image.new(new Uint8Array(data.buffer), SIZE, SIZE);
  } catch (err) {
    console.error("menu icon:", url, err);
    return null;
  }
};

/** Cover art as a native menu icon; null when it cannot be loaded. */
export const menuIcon = (url: string) => {
  if (!url) return Promise.resolve(null);

  const hit = cache.get(url);
  if (hit) return hit;

  const pending = render(url);
  cache.set(url, pending);
  return pending;
};
