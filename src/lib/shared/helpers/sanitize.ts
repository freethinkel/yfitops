import DOMPurify from "dompurify";

/**
 * Playlist descriptions come as HTML — Spotify puts artist and playlist links
 * in them. They are user-written, and this webview can reach the Tauri API, so
 * everything but a couple of inline tags is stripped.
 */
const ALLOWED_TAGS = ["a", "b", "i", "em", "strong", "br", "span"];

/**
 * `links: false` keeps the text of an anchor and drops the anchor — a card is
 * one big button, and a link inside it would nest one interactive element in
 * another and fire both on a click.
 */
export const sanitizeDescription = (html: string, links = true) =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS: links
      ? ALLOWED_TAGS
      : ALLOWED_TAGS.filter((tag) => tag !== "a"),
    ALLOWED_ATTR: ["href"],
    // spotify: links are handled in-app; the rest may only be plain web links
    ALLOWED_URI_REGEXP: /^(?:https?:|spotify:)/i,
  });
