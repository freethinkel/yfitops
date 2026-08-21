// Tauri has no Node.js server for SSR, so the app runs as a static SPA.
// See: https://v2.tauri.app/start/frontend/sveltekit/
export const ssr = false;

import "$lib/styles/common.css";

// In dev the webview's own menu is left alone — it carries Inspect Element. In
// release it is suppressed, so the app stops feeling like a web page; the
// console is in the Help menu.
if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (event) => event.preventDefault());
}
