import DOMPurify from "dompurify";

/**
 * Playlist descriptions come as HTML — Spotify puts artist and playlist links
 * in them. They are user-written, and this webview can reach the Tauri API, so
 * everything but a couple of inline tags is stripped.
 */
const ALLOWED_TAGS = ["a", "b", "i", "em", "strong", "br", "span"];

export const sanitizeDescription = (html: string) =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href"],
    // spotify: links are handled in-app; the rest may only be plain web links
    ALLOWED_URI_REGEXP: /^(?:https?:|spotify:)/i,
  });
