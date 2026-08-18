import { atom, computed, onMount } from "nanostores";
import { THEMES, themeToStyles } from "./themes";
import type { Theme } from "../types";

const darkMedia = window.matchMedia("(prefers-color-scheme: dark)");

export const $theme = atom<Theme>(darkMedia.matches ? THEMES.dark : THEMES.light);
export const $themeStyles = computed($theme, themeToStyles);

export const setTheme = (theme: Theme) => $theme.set(theme);

onMount($theme, () => {
  const onChange = (event: MediaQueryListEvent) =>
    setTheme(event.matches ? THEMES.dark : THEMES.light);

  darkMedia.addEventListener("change", onChange);
  return () => darkMedia.removeEventListener("change", onChange);
});
