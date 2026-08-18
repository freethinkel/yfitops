const KINDS = ["playlist", "album", "artist", "track"] as const;

type Kind = (typeof KINDS)[number];

const isKind = (value: string): value is Kind =>
  (KINDS as readonly string[]).includes(value);

/**
 * Understands both forms Spotify hands out: the `spotify:album:id` uri and the
 * open.spotify.com link, which may carry a locale segment (`/intl-de/album/id`).
 */
export const parseSpotifyLink = (href: string) => {
  if (!href) return null;

  if (href.startsWith("spotify:")) {
    const [, kind, id] = href.split(":");
    return isKind(kind) && id ? { kind, id } : null;
  }

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (url.hostname !== "open.spotify.com") return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0]?.startsWith("intl-")) parts.shift();

  const [kind, id] = parts;
  return isKind(kind) && id ? { kind, id } : null;
};

/** In-app route for a Spotify link, or null when we have no page for it. */
export const routeForLink = (href: string) => {
  const link = parseSpotifyLink(href);
  if (!link) return null;

  // tracks have no page of their own — the album stands in for them
  return link.kind === "track" ? null : `/app/${link.kind}/${link.id}`;
};
