import type { Theme } from "../types";

/** Ported from the Flutter app's "base" theme. */
export const THEMES: Record<"light" | "dark", Theme> = {
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
};

export const BORDER_RADIUS = "6px";
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
export const themeToStyles = (theme: Theme) =>
  `:root {
    --color-accent-100: ${theme.accent};
    --color-accent-20: ${alpha(theme.accent, 0.2)};
    --color-accent-10: ${alpha(theme.accent, 0.1)};
    --color-background-100: ${theme.background};
    --color-background-20: ${alpha(theme.background, 0.2)};
    --color-text-100: ${theme.text};
    --color-text-80: ${alpha(theme.text, 0.8)};
    --color-text-60: ${alpha(theme.text, 0.6)};
    --color-surface-100: ${theme.text};
    --color-surface-80: ${alpha(theme.text, 0.8)};
    --color-surface-20: ${alpha(theme.text, 0.12)};
    --color-surface-10: ${alpha(theme.text, 0.04)};
    --color-error: ${theme.error};

    --border-radius: ${BORDER_RADIUS};
    --transition: ${TRANSITION};
    --shadow-1: ${SHADOW_1};
  }`;
