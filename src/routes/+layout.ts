// Tauri has no Node.js server for SSR, so the app runs as a static SPA.
// See: https://v2.tauri.app/start/frontend/sveltekit/
export const ssr = false;

import "$lib/styles/common.css";
import { devtoolsModel } from "$lib/modules/app/model";

// In dev the webview's own menu is left alone — it carries Inspect Element.
// In release it is replaced rather than merely suppressed, so the console stays
// reachable without the app feeling like a web page.
if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (event) => {
    void devtoolsModel.contextMenu(event);
  });
}
