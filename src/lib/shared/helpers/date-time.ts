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
