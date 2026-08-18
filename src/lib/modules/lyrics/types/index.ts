export type LyricsLine = {
  startMs: number;
  text: string;
};

export type Lyrics = {
  /** false — plain text: every line's startMs is 0. */
  synced: boolean;
  lines: LyricsLine[];
};
