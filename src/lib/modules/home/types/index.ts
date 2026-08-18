export type FeedItem = {
  uri: string;
  name: string;
  subtitle: string;
  image: string;
  round: boolean;
};

export type FeedSection = {
  title: string;
  items: FeedItem[];
};
