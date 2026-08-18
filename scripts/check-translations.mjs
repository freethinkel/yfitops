// Drift between messages.ts and the JSON files is silent — a missing key just
// falls back to English. This is the only thing that catches it.
import { readFileSync, readdirSync } from "node:fs";

const DIR = "src/lib/modules/i18n/translations";
const src = readFileSync("src/lib/modules/i18n/messages.ts", "utf8");

const base = Object.fromEntries(
  [...src.matchAll(/i18n\("(\w+)", \{(.*?)\n\}\);/gs)].map(([, ns, body]) => [
    ns,
    Object.fromEntries(
      [...body.matchAll(/^ {2}(\w+):\s*(count\()?/gm)].map(([, key, plural]) => [
        key,
        !!plural,
      ]),
    ),
  ]),
);

let failed = false;
const fail = (message) => ((failed = true), console.error(message));

for (const file of readdirSync(DIR).filter((name) => name.endsWith(".json"))) {
  const locale = file.replace(".json", "");
  const json = JSON.parse(readFileSync(`${DIR}/${file}`, "utf8"));
  const forms = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;

  for (const [ns, keys] of Object.entries(base)) {
    for (const [key, isPlural] of Object.entries(keys)) {
      const value = json[ns]?.[key];
      if (value === undefined) fail(`${locale}: missing ${ns}.${key}`);
      else if (isPlural) {
        const missing = forms.filter((form) => !(form in value));
        if (missing.length) fail(`${locale}: ${ns}.${key} lacks ${missing}`);
      }
    }
    for (const key of Object.keys(json[ns] ?? {})) {
      if (!(key in keys)) fail(`${locale}: stale ${ns}.${key}`);
    }
  }
  for (const ns of Object.keys(json)) {
    if (!(ns in base)) fail(`${locale}: stale namespace ${ns}`);
  }
}

console.log(failed ? "translations: DRIFT" : "translations: ok");
process.exit(failed ? 1 : 0);
