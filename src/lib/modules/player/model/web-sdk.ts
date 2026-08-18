export const loadWebSdk = () =>
  new Promise<void>((resolve, reject) => {
    if (document.getElementById("spotify-player")) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.id = "spotify-player";
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Spotify Web SDK"));
    document.head.appendChild(script);
  });
