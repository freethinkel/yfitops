// The Web Playback SDK plays inside a cross-origin iframe, so the system's
// Now Playing entry is that document's — "Spotify Embedded", with seek keys
// instead of track keys. This runs in every frame, and inside the SDK's one it
// takes the entry over: our metadata, and the track keys relayed up.
(() => {
  if (window.top === window || !navigator.mediaSession) return;

  const session = navigator.mediaSession;

  const send = (key) =>
    window.parent.postMessage({ yfitops: "media-key", key }, "*");

  const claim = () => {
    try {
      session.setActionHandler("nexttrack", () => send("next"));
      session.setActionHandler("previoustrack", () => send("previous"));
      // the SDK claims these, and the system then draws ±15s over the track keys
      session.setActionHandler("seekbackward", null);
      session.setActionHandler("seekforward", null);
    } catch {}
  };

  // the SDK writes its own metadata whenever a track starts; once ours has
  // arrived it wins, otherwise the entry falls back to "Spotify Embedded"
  let ours = null;

  try {
    const property = Object.getOwnPropertyDescriptor(
      MediaSession.prototype,
      "metadata",
    );

    Object.defineProperty(session, "metadata", {
      get: () => property.get.call(session),
      set: (value) => property.set.call(session, ours ?? value),
    });
  } catch {}

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.yfitops !== "now-playing") return;

    ours = new MediaMetadata({
      title: data.title,
      artist: data.artist,
      album: data.album,
      artwork: data.cover ? [{ src: data.cover, sizes: "640x640" }] : [],
    });

    session.metadata = ours;
    claim();
  });

  claim();
})();
