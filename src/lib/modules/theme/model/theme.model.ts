import { atom, computed } from "nanostores";
import { DEFAULT_THEME, THEMES, themeToStyles } from "./themes";

const STORAGE_KEY = "selected_theme_id";

/** Only the id is stored — palettes live in the code anyway. */
const $themeId = atom(localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME.id);

export const $themes = atom(THEMES);
export const $theme = computed(
  $themeId,
  (id) => THEMES.find((theme) => theme.id === id) ?? DEFAULT_THEME,
);
export const $themeStyles = computed($theme, themeToStyles);

export const selectTheme = (id: string) => {
  $themeId.set(id);
  localStorage.setItem(STORAGE_KEY, id);
};
