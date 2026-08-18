import type { Theme } from "../types";

/** Ported from the Flutter app, same ids and palettes. */
export const THEMES: Theme[] = [
  {
    id: "base",
    name: "Base",
    light: {
      accent: "#00D560",
      background: "#F4EBDF",
      text: "#100F13",
      error: "#FF6868",
    },
    dark: {
      accent: "#00D560",
      background: "#100F13",
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
    id: "matrix",
    name: "Matrix",
    // dark on both sides, exactly as in the Flutter theme
    light: {
      accent: "#5BC746",
      background: "#010600",
      text: "#40E740",
      error: "#337027",
    },
    dark: {
      accent: "#5BC746",
      background: "#010600",
      text: "#40E740",
      error: "#337027",
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

export const BORDER_RADIUS = "10px";
export const TRANSITION = "0.1s ease-in-out";

/**
 * Three stacked layers instead of one: a tight contact shadow, a soft middle
 * and a wide ambient one.
 */
export const SHADOW_1 = [
  "0 1px 2px rgba(0, 0, 0, 0.028)",
  "0 3.4px 6.7px rgba(0, 0, 0, 0.042)",
  "0 15px 30px rgba(0, 0, 0, 0.07)",
].join(", ");

// ponytail: alpha variants via color-mix instead of a color lib
const alpha = (color: string, amount: number) =>
  `color-mix(in srgb, ${color} ${amount * 100}%, transparent)`;

/**
 * Surface and border have no fields of their own: a divider and a muted caption
 * are the text color, only quieter.
 */
export const paletteToStyles = (palette: Theme["light"]) =>
  `--color-accent-100: ${palette.accent};
   --color-accent-20: ${alpha(palette.accent, 0.2)};
   --color-accent-10: ${alpha(palette.accent, 0.1)};
   --color-background-100: ${palette.background};
   --color-background-20: ${alpha(palette.background, 0.2)};
   --color-text-100: ${palette.text};
   --color-text-80: ${alpha(palette.text, 0.8)};
   --color-text-60: ${alpha(palette.text, 0.6)};
   --color-surface-100: ${palette.text};
   --color-surface-80: ${alpha(palette.text, 0.8)};
   --color-surface-20: ${alpha(palette.text, 0.12)};
   --color-surface-10: ${alpha(palette.text, 0.04)};
   --color-error: ${palette.error};

   --border-radius: ${BORDER_RADIUS};
   --transition: ${TRANSITION};
   --shadow-1: ${SHADOW_1};`;

/** Both palettes ship at once so the OS setting switches them without a redraw. */
export const themeToStyles = (theme: Theme) =>
  `:root { ${paletteToStyles(theme.light)} }

   @media (prefers-color-scheme: dark) {
     :root { ${paletteToStyles(theme.dark)} }
   }`;
