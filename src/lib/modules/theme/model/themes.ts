import type { Theme } from "../types";

/** Ported from the Flutter app, same ids and palettes. */
export const THEMES: Theme[] = [
  {
    id: "base",
    name: "Base",
    light: {
      accent: "#00D560",
      background: "#FFF",
      text: "#100F13",
      error: "#FF6868",
    },
    dark: {
      accent: "#00D560",
      background: "#000",
      text: "#F4EBDF",
      error: "#FF6868",
    },
  },
  {
    id: "blackout",
    name: "Blackout",
    light: {
      accent: "#100F13",
      background: "#FFFFFF",
      text: "#323232",
      error: "#FF6868",
    },
    dark: {
      accent: "#D9D9D9",
      background: "#000000",
      text: "#FFFFFF",
      error: "#FF6868",
    },
  },
  {
    id: "nord",
    name: "Nord 🌊",
    light: {
      accent: "#5E81AC",
      background: "#EFF1F5",
      text: "#3B4252",
      error: "#FA826C",
    },
    dark: {
      accent: "#88C0D0",
      background: "#2E3440",
      text: "#BABDC3",
      error: "#BF616A",
    },
  },
  {
    id: "catppuccin",
    name: "Catppuccin",
    light: {
      accent: "#8839EF",
      background: "#EFF1F5",
      text: "#5D5F77",
      error: "#E64554",
    },
    dark: {
      accent: "#D7C6E5",
      background: "#303446",
      text: "#F3E3C8",
      error: "#E78284",
    },
  },
  {
    id: "synthwave_disco",
    name: "Synthwave",
    light: {
      accent: "#86316F",
      background: "#D1CCF4",
      text: "#035C47",
      error: "#B24172",
    },
    dark: {
      accent: "#EB76CC",
      background: "#252335",
      text: "#3DFFD2",
      error: "#B24172",
    },
  },
  {
    id: "sky",
    name: "Sky",
    light: {
      accent: "#013CFE",
      background: "#FFFFFF",
      text: "#000000",
      error: "#FF6868",
    },
    dark: {
      accent: "#F7E5B9",
      background: "#25262D",
      text: "#FFFFFF",
      error: "#FF6868",
    },
  },
];

export const DEFAULT_THEME = THEMES[0];

/**
 * Only the four real colors are emitted. Everything derived from them — muted
 * text, dividers, surfaces — is a relative oklch of those, declared once in
 * common.css instead of being spelled out per theme.
 */
export const paletteToStyles = (palette: Theme["light"]) =>
  `--color-accent: ${palette.accent};
   --color-background: ${palette.background};
   --color-text: ${palette.text};
   --color-error: ${palette.error};`;

/** Both palettes ship at once so the OS setting switches them without a redraw. */
export const themeToStyles = (theme: Theme) =>
  `:root { ${paletteToStyles(theme.light)} }

   @media (prefers-color-scheme: dark) {
     :root { ${paletteToStyles(theme.dark)} }
   }`;
