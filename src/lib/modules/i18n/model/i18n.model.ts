import {
  browser,
  createI18n,
  localeFrom,
  type ComponentsJSON,
} from "@nanostores/i18n";
import { persistentAtom } from "@nanostores/persistent";

export const LOCALES = [
  { id: "en", name: "English" },
  { id: "de", name: "Deutsch" },
  { id: "el", name: "Ελληνικά" },
  { id: "es", name: "Español" },
  { id: "fr", name: "Français" },
  { id: "ko", name: "한국어" },
  { id: "ru", name: "Русский" },
] as const;

const AVAILABLE = LOCALES.map(({ id }) => id);

/** Undefined means "follow the system", which is what a fresh install wants. */
export const $localeSetting = persistentAtom<string | undefined>(
  "locale",
  undefined,
);

export const $locale = localeFrom(
  $localeSetting,
  browser({ available: AVAILABLE, fallback: "en" }),
);

/**
 * English lives in the code as the base translation, so only the other
 * locales need a file — bundled, not fetched, since there is no server.
 */
const translations: Record<string, () => Promise<ComponentsJSON>> = {
  de: () =>
    import("../translations/de.json").then((m) => m.default as ComponentsJSON),
  el: () =>
    import("../translations/el.json").then((m) => m.default as ComponentsJSON),
  es: () =>
    import("../translations/es.json").then((m) => m.default as ComponentsJSON),
  fr: () =>
    import("../translations/fr.json").then((m) => m.default as ComponentsJSON),
  ko: () =>
    import("../translations/ko.json").then((m) => m.default as ComponentsJSON),
  ru: () =>
    import("../translations/ru.json").then((m) => m.default as ComponentsJSON),
};

export const i18n = createI18n($locale, {
  get: (code) => translations[code]?.() ?? Promise.resolve({}),
});

export const selectLocale = (id: string) => $localeSetting.set(id);
