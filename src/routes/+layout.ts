// Tauri has no Node.js server for SSR, so the app runs as a static SPA.
// See: https://v2.tauri.app/start/frontend/sveltekit/
export const ssr = false;

import "$lib/styles/common.css";

if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (event) => event.preventDefault());
}
