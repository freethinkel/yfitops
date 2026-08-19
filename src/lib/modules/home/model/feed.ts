import type { FeedItem, FeedSection } from "../types";

type Label = { transformedLabel?: string | null } | null;

type RawItem = {
  content?: {
    __typename?: string;
    data?: {
      __typename?: string;
      uri?: string;
      name?: string;
      description?: string;
      profile?: { name?: string };
      images?: { items?: { sources?: { url?: string }[] }[] };
      coverArt?: { sources?: { url?: string }[] };
      visuals?: { avatarImage?: { sources?: { url?: string }[] } };
      artists?: { items?: { profile?: { name?: string } }[] };
    };
  };
};

type RawSection = {
  data?: { __typename?: string; title?: Label; subtitle?: Label };
  sectionItems?: { items?: RawItem[] };
};

export type HomeResponse = {
  home?: {
    greeting?: Label;
    sectionContainer?: { sections?: { items?: RawSection[] } };
  };
};

const KINDS = new Set(["Playlist", "Album", "Artist"]);

const imageOf = (data: NonNullable<RawItem["content"]>["data"]) =>
  data?.images?.items?.[0]?.sources?.[0]?.url ??
  data?.coverArt?.sources?.[0]?.url ??
  data?.visuals?.avatarImage?.sources?.[0]?.url ??
  "";

const subtitleOf = (data: NonNullable<RawItem["content"]>["data"]) => {
  if (data?.__typename === "Artist") return "Artist";

  const artists = data?.artists?.items
    ?.map((artist) => artist.profile?.name)
    .filter(Boolean);

  return artists?.length ? artists.join(", ") : (data?.description ?? "");
};

const toItem = (raw: RawItem): FeedItem | null => {
  const data = raw.content?.data;
  if (!data?.uri || !data.name || !KINDS.has(data.__typename ?? ""))
    return null;

  return {
    uri: data.uri,
    name: data.name,
    subtitle: subtitleOf(data),
    image: imageOf(data),
    round: data.__typename === "Artist",
  };
};

/**
 * The tail of the feed is an endless stream of one-item "baseline" sections —
 * fine for infinite scroll, noise for a row of shelves.
 */
const isShelf = (section: RawSection) =>
  section.data?.__typename !== "HomeFeedBaselineSectionData";

export const parseHome = (response: HomeResponse) => {
  const sections = response.home?.sectionContainer?.sections?.items ?? [];

  const shelves: FeedSection[] = [];

  for (const section of sections) {
    if (!isShelf(section)) continue;

    const title = section.data?.title?.transformedLabel ?? "";
    const items = (section.sectionItems?.items ?? [])
      .map(toItem)
      .filter((item): item is FeedItem => item !== null);

    if (title && items.length) shelves.push({ title, items });
  }

  return {
    greeting: response.home?.greeting?.transformedLabel ?? "",
    sections: shelves,
  };
};
