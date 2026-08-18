import { FastAverageColor } from "fast-average-color";

export const getAccentColorFromImage = async (url: string): Promise<string> => {
  if (!url) {
    return "transparent";
  }

  const color = await new FastAverageColor().getColorAsync(url, {
    algorithm: "sqrt",
  });

  return color.hex;
};
