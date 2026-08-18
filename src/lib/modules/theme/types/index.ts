export type Palette = {
  accent: string;
  background: string;
  text: string;
  error: string;
};

export type Theme = {
  id: string;
  name: string;
  light: Palette;
  dark: Palette;
};
