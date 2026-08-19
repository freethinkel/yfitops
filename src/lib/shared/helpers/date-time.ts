export const formatDuration = (ms: number) => {
  return [
    Math.floor(ms / 1000 / 60)
      .toString()
      .padStart(2, "0"),
    Math.floor((ms / 1000) % 60)
      .toString()
      .padStart(2, "0"),
  ].join(":");
};

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export const formatDate = (iso: string) => dateFormat.format(new Date(iso));

const relativeFormat = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "5 minutes ago" — anything fresher than a minute reads as "now". */
export const formatRelative = (timestamp: number) => {
  const diff = Date.now() - timestamp;

  for (const [unit, ms] of UNITS) {
    if (diff >= ms) return relativeFormat.format(-Math.floor(diff / ms), unit);
  }

  return relativeFormat.format(0, "minute");
};
