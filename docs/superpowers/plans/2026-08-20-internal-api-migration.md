# Переезд на внутренний API веб-плеера

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Убрать `api.spotify.com` из приложения полностью — все чтения и записи идут через pathfinder GraphQL и spclient, авторизация через cookie `sp_dc` + TOTP, как у веб-плеера.

**Architecture:** Один транспорт (`pathfinder.ts`) обслуживает и запросы, и мутации. Хеши persisted-запросов и TOTP-секреты вытаскиваются одним проходом по бандлу веб-плеера и кэшируются вместе; протухание любого из них чинится одним обновлением. Токен добывается из `sp_dc`, который читается из webview после логина. Публичный Web API и `spotify-web-api-js` удаляются.

**Tech Stack:** SvelteKit SPA + Tauri 2 (`tauri-plugin-http`), nanostores, TypeScript. Криптография — `crypto.subtle` (HMAC-SHA1 есть нативно, зависимости не нужны).

**Spec:** этот документ (раздел «Исходные данные» ниже) — отдельной спеки нет, решения приняты в сессии аудита квоты от 2026-08-20.

## Исходные данные

Что даёт аудит (числа — расход публичной квоты за 30-секундное окно):

- Холодный старт: **17 запросов** (`getMe` 1, `getUserPlaylists` 1, `getMySavedTracks` 13, `getMyCurrentPlaybackState` + `transferMyPlayback` 2).
- Страница артиста: **4** (`getArtist`, `getArtistTopTracks`, `getArtistAlbums`, `isFollowingArtists`).
- Поиск: 1 запрос на каждый ввод с debounce 300 мс.
- Всего 29 точек выхода на `api.spotify.com` в 21 месте кода.

Что проверено в бандле `web-player.418e6173.js` (4.6 МБ) 2026-08-20:

- 104 persisted-операции в main-бандле, формат `.l("<name>","query"|"mutation","<sha256>")`. Регексп из текущего `fetchHash` работает.
- `searchDesktop` в main-бандле **отсутствует** — он в lazy-чанке `xpui-routes-search` (id 4406). Main-бандл содержит обе карты: `id → имя чанка` и `id → content hash`; URL чанка собирается как `https://open.spotifycdn.com/cdn/build/web-player/<имя>.<hash>.js`.
- TOTP-секреты лежат в main-бандле массивом, новейший первый:
  ```js
  [{secret:',7/*F("rLJ2oxaKL^f+E1xvP@N',version:61},
   {secret:'OmE{ZA.J^":0FG\\Uz?[@WW',version:60},
   {secret:"{iOFn;4}<1PFYKPV?5{%u14]M>/V0hDH",version:59}]
  ```
  Преобразование секрета в ключ HMAC (из бандла дословно): `chars.map((ch,i) => ch.charCodeAt(0) ^ (i % 33 + 9))` → `join("")` → `Buffer.from(_, "utf8").toString("hex")` → `Secret.fromHex(_)`. Hex-кодирование и обратный разбор взаимно сокращаются, поэтому **ключ = UTF-8 байты строки `join("")`**.
- Параметры OTP: `SHA1`, `digits: 6`, `period: 30`, счётчик `floor(timestamp/1000/30)`.
- Время берётся с сервера: `GET https://open.spotify.com/api/server-time` → `{ serverTime: <секунды> }`, таймаут 4 с, при неудаче — локальное время.
- В бандле есть фича-флаг `enableTOTPVersionValidation` (по умолчанию выключен) — сервер умеет сверять версию секрета; поля ответа `totpVerExpired` / `totpValidUntil` сообщают о протухании.
- `addToLibrary` и `removeFromLibrary` делят один хеш `1ad0d40b3c09660d818b9e770eb1e84745dfbe941df159a64f8772b6fa2bfc3a`; `addToPlaylist` и `removeFromPlaylist` — один `47b2a1234b17748d332dd0431534f22450e9ecbb3d5ddcdacbd83368636a0990`. Один документ обслуживает пару, различие идёт по `operationName`.

Хеши, снятые с этого бандла (стартовые `fallbackHash`):

| Операция | Хеш |
|---|---|
| `profileAttributes` | `08ffb4730af3746e04a8301396f20875dbbce10c75243803091a9274eacc8ac0` |
| `libraryV3` | `390c78e5b951029bad359785e69b07b536a509c581cbcd0aded5e5067f187455` |
| `fetchLibraryTracks` | `087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240` |
| `getAlbum` | `b9bfabef66ed756e5e13f68a942deb60bd4125ec1f1be8cc42769dc0259b4b10` |
| `queryArtistOverview` | `ae0e2958a4ab645b35ca19ac04d0495ae12d9c5d7b7286217674801a9aab281a` |
| `fetchPlaylist` | `86dde7b9d9356e2369414647cf6950cfed96e778e129cfdfc99aea6c1613b3b0` |
| `areEntitiesInLibrary` | `134337999233cc6fdd6b1e6dbf94841409f04a946c5c7b744b09ba0dfe5a85ed` |
| `getTrack` | `1a2f0cce77c90a4a5b1730beecc4da7e34290d684324c16663bf09a268ebce48` |
| `decorateContextTracks` | `383de00240775c39a6afe0b1055dc562b2a3930894201f9762f3fc32a74971c7` |
| `addToLibrary` / `removeFromLibrary` | `1ad0d40b3c09660d818b9e770eb1e84745dfbe941df159a64f8772b6fa2bfc3a` |
| `addToPlaylist` / `removeFromPlaylist` | `47b2a1234b17748d332dd0431534f22450e9ecbb3d5ddcdacbd83368636a0990` |
| `searchDesktop` | добывается из чанка в Task 2 |

## Global Constraints

- В проекте **нет тестового фреймворка** и он не заводится. Проверка каждой задачи — `scripts/probe.mjs` (создаётся в Task 2) против живого gateway, плюс `npm run check` и `npm run lint`. Это осознанно: предмет задачи — сетевой протокол чужого сервиса, мок проверял бы только собственные выдумки.
- Формы GraphQL-переменных в бандле не лежат (persisted-запросы передают только хеш). В плане они даны как стартовые; **первый шаг каждой задачи миграции — прогнать пробник и зафиксировать реальную форму**. Ответ `"Variable \"$x\" of required type ... was not provided"` называет недостающее поле прямо в тексте — это и есть механизм уточнения.
- Все запросы к внутренним хостам идут через `fetch` из `@tauri-apps/plugin-http` (CORS отсутствует). Глобальный `fetch` webview — только для `open.spotify.com`, откуда нужны cookie.
- Заголовки внутренних запросов сохраняются из текущего `pathfinder.ts`: `app-platform: WebPlayer`, `spotify-app-version`, `origin`/`referer` `https://open.spotify.com`, `user-agent` десктопного Chrome.
- Комментарии в коде — по существующему стилю проекта: объясняют «почему», а не «что». Не комментировать очевидное.
- Каждая задача заканчивается коммитом.

---

### Task 1: Один проход по бандлу за хешами и секретами

Сейчас `fetchHash` качает страницу и бандл (4.6 МБ) **на каждую операцию**. После миграции операций станет ~20, и выход нового релиза плеера означал бы 20 скачиваний подряд. Один проход складывает всё разом.

**Files:**
- Modify: `src/lib/shared/api/pathfinder.ts:117-166` (замена `readHashes`/`writeHash`/`fetchHash`)

**Interfaces:**
- Produces: `bundleMeta(): Promise<BundleMeta>`, `refreshBundleMeta(): Promise<BundleMeta>`, тип `BundleMeta = { hashes: Record<string,string>; secrets: { secret: string; version: number }[]; chunks: Record<string,string>; version: string }`

- [ ] **Step 1: Заменить хранилище хешей на общий кэш метаданных бандла**

В `src/lib/shared/api/pathfinder.ts` выкинуть `HASHES_KEY`, `readHashes`, `writeHash`, `fetchHash` целиком и поставить на их место:

```ts
const META_KEY = "web-player-meta";

export type BundleMeta = {
  hashes: Record<string, string>;
  secrets: { secret: string; version: number }[];
  /** id чанка → часть имени файла, например 4406 → "xpui-routes-search" */
  chunks: Record<string, string>;
  /** id чанка → content hash */
  chunkHashes: Record<string, string>;
  version: string;
};

const readMeta = (): BundleMeta | null => {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? "null");
  } catch {
    return null;
  }
};

const parseBundle = (source: string): Omit<BundleMeta, "version"> => {
  const hashes: Record<string, string> = {};
  for (const [, name, hash] of source.matchAll(
    /\.l\("([a-zA-Z0-9_]+)","(?:query|mutation)","([0-9a-f]{64})"/g,
  )) {
    hashes[name] = hash;
  }

  // новейший секрет идёт первым — плеер сам берёт нулевой элемент
  const block = source.match(
    /\[\{secret:(?:'[^']*'|"(?:[^"\\]|\\.)*"),version:\d+\}(?:,\{secret:(?:'[^']*'|"(?:[^"\\]|\\.)*"),version:\d+\})*\]/,
  );

  const secrets = [
    ...(block?.[0] ?? "").matchAll(
      /\{secret:('[^']*'|"(?:[^"\\]|\\.)*"),version:(\d+)\}/g,
    ),
  ].map(([, raw, version]) => ({
    secret: JSON.parse(
      raw.startsWith("'") ? JSON.stringify(raw.slice(1, -1)) : raw,
    ) as string,
    version: Number(version),
  }));

  const mapOf = (re: RegExp) => {
    const found = source.match(re)?.[1] ?? "";
    return Object.fromEntries(
      [...found.matchAll(/"?(\d+)"?:"([^"]+)"/g)].map(([, id, value]) => [
        id,
        value,
      ]),
    );
  };

  return {
    hashes,
    secrets,
    chunks: mapOf(/\.u=e=>""\+\(\{([^}]+)\}/),
    chunkHashes: mapOf(/\)\[e\]\|\|e\)\+"\."\+\(?\{([^}]+)\}/),
  };
};
```

- [ ] **Step 2: Загрузка бандла одним проходом**

Ниже в том же файле, вместо старого `fetchHash`:

```ts
let loading: Promise<BundleMeta> | null = null;

export const refreshBundleMeta = (): Promise<BundleMeta> => {
  loading ??= (async () => {
    try {
      const page = await request("web player page", WEB_PLAYER_URL, {
        headers: { "user-agent": USER_AGENT },
      });
      const html = await page.text();

      const url = html.match(
        /https:\/\/open\.spotifycdn\.com\/cdn\/build\/web-player\/web-player\.[\w-]+\.js/,
      )?.[0];

      if (!url) throw new Error("Web player bundle not found");

      const bundle = await request(
        "web player bundle",
        url,
        { headers: { "user-agent": USER_AGENT } },
        BUNDLE_TIMEOUT,
      );

      const meta: BundleMeta = {
        ...parseBundle(await bundle.text()),
        version: url.split(".").at(-2) ?? "",
      };

      if (!Object.keys(meta.hashes).length) {
        throw new Error("No persisted queries in the bundle");
      }

      localStorage.setItem(META_KEY, JSON.stringify(meta));
      return meta;
    } finally {
      loading = null;
    }
  })();

  return loading;
};

export const bundleMeta = async (): Promise<BundleMeta> =>
  readMeta() ?? (await refreshBundleMeta());
```

`loading` здесь — не украшение: протухший хеш обычно ломает несколько запросов сразу, и без него они скачали бы бандл параллельно, каждый по 4.6 МБ.

- [ ] **Step 3: Догрузка операций из lazy-чанков**

`searchDesktop` в main-бандле нет. Дописать туда же:

```ts
const CDN = "https://open.spotifycdn.com/cdn/build/web-player";

/**
 * Часть операций живёт в чанках, которые плеер подгружает по маршруту. Main
 * несёт обе карты — id → имя и id → content hash, — так что нужный чанк
 * собирается по имени, без обхода всех остальных.
 */
export const fetchFromChunk = async (chunk: string, operationName: string) => {
  const meta = await bundleMeta();
  const id = Object.keys(meta.chunks).find((key) => meta.chunks[key] === chunk);
  const hash = id && meta.chunkHashes[id];

  if (!id || !hash) throw new Error(`No chunk ${chunk} in the bundle`);

  const response = await request(
    `chunk ${chunk}`,
    `${CDN}/${chunk}.${hash}.js`,
    { headers: { "user-agent": USER_AGENT } },
    BUNDLE_TIMEOUT,
  );

  const found = (await response.text()).match(
    new RegExp(`\\.l\\("${operationName}","(?:query|mutation)","([0-9a-f]{64})"`),
  )?.[1];

  if (!found) throw new Error(`No persisted hash for ${operationName}`);

  const meta2 = (await bundleMeta()) as BundleMeta;
  meta2.hashes[operationName] = found;
  localStorage.setItem(META_KEY, JSON.stringify(meta2));

  return found;
};
```

- [ ] **Step 4: Переключить `pathfinderQuery` на новый кэш**

В `pathfinderQuery` заменить строку `return await send(readHashes()[operationName] ?? fallbackHash)` и ветку ретрая:

```ts
  const meta = await bundleMeta();

  try {
    return await send(meta.hashes[operationName] ?? fallbackHash);
  } catch (err) {
    if (!(err as { stale?: boolean }).stale) throw err;

    const fresh = await refreshBundleMeta();
    const hash =
      fresh.hashes[operationName] ??
      (chunk ? await fetchFromChunk(chunk, operationName) : null);

    if (!hash) throw err;

    return send(hash);
  }
```

и добавить `chunk?: string` в тип `Query`.

- [ ] **Step 5: Проверка**

```bash
npm run check && npm run lint
```

Ожидается: без ошибок. Затем `npm run tauri dev`, открыть главную — лента грузится как раньше (это регрессия на существующем пути `home`), в `localStorage` появился ключ `web-player-meta` с ~104 ключами в `hashes` и тремя элементами в `secrets`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/api/pathfinder.ts
git commit -m "Fetch every persisted hash in one pass over the bundle"
```

---

### Task 2: Пробник

Инструмент, без которого остальные задачи придётся делать вслепую: шлёт произвольную операцию с произвольными переменными и печатает ответ.

**Files:**
- Create: `scripts/probe.mjs`
- Modify: `package.json` (скрипт `probe`)

**Interfaces:**
- Produces: `node scripts/probe.mjs <operationName> '<json-variables>'`, токен берётся из переменной окружения `SPOTIFY_TOKEN`

- [ ] **Step 1: Написать пробник**

`scripts/probe.mjs`:

```js
// Отладочный инструмент: гоняет одну операцию против настоящего gateway и
// печатает ответ. Нужен потому, что формы переменных persisted-запросов нигде
// не опубликованы — их выясняют по тексту ошибки.
const [, , operationName, rawVariables = "{}"] = process.argv;

const token = process.env.SPOTIFY_TOKEN;
if (!operationName || !token) {
  console.error("usage: SPOTIFY_TOKEN=... node scripts/probe.mjs <op> '<vars>'");
  process.exit(1);
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const VERSION = "1.2.98.104.ga2fc9a0c-development";

const clientToken = await fetch("https://clienttoken.spotify.com/v1/clienttoken", {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({
    client_data: {
      client_version: VERSION,
      client_id: "d8a5ed958d274c2e8ee717e6a4b0971d",
      js_sdk_data: {
        device_brand: "Apple",
        device_model: "unknown",
        os: "macos",
        os_version: "10.15.7",
        device_id: "00000000-0000-4000-8000-000000000000",
        device_type: "computer",
      },
    },
  }),
})
  .then((res) => res.json())
  .then((data) => data.granted_token.token);

const hash = process.env.SPOTIFY_HASH;
if (!hash) {
  console.error("set SPOTIFY_HASH to the persisted hash of the operation");
  process.exit(1);
}

const response = await fetch("https://api-partner.spotify.com/pathfinder/v2/query", {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "client-token": clientToken,
    "content-type": "application/json;charset=UTF-8",
    "app-platform": "WebPlayer",
    "spotify-app-version": VERSION,
    "accept-language": "en",
    origin: "https://open.spotify.com",
    referer: "https://open.spotify.com/",
    "user-agent": USER_AGENT,
  },
  body: JSON.stringify({
    operationName,
    variables: JSON.parse(rawVariables),
    extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
  }),
});

console.log(JSON.stringify(await response.json(), null, 2).slice(0, 4000));
```

- [ ] **Step 2: Записать в package.json**

В `"scripts"` добавить строку после `"check:i18n"`:

```json
    "probe": "node scripts/probe.mjs",
```

- [ ] **Step 3: Прогнать против живого gateway**

Токен на первый раз взять из работающего приложения: `npm run tauri dev`, в консоли webview `JSON.parse(localStorage.lyrics_tokens).accessToken`.

```bash
SPOTIFY_TOKEN=<token> \
SPOTIFY_HASH=08ffb4730af3746e04a8301396f20875dbbce10c75243803091a9274eacc8ac0 \
npm run probe -- profileAttributes '{}'
```

Ожидается: JSON с `data.me.profile` — имя, uri, аватар. Если вместо этого `errors[0].message` про недостающую переменную, добавить названное поле и повторить.

- [ ] **Step 4: Снять хеш `searchDesktop`**

```bash
SPOTIFY_TOKEN=<token> npm run probe -- searchDesktop '{}'
```

Хеша нет — сначала достать его из чанка. Разово, вручную:

```bash
curl -s -A "Mozilla/5.0" https://open.spotify.com/ \
  | grep -oE 'web-player\.[a-z0-9]+\.js' | head -1
```

Дальше скачать main-бандл, вытащить из карт `4406` (`xpui-routes-search`) его content hash, скачать `xpui-routes-search.<hash>.js` и найти в нём `.l("searchDesktop","query","<sha256>"`. Полученный хеш записать в план ниже и в `search.model.ts` как `fallbackHash` в Task 8.

- [ ] **Step 5: Commit**

```bash
git add scripts/probe.mjs package.json
git commit -m "Add a probe for pathfinder operations"
```

---

### Task 3: TOTP

**Files:**
- Create: `src/lib/shared/api/totp.ts`

**Interfaces:**
- Produces: `totp(): Promise<{ code: string; version: number; serverTime: number }>`

- [ ] **Step 1: Написать генератор**

`src/lib/shared/api/totp.ts`:

```ts
import { fetch } from "@tauri-apps/plugin-http";
import { bundleMeta } from "./pathfinder";

/**
 * Токен веб-плеера выдаётся только вместе с одноразовым кодом. Секрет для него
 * лежит в бандле плеера в обфусцированном виде и версионируется — сервер умеет
 * отвергать устаревшие версии, поэтому он читается оттуда же, откуда хеши
 * запросов, а не хранится константой.
 */
const SERVER_TIME_URL = "https://open.spotify.com/api/server-time";
const PERIOD = 30;
const DIGITS = 6;

/** Из бандла дословно: XOR по позиции, склейка, и вышедшие байты — ключ HMAC. */
const keyOf = (secret: string) =>
  new TextEncoder().encode(
    [...secret].map((ch, i) => ch.charCodeAt(0) ^ ((i % 33) + 9)).join(""),
  );

const serverTime = async () => {
  try {
    const response = await fetch(SERVER_TIME_URL, {
      headers: { referer: "https://open.spotify.com/" },
      connectTimeout: 4_000,
    });

    const seconds = Number((await response.json())?.serverTime);
    if (seconds && !Number.isNaN(seconds)) return seconds;
  } catch {
    // сеть подвела — местные часы обычно достаточно близки
  }

  return Math.floor(Date.now() / 1000);
};

const hotp = async (key: Uint8Array, counter: number) => {
  const secret = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );

  const message = new DataView(new ArrayBuffer(8));
  message.setBigUint64(0, BigInt(counter));

  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", secret, message.buffer),
  );

  const offset = mac[mac.length - 1] & 0x0f;
  const value =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];

  return String(value % 10 ** DIGITS).padStart(DIGITS, "0");
};

export const totp = async () => {
  const { secrets } = await bundleMeta();
  const newest = secrets[0];

  if (!newest) throw new Error("No TOTP secret in the bundle");

  const seconds = await serverTime();

  return {
    code: await hotp(keyOf(newest.secret), Math.floor(seconds / PERIOD)),
    version: newest.version,
    serverTime: seconds,
  };
};
```

- [ ] **Step 2: Проверка**

```bash
npm run check && npm run lint
```

Полноценно код проверяется в следующей задаче — там он либо выдаёт токен, либо получает `Invalid TOTP`. Промежуточная проверка сейчас: `npm run tauri dev`, в консоли webview

```js
(await import("/src/lib/shared/api/totp.ts")).totp()
```

Ожидается объект вида `{ code: "482913", version: 61, serverTime: 1787... }` — шесть цифр и версия, совпадающая с первым элементом `secrets` в `localStorage.web-player-meta`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/api/totp.ts
git commit -m "Generate the web player's one-time code"
```

---

### Task 4: Чтение cookie из webview

**Files:**
- Modify: `src-tauri/src/lib.rs` (регистрация команды)
- Create: `src-tauri/src/cookies.rs`

**Interfaces:**
- Produces: команда `spotify_cookie` → `Option<String>` со значением `sp_dc`

- [ ] **Step 1: Найти, где регистрируются команды**

```bash
grep -n "invoke_handler\|generate_handler\|create_auth_window" src-tauri/src/*.rs
```

Запомнить имя файла и список в `generate_handler![...]` — команда добавляется туда же, где живёт `create_auth_window`.

- [ ] **Step 2: Написать команду**

`src-tauri/src/cookies.rs`:

```rust
use tauri::{WebviewWindow, Manager};

/// Внутренние сервисы Spotify принимают токен, который веб-плеер получает по
/// cookie `sp_dc`. Она ставится на webview при логине, а достать её оттуда
/// умеет только Rust — в JS этот домен чужой.
#[tauri::command]
pub async fn spotify_cookie(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let webview: WebviewWindow = app
        .get_webview_window("main")
        .ok_or_else(|| "no main window".to_string())?;

    let cookies = webview
        .cookies_for_url("https://open.spotify.com".parse().map_err(|_| "bad url")?)
        .map_err(|err| err.to_string())?;

    Ok(cookies
        .into_iter()
        .find(|cookie| cookie.name() == "sp_dc")
        .map(|cookie| cookie.value().to_string()))
}
```

`cookies_for_url` появился в Tauri 2 (PR tauri-apps/tauri#12665). Если сборка ругается на отсутствие метода — поднять `tauri` в `src-tauri/Cargo.toml` до последней 2.x и повторить.

- [ ] **Step 3: Подключить**

В `src-tauri/src/lib.rs` добавить `mod cookies;` рядом с остальными модулями и `cookies::spotify_cookie` в список `generate_handler![...]`.

- [ ] **Step 4: Проверка**

```bash
npm run tauri dev
```

Войти в аккаунт обычным способом. Затем в консоли webview:

```js
await window.__TAURI__.core.invoke("spotify_cookie")
```

Ожидается длинная строка (сотни символов). Если `null` — логин прошёл в отдельном окне `oauth_window`, и cookie осела на нём; тогда в команде брать окно по метке `oauth_window`, а вызывать её до закрытия окна, в обработчике `change_navigation_url` в `session.ts:105`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cookies.rs src-tauri/src/lib.rs
git commit -m "Read the web player cookie out of the webview"
```

---

### Task 5: Сессия веб-плеера

**Files:**
- Create: `src/lib/modules/auth/model/web-session.ts`
- Modify: `src/lib/modules/auth/model/index.ts`

**Interfaces:**
- Consumes: `totp()` из Task 3, команда `spotify_cookie` из Task 4
- Produces: `webSession` с полями `ensureToken(): Promise<string>`, `$isAuthorized`, `$error`, `login()`, `logout()`, `whenAuthorized(load)` — та же поверхность, что у `createSession`, чтобы потребители не переписывались

- [ ] **Step 1: Написать сессию**

`src/lib/modules/auth/model/web-session.ts`:

```ts
import { atom, onMount } from "nanostores";
import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import { totp } from "$lib/shared/api/totp";
import { refreshBundleMeta } from "$lib/shared/api/pathfinder";

/**
 * Сессия ровно та же, что у веб-плеера: cookie `sp_dc` в обмен на часовой
 * токен. Своего client id здесь нет вовсе — ни публичной квоты Web API, ни
 * зависимости от чужого приложения.
 */
const TOKEN_URL = "https://open.spotify.com/api/token";
const EARLY_MS = 60_000;

type Token = { accessToken: string; expiresAt: number };

let token: Token | null = null;
let inflight: Promise<string> | null = null;

export const $isAuthorized = atom(false);
export const $error = atom<string | null>(null);

const cookie = () => invoke<string | null>("spotify_cookie");

const request = async (reason: "init" | "transport"): Promise<Token> => {
  const sp_dc = await cookie();
  if (!sp_dc) throw new Error("Не вижу cookie входа — войди заново");

  const { code, version } = await totp();

  const query = new URLSearchParams({
    reason,
    productType: "web-player",
    totp: code,
    totpServer: code,
    totpVer: String(version),
  });

  const response = await fetch(`${TOKEN_URL}?${query}`, {
    headers: {
      accept: "application/json",
      referer: "https://open.spotify.com/",
      "app-platform": "WebPlayer",
      cookie: `sp_dc=${sp_dc}`,
    },
  });

  const data = await response.json();

  if (!data?.accessToken) {
    throw new Error(`Токен не выдан: ${data?.message ?? response.status}`);
  }

  return {
    accessToken: data.accessToken,
    expiresAt: Number(data.accessTokenExpirationTimestampMs) || Date.now() + 3_600_000,
  };
};

export const ensureToken = (): Promise<string> => {
  if (token && token.expiresAt - EARLY_MS > Date.now()) {
    return Promise.resolve(token.accessToken);
  }

  inflight ??= request(token ? "transport" : "init")
    .catch(async (err) => {
      // протухший секрет отличается от протухшего входа только текстом ответа,
      // и первый чинится сам — бандл перечитывается и код считается заново
      if (!/totp/i.test(String(err))) throw err;

      await refreshBundleMeta();
      return request("init");
    })
    .then((fresh) => {
      token = fresh;
      $isAuthorized.set(true);
      $error.set(null);
      return fresh.accessToken;
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      $error.set(message);
      $isAuthorized.set(false);
      console.error("web session:", message);
      return "";
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
};

export const logout = () => {
  token = null;
  $isAuthorized.set(false);
};

onMount($isAuthorized, () => {
  ensureToken();
});

/** Тот же контракт, что у `createSession`, чтобы сторы не переписывать. */
export const whenAuthorized = (load: () => void | Promise<void>) => {
  let loaded = false;

  return $isAuthorized.subscribe(async (authorized) => {
    if (!authorized || loaded) return;
    loaded = true;

    try {
      await load();
    } catch (err) {
      loaded = false;
      $error.set(err instanceof Error ? err.message : String(err));
    }
  });
};
```

Логина здесь нет: cookie ставит существующее окно авторизации. `login` остаётся у старой сессии до Task 11.

- [ ] **Step 2: Экспортировать**

В `src/lib/modules/auth/model/index.ts` добавить:

```ts
export * as webSession from "./web-session";
```

- [ ] **Step 3: Проверка**

```bash
npm run check && npm run lint && npm run tauri dev
```

В консоли webview:

```js
await (await import("/src/lib/modules/auth/model/web-session.ts")).ensureToken()
```

Ожидается строка токена, начинающаяся с `BQ`. `Invalid TOTP` в ответе означает, что версия секрета отвергнута — проверить, что `totpVer` совпадает с первым элементом `secrets`, и что время взято с `/api/server-time`, а не локальное.

- [ ] **Step 4: Проверить, что токен принимается gateway**

```bash
SPOTIFY_TOKEN=<полученный токен> \
SPOTIFY_HASH=08ffb4730af3746e04a8301396f20875dbbce10c75243803091a9274eacc8ac0 \
npm run probe -- profileAttributes '{}'
```

Ожидается тот же профиль, что в Task 2 Step 3.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/auth/model/web-session.ts src/lib/modules/auth/model/index.ts
git commit -m "Take the token the way the web player takes it"
```

---

### Task 6: Перевести существующие внутренние вызовы на новую сессию

Лирика, лента, друзья и Connect уже ходят на внутренние хосты, но с токеном librespot. Переключение до миграции чтений — чтобы дальше был один источник токена.

**Files:**
- Modify: `src/lib/modules/lyrics/model/lyrics.model.ts:17`
- Modify: `src/lib/modules/home/model/home.model.ts:25-36`
- Modify: `src/lib/modules/friends/model/friends.model.ts:10-23`
- Modify: `src/lib/modules/player/model/player.model.ts:290`
- Modify: `src/lib/modules/playlist/model/internal-playlist.ts:70`

**Interfaces:**
- Consumes: `webSession` из Task 5

- [ ] **Step 1: Лирика**

В `lyrics.model.ts` заменить `import { internalSession } from "$lib/modules/auth/model"` на `webSession` и строку 17:

```ts
const session = webSession;
```

Остальное в файле обращается через `session`, менять больше нечего.

- [ ] **Step 2: Лента**

В `home.model.ts` заменить три обращения:

```ts
export const $isEnabled = webSession.$isAuthorized;
export const enable = () => webSession.ensureToken();
```

и в `load()` — `accessToken: await webSession.ensureToken()`. Подписку на строке 99 переставить на `webSession.$isAuthorized`.

- [ ] **Step 3: Друзья**

В `friends.model.ts` — `$isEnabled`/`enable` так же, и в `load()`:

```ts
    $friends.set(await fetchBuddyList(await webSession.ensureToken()));
```

Заодно закрыть находку аудита: опрос раз в минуту не должен молотить вслепую при сбое. В `onMount` заменить фиксированный интервал на удлиняющийся при ошибках:

```ts
  let failures = 0;

  const tick = async () => {
    await load();
    failures = $error.get() ? Math.min(failures + 1, 4) : 0;
    timer = setTimeout(tick, REFRESH_MS * 2 ** failures);
  };
```

с `let timer: ReturnType<typeof setTimeout> | null = null` и `clearTimeout` в возвращаемой функции.

- [ ] **Step 4: Очередь и внутренний плейлист**

В `player.model.ts:290` заменить тело `token`:

```ts
const token = () => webSession.ensureToken();
```

В `internal-playlist.ts:70` — `accessToken: await webSession.ensureToken()`.

- [ ] **Step 5: Проверка**

```bash
npm run check && npm run lint && npm run tauri dev
```

Ожидается: лента на главной, лирика на играющем треке, список друзей в правой панели, очередь в панели — всё как до изменения. В `localStorage` ключ `lyrics_tokens` больше не читается (проверить, что удаление ключа ничего не ломает).

- [ ] **Step 6: Commit**

```bash
git add src/lib/modules/lyrics src/lib/modules/home src/lib/modules/friends src/lib/modules/player/model/player.model.ts src/lib/modules/playlist/model/internal-playlist.ts
git commit -m "Serve every internal call from the web player session"
```

---

### Task 7: Профиль и библиотека

Убирает 2 из 17 запросов холодного старта и всю постраничную выгрузку любимых (13 запросов).

**Files:**
- Create: `src/lib/shared/api/library.ts`
- Modify: `src/lib/modules/user/model/user.model.ts:9-14`
- Modify: `src/lib/modules/playlist/model/playlist.model.ts:37-92`

**Interfaces:**
- Consumes: `pathfinderQuery`, `webSession`
- Produces: `fetchProfile(): Promise<SpotifyApi.CurrentUsersProfileResponse>`, `fetchPlaylists(): Promise<SpotifyApi.PlaylistObjectSimplified[]>`, `fetchLikedTracks(): Promise<SpotifyApi.SavedTrackObject[]>`

- [ ] **Step 1: Выяснить формы переменных**

```bash
SPOTIFY_HASH=390c78e5b951029bad359785e69b07b536a509c581cbcd0aded5e5067f187455 \
npm run probe -- libraryV3 '{"filters":["Playlists"],"order":null,"textFilter":"","features":["LIKED_SONGS","YOUR_EPISODES"],"limit":200,"offset":0,"flatten":true,"expandedFolders":[],"folderUri":null,"includeFoldersWhenFlattening":true}'
```

```bash
SPOTIFY_HASH=087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240 \
npm run probe -- fetchLibraryTracks '{"offset":0,"limit":500}'
```

Записать сработавшие наборы — код ниже написан под них. Если gateway называет недостающую переменную, добавить её и поправить код соответственно.

- [ ] **Step 2: Написать модуль**

`src/lib/shared/api/library.ts`:

```ts
import { pathfinderQuery } from "./pathfinder";
import { webSession } from "$lib/modules/auth/model";

const PROFILE_HASH =
  "08ffb4730af3746e04a8301396f20875dbbce10c75243803091a9274eacc8ac0";
const LIBRARY_HASH =
  "390c78e5b951029bad359785e69b07b536a509c581cbcd0aded5e5067f187455";
const LIKED_HASH =
  "087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240";

/** Лимит на страницу любимых: одна выгрузка вместо тринадцати. */
const LIKED_PAGE = 500;

const idOf = (uri = "") => uri.split(":").pop() ?? "";

const query = <T>(operationName: string, fallbackHash: string, variables: Record<string, unknown>) =>
  webSession
    .ensureToken()
    .then((accessToken) =>
      pathfinderQuery<T>({ operationName, fallbackHash, accessToken, variables }),
    );

type RawProfile = {
  me?: { profile?: { username?: string; name?: string; avatar?: { sources?: { url?: string }[] } } };
};

export const fetchProfile = async () => {
  const data = await query<RawProfile>("profileAttributes", PROFILE_HASH, {});
  const profile = data.me?.profile;

  return {
    id: profile?.username ?? "",
    display_name: profile?.name ?? "",
    images: (profile?.avatar?.sources ?? []).map((source) => ({ url: source.url ?? "" })),
  } as unknown as SpotifyApi.CurrentUsersProfileResponse;
};

type RawLibraryItem = {
  item?: { data?: { __typename?: string; uri?: string; name?: string; images?: { items?: { sources?: { url?: string }[] }[] }; ownerV2?: { data?: { name?: string; username?: string } } } };
};

export const fetchPlaylists = async () => {
  const data = await query<{ me?: { libraryV3?: { items?: RawLibraryItem[] } } }>(
    "libraryV3",
    LIBRARY_HASH,
    {
      filters: ["Playlists"],
      order: null,
      textFilter: "",
      features: [],
      limit: 200,
      offset: 0,
      flatten: true,
      expandedFolders: [],
      folderUri: null,
      includeFoldersWhenFlattening: true,
    },
  );

  return (data.me?.libraryV3?.items ?? [])
    .map((entry) => entry.item?.data)
    .filter((item) => item?.__typename === "Playlist" && item.uri)
    .map(
      (item) =>
        ({
          id: idOf(item!.uri),
          uri: item!.uri,
          name: item!.name ?? "",
          collaborative: false,
          images: (item!.images?.items ?? []).map((image) => ({
            url: image.sources?.[0]?.url ?? "",
          })),
          owner: {
            id: item!.ownerV2?.data?.username ?? "",
            display_name: item!.ownerV2?.data?.name ?? "",
          },
        }) as unknown as SpotifyApi.PlaylistObjectSimplified,
    );
};

type RawLikedTrack = {
  addedAt?: { isoString?: string };
  track?: {
    uri?: string;
    name?: string;
    trackDuration?: { totalMilliseconds?: number };
    artists?: { items?: { uri?: string; profile?: { name?: string } }[] };
    albumOfTrack?: { uri?: string; name?: string; coverArt?: { sources?: { url?: string; width?: number }[] } };
  };
};

export const fetchLikedTracks = async () => {
  const collected: SpotifyApi.SavedTrackObject[] = [];

  for (let offset = 0; ; offset += LIKED_PAGE) {
    const data = await query<{ me?: { library?: { tracks?: { totalCount?: number; items?: RawLikedTrack[] } } } }>(
      "fetchLibraryTracks",
      LIKED_HASH,
      { offset, limit: LIKED_PAGE },
    );

    const page = data.me?.library?.tracks;
    const items = page?.items ?? [];

    for (const entry of items) {
      const track = entry.track;
      if (!track?.uri || !track.name) continue;

      collected.push({
        added_at: entry.addedAt?.isoString ?? "",
        track: {
          id: idOf(track.uri),
          uri: track.uri,
          name: track.name,
          duration_ms: track.trackDuration?.totalMilliseconds ?? 0,
          artists: (track.artists?.items ?? []).map((artist) => ({
            id: idOf(artist.uri),
            uri: artist.uri ?? "",
            name: artist.profile?.name ?? "",
          })),
          album: {
            id: idOf(track.albumOfTrack?.uri),
            uri: track.albumOfTrack?.uri ?? "",
            name: track.albumOfTrack?.name ?? "",
            images: (track.albumOfTrack?.coverArt?.sources ?? [])
              .map((source) => ({ url: source.url ?? "", width: source.width ?? null, height: null }))
              .sort((a, b) => (b.width ?? 0) - (a.width ?? 0)),
          },
        },
      } as unknown as SpotifyApi.SavedTrackObject);
    }

    if (items.length < LIKED_PAGE) break;
  }

  return collected;
};
```

- [ ] **Step 3: Переключить сторы**

В `user.model.ts` заменить импорт `spotifyApi` на `fetchProfile` и строку 12:

```ts
    $userData.set(await fetchProfile());
```

и `authModel.whenAuthorized` на `webSession.whenAuthorized`.

В `playlist.model.ts` заменить строку 59:

```ts
    $likedSongs.set(await fetchLikedTracks());
```

— вместе с рекурсивной функцией `load` (строки 55-68), она больше не нужна. И строку 84:

```ts
    $playlists.set(await fetchPlaylists());
```

Оба `authModel.whenAuthorized` в этом файле поменять на `webSession.whenAuthorized`. TTL на любимых (`LIKED_MAX_AGE`) оставить: одна выгрузка дешевле тринадцати, но всё ещё не бесплатна.

- [ ] **Step 4: Проверка**

```bash
npm run check && npm run lint && npm run tauri dev
```

Очистить `localStorage.liked` и `localStorage["liked-fetched-at"]`, перезапустить. Ожидается: в сайдбаре имя и аватар, список плейлистов, «Любимые треки» со всеми 630 позициями. В сетевой панели webview — ни одного запроса на `api.spotify.com`, к `api-partner` два-три запроса.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/api/library.ts src/lib/modules/user/model/user.model.ts src/lib/modules/playlist/model/playlist.model.ts
git commit -m "Read the profile and the library off the gateway"
```

---

### Task 8: Альбом, артист, чужой профиль, поиск

Убирает пиковую нагрузку навигации: страница артиста с 4 запросов сходит до 1.

**Files:**
- Create: `src/lib/shared/api/catalog.ts`
- Modify: `src/lib/modules/playlist/model/playlist.model.ts:152-173,235-274`
- Modify: `src/lib/modules/search/model/search.model.ts:41-80`
- Modify: `src/lib/modules/user/model/user.model.ts:25-45`

**Interfaces:**
- Produces: `fetchAlbum(id)`, `fetchArtist(id)` → `ArtistPage`, `fetchUser(id)` → `UserPage`, `searchAll(query, limit)` → `SearchResults`, `inLibrary(uris: string[]): Promise<boolean[]>`

- [ ] **Step 1: Выяснить формы переменных**

```bash
SPOTIFY_HASH=b9bfabef66ed756e5e13f68a942deb60bd4125ec1f1be8cc42769dc0259b4b10 \
npm run probe -- getAlbum '{"uri":"spotify:album:4aawyAB9vmqN3uQ7FjRGTy","locale":"","offset":0,"limit":50}'

SPOTIFY_HASH=ae0e2958a4ab645b35ca19ac04d0495ae12d9c5d7b7286217674801a9aab281a \
npm run probe -- queryArtistOverview '{"uri":"spotify:artist:0OdUWJ0sBjDrqHygGUXeCF","locale":"","includePrerelease":false}'

SPOTIFY_HASH=134337999233cc6fdd6b1e6dbf94841409f04a946c5c7b744b09ba0dfe5a85ed \
npm run probe -- areEntitiesInLibrary '{"uris":["spotify:album:4aawyAB9vmqN3uQ7FjRGTy"]}'
```

Проверить в ответе `queryArtistOverview`: есть ли поле про подписку (`saved`, `isFollowing` или подобное) внутри `artistUnion`. Если есть — `isFollowedArtist` читает его из уже загруженной страницы и отдельного запроса не делает. Если нет — использовать `areEntitiesInLibrary`.

Хеш `searchDesktop` взять из Task 2 Step 4 и подставить в `SEARCH_HASH` ниже.

- [ ] **Step 2: Написать модуль**

`src/lib/shared/api/catalog.ts`:

```ts
import { pathfinderQuery } from "./pathfinder";
import { webSession } from "$lib/modules/auth/model";
import type { ArtistPage } from "$lib/modules/playlist/model/playlist.model";
import type { SearchResults } from "$lib/modules/search/model/search.model";
import type { UserPage } from "$lib/modules/user/model/user.model";

const ALBUM_HASH =
  "b9bfabef66ed756e5e13f68a942deb60bd4125ec1f1be8cc42769dc0259b4b10";
const ARTIST_HASH =
  "ae0e2958a4ab645b35ca19ac04d0495ae12d9c5d7b7286217674801a9aab281a";
const IN_LIBRARY_HASH =
  "134337999233cc6fdd6b1e6dbf94841409f04a946c5c7b744b09ba0dfe5a85ed";
/** Заполнить хешем из Task 2 Step 4 — эта операция живёт в чанке поиска. */
const SEARCH_HASH = "";

const idOf = (uri = "") => uri.split(":").pop() ?? "";

const query = <T>(
  operationName: string,
  fallbackHash: string,
  variables: Record<string, unknown>,
  chunk?: string,
) =>
  webSession
    .ensureToken()
    .then((accessToken) =>
      pathfinderQuery<T>({ operationName, fallbackHash, accessToken, variables, chunk }),
    );

const imagesOf = (sources: { url?: string; width?: number }[] = []) =>
  sources
    .map((source) => ({ url: source.url ?? "", width: source.width ?? null, height: null }))
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));

const toTrack = (raw: {
  uri?: string;
  name?: string;
  trackDuration?: { totalMilliseconds?: number };
  duration?: { totalMilliseconds?: number };
  artists?: { items?: { uri?: string; profile?: { name?: string } }[] };
  albumOfTrack?: { uri?: string; name?: string; coverArt?: { sources?: { url?: string; width?: number }[] } };
}) =>
  ({
    id: idOf(raw.uri),
    uri: raw.uri ?? "",
    name: raw.name ?? "",
    duration_ms:
      raw.trackDuration?.totalMilliseconds ?? raw.duration?.totalMilliseconds ?? 0,
    artists: (raw.artists?.items ?? []).map((artist) => ({
      id: idOf(artist.uri),
      uri: artist.uri ?? "",
      name: artist.profile?.name ?? "",
    })),
    album: {
      id: idOf(raw.albumOfTrack?.uri),
      uri: raw.albumOfTrack?.uri ?? "",
      name: raw.albumOfTrack?.name ?? "",
      images: imagesOf(raw.albumOfTrack?.coverArt?.sources),
    },
  }) as unknown as SpotifyApi.TrackObjectFull;

export const fetchAlbum = async (id: string) => {
  const data = await query<{ albumUnion?: Record<string, any> }>("getAlbum", ALBUM_HASH, {
    uri: `spotify:album:${id}`,
    locale: "",
    offset: 0,
    limit: 50,
  });

  const raw = data.albumUnion;
  if (!raw?.uri) throw new Error(`Album ${id} not found`);

  return {
    id,
    uri: raw.uri,
    name: raw.name ?? "",
    release_date: raw.date?.isoString?.slice(0, 10) ?? "",
    images: imagesOf(raw.coverArt?.sources),
    artists: (raw.artists?.items ?? []).map((artist: any) => ({
      id: idOf(artist.uri),
      uri: artist.uri ?? "",
      name: artist.profile?.name ?? "",
    })),
    tracks: {
      items: (raw.tracksV2?.items ?? raw.tracks?.items ?? []).map((item: any) =>
        toTrack({ ...(item.track ?? item.itemV2?.data ?? {}), albumOfTrack: raw }),
      ),
    },
  } as unknown as SpotifyApi.AlbumObjectFull;
};

export const fetchArtist = async (id: string): Promise<ArtistPage> => {
  const data = await query<{ artistUnion?: Record<string, any> }>(
    "queryArtistOverview",
    ARTIST_HASH,
    { uri: `spotify:artist:${id}`, locale: "", includePrerelease: false },
  );

  const raw = data.artistUnion;
  if (!raw?.uri) throw new Error(`Artist ${id} not found`);

  const releases =
    raw.discography?.popularReleasesAlbums?.items ??
    raw.discography?.albums?.items ??
    [];

  return {
    artist: {
      id,
      uri: raw.uri,
      name: raw.profile?.name ?? "",
      genres: raw.profile?.genres?.items?.map((genre: any) => genre.name ?? "") ?? [],
      images: imagesOf(raw.visuals?.avatarImage?.sources),
    } as unknown as SpotifyApi.ArtistObjectFull,
    topTracks: (raw.discography?.topTracks?.items ?? []).map((item: any) =>
      toTrack(item.track ?? {}),
    ),
    albums: releases.map((item: any) => {
      const release = item.releases?.items?.[0] ?? item;

      return {
        id: idOf(release.uri),
        uri: release.uri ?? "",
        name: release.name ?? "",
        album_type: release.type?.toLowerCase() ?? "album",
        images: imagesOf(release.coverArt?.sources),
      } as unknown as SpotifyApi.AlbumObjectSimplified;
    }),
  };
};

export const inLibrary = async (uris: string[]) => {
  const data = await query<{ lookup?: { data?: { isInLibrary?: boolean } }[] }>(
    "areEntitiesInLibrary",
    IN_LIBRARY_HASH,
    { uris },
  );

  return (data.lookup ?? []).map((entry) => entry.data?.isInLibrary ?? false);
};

export const searchAll = async (term: string, limit: number): Promise<SearchResults> => {
  const data = await query<{ searchV2?: Record<string, any> }>(
    "searchDesktop",
    SEARCH_HASH,
    {
      searchTerm: term,
      offset: 0,
      limit,
      numberOfTopResults: 5,
      includeAudiobooks: false,
      includePreReleases: false,
    },
    "xpui-routes-search",
  );

  const raw = data.searchV2 ?? {};

  return {
    tracks: (raw.tracksV2?.items ?? []).map((item: any) =>
      toTrack(item.item?.data ?? {}),
    ),
    artists: (raw.artists?.items ?? []).map((item: any) => ({
      id: idOf(item.data?.uri),
      uri: item.data?.uri ?? "",
      name: item.data?.profile?.name ?? "",
      images: imagesOf(item.data?.visuals?.avatarImage?.sources),
    })) as unknown as SpotifyApi.ArtistObjectFull[],
    albums: (raw.albumsV2?.items ?? []).map((item: any) => ({
      id: idOf(item.data?.uri),
      uri: item.data?.uri ?? "",
      name: item.data?.name ?? "",
      images: imagesOf(item.data?.coverArt?.sources),
      artists: (item.data?.artists?.items ?? []).map((artist: any) => ({
        id: idOf(artist.uri),
        name: artist.profile?.name ?? "",
      })),
    })),
    playlists: (raw.playlists?.items ?? []).map((item: any) => ({
      id: idOf(item.data?.uri),
      uri: item.data?.uri ?? "",
      name: item.data?.name ?? "",
      images: (item.data?.images?.items ?? []).map((image: any) => ({
        url: image.sources?.[0]?.url ?? "",
      })),
      owner: { display_name: item.data?.ownerV2?.data?.name ?? "" },
    })) as unknown as SpotifyApi.PlaylistObjectSimplified[],
  };
};
```

Профиль чужого пользователя ходит не через pathfinder, а через spclient — там это один запрос вместо двух:

```ts
import { fetch } from "@tauri-apps/plugin-http";

const PROFILE_URL = "https://spclient.wg.spotify.com/user-profile-view/v3/profile";

export const fetchUser = async (id: string): Promise<UserPage> => {
  const response = await fetch(`${PROFILE_URL}/${id}?playlist_limit=50&artist_limit=0`, {
    headers: {
      authorization: `Bearer ${await webSession.ensureToken()}`,
      "app-platform": "WebPlayer",
    },
  });

  if (!response.ok) throw new Error(`Profile ${id}: HTTP ${response.status}`);

  const data = (await response.json()) as {
    name?: string;
    image_url?: string;
    public_playlists?: { uri?: string; name?: string; image_url?: string; owner_name?: string }[];
  };

  return {
    profile: {
      id,
      display_name: data.name ?? "",
      images: data.image_url ? [{ url: data.image_url }] : [],
    } as unknown as SpotifyApi.UserProfileResponse,
    playlists: (data.public_playlists ?? []).map(
      (playlist) =>
        ({
          id: idOf(playlist.uri),
          uri: playlist.uri ?? "",
          name: playlist.name ?? "",
          images: playlist.image_url ? [{ url: playlist.image_url }] : [],
          owner: { display_name: playlist.owner_name ?? "" },
        }) as unknown as SpotifyApi.PlaylistObjectSimplified,
    ),
  };
};
```

- [ ] **Step 3: Переключить сторы**

В `playlist.model.ts`:

```ts
export const album = (id: string) => cached(`album:${id}`, () => fetchAlbum(id));

export const artist = (id: string) => cached<ArtistPage>(`artist:${id}`, () => fetchArtist(id));
```

`isSavedAlbum` и `isFollowedArtist` — на `inLibrary`, и с кэшем, которого у них никогда не было (находка аудита: сейчас каждый заход на страницу артиста стоит запроса):

```ts
const libraryChecks = new Map<string, WritableAtom<boolean | null>>();

const checked = (uri: string) => {
  const hit = libraryChecks.get(uri);
  if (hit) return hit;

  const $saved = atom<boolean | null>(null);

  onMount($saved, () =>
    webSession.whenAuthorized(async () => {
      if ($saved.get() !== null) return;
      const [saved] = await inLibrary([uri]);
      $saved.set(saved);
    }),
  );

  libraryChecks.set(uri, $saved);
  return $saved;
};

export const isSavedAlbum = (id: string) => checked(`spotify:album:${id}`);
export const isFollowedArtist = (id: string) => checked(`spotify:artist:${id}`);
```

В `search.model.ts` заменить обе ветки внутри `setTimeout`: `spotifyApi.getTrack(link.id)` → `fetchTrack(link.id)` (добавить в `catalog.ts` по образцу `fetchAlbum`, операция `getTrack`, хеш `1a2f0cce77c90a4a5b1730beecc4da7e34290d684324c16663bf09a268ebce48`, переменные `{ uri: "spotify:track:<id>" }`), и `spotifyApi.search(...)` → `searchAll(query, LIMIT)`.

В `user.model.ts` заменить `Promise.all` на `$user.set(await fetchUser(id))`.

- [ ] **Step 4: Проверка**

```bash
npm run check && npm run lint && npm run tauri dev
```

Пройти: альбом (обложка, треки, год), артист (топ-треки, дискография, кнопка подписки в верном состоянии), чужой профиль из списка друзей, поиск по слову и вставкой ссылки на трек. В сетевой панели `api.spotify.com` не появляется.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/api/catalog.ts src/lib/modules/playlist/model/playlist.model.ts src/lib/modules/search/model/search.model.ts src/lib/modules/user/model/user.model.ts
git commit -m "Read the catalogue and search off the gateway"
```

---

### Task 9: Мутации

**Files:**
- Create: `src/lib/shared/api/mutations.ts`
- Modify: `src/lib/modules/playlist/model/playlist.model.ts:133-139,180-232,248-320`

**Interfaces:**
- Produces: `setInLibrary(uris: string[], saved: boolean)`, `addTracks(playlistUri, uris)`, `removeTracks(playlistUri, uids)`

- [ ] **Step 1: Выяснить формы переменных**

```bash
SPOTIFY_HASH=1ad0d40b3c09660d818b9e770eb1e84745dfbe941df159a64f8772b6fa2bfc3a \
npm run probe -- addToLibrary '{"uris":["spotify:track:4PTG3Z6ehGkBFwjybzWkR8"]}'
```

Затем то же с `removeFromLibrary` и тем же хешем — надо убедиться, что один документ действительно обслуживает пару и различие идёт по `operationName`. **Если `removeFromLibrary` возвращает ошибку про неизвестную операцию — искать её хеш в чанке `xpui-routes-collection` тем же способом, что `searchDesktop` в Task 2 Step 4, и записать отдельной константой.**

Проверять на треке, который не жалко: мутации применяются к настоящему аккаунту.

- [ ] **Step 2: Написать модуль**

`src/lib/shared/api/mutations.ts`:

```ts
import { pathfinderQuery } from "./pathfinder";
import { webSession } from "$lib/modules/auth/model";

/** Пара операций делит один persisted-документ; различает их operationName. */
const LIBRARY_HASH =
  "1ad0d40b3c09660d818b9e770eb1e84745dfbe941df159a64f8772b6fa2bfc3a";
const PLAYLIST_HASH =
  "47b2a1234b17748d332dd0431534f22450e9ecbb3d5ddcdacbd83368636a0990";

const mutate = async (operationName: string, fallbackHash: string, variables: Record<string, unknown>) =>
  pathfinderQuery<Record<string, unknown>>({
    operationName,
    fallbackHash,
    accessToken: await webSession.ensureToken(),
    variables,
  });

export const setInLibrary = (uris: string[], saved: boolean) =>
  mutate(saved ? "addToLibrary" : "removeFromLibrary", LIBRARY_HASH, { uris });

export const addTracks = (playlistUri: string, uris: string[]) =>
  mutate("addToPlaylist", PLAYLIST_HASH, {
    uris,
    playlistUri,
    newPosition: { moveType: "BOTTOM_OF_PLAYLIST", fromUid: null },
  });

export const removeTracks = (playlistUri: string, uids: string[]) =>
  mutate("removeFromPlaylist", PLAYLIST_HASH, { playlistUri, uids });
```

- [ ] **Step 3: Переключить `playlist.model.ts`**

Удалить `saveToLibrary` (строки 180-194) целиком вместе с комментарием — прямого `fetch` на `api.spotify.com` больше не будет. Заменить вызовы:

```ts
    await setInLibrary([track.uri], !isLiked);       // в toggleLike
    await setInLibrary([`spotify:album:${id}`], !saved);  // в toggleSavedAlbum
```

`toggleFollowedArtist` — туда же:

```ts
    await setInLibrary([`spotify:artist:${id}`], !followed);
```

`addToPlaylist` и `removeFromPlaylist` — на `addTracks` / `removeTracks`. У `removeTracks` аргумент — `uid` позиции в плейлисте, а не uri трека; он приходит в ответе `fetchPlaylist` полем `uid` рядом с `itemV2`. Добавить `uid` в `toTrack` в `internal-playlist.ts` и прокинуть до места удаления.

`followPlaylist` / `unfollowPlaylist` — тоже `setInLibrary` с `spotify:playlist:<id>`; второй запрос `getPlaylist` после подписки убрать, вместо него взять уже загруженную запись из `$playlists`, а если её нет — из `playlist(id)`.

- [ ] **Step 4: Проверка**

```bash
npm run check && npm run lint && npm run tauri dev
```

Проверить на настоящем аккаунте и вернуть всё как было: лайк и снятие лайка (звёздочка и присутствие в «Любимых» после перезапуска), сохранение и удаление альбома, подписка и отписка от артиста, добавление трека в плейлист перетаскиванием и удаление его из плейлиста, добавление и удаление чужого плейлиста из библиотеки.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/api/mutations.ts src/lib/modules/playlist/model/playlist.model.ts src/lib/modules/playlist/model/internal-playlist.ts
git commit -m "Write to the library through the gateway"
```

---

### Task 10: Плеер на Connect

Последние вызовы `api.spotify.com`: `play`, `transfer`, `shuffle`, `repeat`, `getMyCurrentPlaybackState`, `getTracks`.

**Files:**
- Modify: `src/lib/shared/api/connect-state.ts` (добавить `command`, `transfer`)
- Modify: `src/lib/modules/player/model/player.model.ts:52-76,205-275,355-380,605-625`

**Interfaces:**
- Produces: `command({accessToken, deviceId, endpoint, ...})`, `transfer({accessToken, deviceId})`

- [ ] **Step 1: Добавить команды в connect-state**

В `src/lib/shared/api/connect-state.ts`, рядом с `setQueue`/`skipTo`:

```ts
type Command = {
  accessToken: string;
  deviceId: string;
  endpoint: string;
  payload?: Record<string, unknown>;
};

/**
 * Тот же канал, которым Connect уже переставляет очередь, умеет и запускать
 * воспроизведение — Web API для этого больше не нужен.
 */
export const command = async ({ accessToken, deviceId, endpoint, payload = {} }: Command) => {
  const response = await fetch(
    `${BASE}/player/command/from/${SENDER_ID}/to/${deviceId}`,
    {
      method: "POST",
      headers: { ...headers(accessToken), "content-type": "application/json" },
      body: JSON.stringify({ command: { endpoint, ...payload } }),
    },
  );

  if (!response.ok) throw new Error(`Command ${endpoint}: HTTP ${response.status}`);
};

export const transfer = async ({ accessToken, deviceId }: Omit<Command, "endpoint">) => {
  const response = await fetch(`${BASE}/connect/transfer/from/${SENDER_ID}/to/${deviceId}`, {
    method: "POST",
    headers: { ...headers(accessToken), "content-type": "application/json" },
    body: JSON.stringify({ transfer_options: { restore_paused: "restore" } }),
  });

  if (!response.ok) throw new Error(`Transfer: HTTP ${response.status}`);
};
```

- [ ] **Step 2: Переписать команды плеера**

В `player.model.ts` удалить `playerCommand` (строки 52-76) вместе с комментарием про CORS — он больше не про этот код. Вместо него:

```ts
const send = async (endpoint: string, payload?: Record<string, unknown>) =>
  command({
    accessToken: await webSession.ensureToken(),
    deviceId: await device(),
    endpoint,
    payload,
  });

const setShuffle = (state: boolean) => send("set_options", { shuffling_context: state });

const setRepeat = (state: "off" | "context" | "track") =>
  send("set_options", {
    repeating_context: state === "context",
    repeating_track: state === "track",
  });
```

Сигнатуры `setShuffle`/`setRepeat` теряют аргумент `device` — поправить три места вызова (`toggleShuffle`, `cycleRepeat`, `play`, `playShuffled`, `shuffleContext`).

Запуск воспроизведения:

```ts
const startPlayback = (uris: string[]) =>
  send("play", {
    context: { uri: "", url: "", metadata: {}, pages: [{ tracks: uris.map((uri) => ({ uri })) }] },
    options: { skip_to: { track_index: 0 }, license: "premium" },
    play_origin: { feature_identifier: "harmony", feature_version: "desktop" },
  });

export const playContext = (uri: string) =>
  withDevice("playContext", () =>
    send("play", {
      context: { uri, url: `context://${uri}`, metadata: {} },
      options: { license: "premium" },
      play_origin: { feature_identifier: "harmony", feature_version: "desktop" },
    }),
  );
```

`restoreLastSession` — на `getCluster` и `transfer`:

```ts
const restoreLastSession = async (id: string) => {
  if (restored) return;
  restored = true;

  try {
    const accessToken = await webSession.ensureToken();
    const cluster = await getCluster(accessToken);
    if (cluster.player_state?.is_playing) return;

    await transfer({ accessToken, deviceId: id });
  } catch (err) {
    reportError("player restore", err);
  }
};
```

`hydrate` (строка 362) — на `decorateContextTracks`, хеш `383de00240775c39a6afe0b1055dc562b2a3930894201f9762f3fc32a74971c7`, переменные `{ uris: [...] }`; форму ответа снять пробником и разобрать по образцу `toTrack` из `catalog.ts`.

- [ ] **Step 3: Проверка**

```bash
npm run check && npm run lint && npm run tauri dev
```

Проверить: запуск трека из «Любимых» (список без контекста), запуск плейлиста целиком, запуск с перемешиванием, переключение shuffle и трёх режимов repeat с отражением в интерфейсе, восстановление последней сессии при старте, очередь с названиями треков дальше третьего.

Отдельно проверить находку аудита: при включённом shuffle клик по строке должен запускать именно её. Раньше это стоило трёх запросов Web API (`setShuffle(off)` → `play` → `setShuffle(on)`); в команде Connect позиция задаётся через `skip_to`, так что обходной манёвр в `play` (строки 239-246) убрать вместе с комментарием.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/api/connect-state.ts src/lib/modules/player/model/player.model.ts
git commit -m "Drive playback through Connect instead of the Web API"
```

---

### Task 11: Убрать публичный Web API

**Files:**
- Delete: `src/lib/shared/api/spotify.ts`, `src/lib/modules/auth/model/auth.model.ts`, `src/lib/modules/auth/model/internal.model.ts`, `src/lib/modules/auth/model/tokens.ts`
- Modify: `src/lib/modules/auth/model/session.ts`, `src/lib/modules/auth/model/index.ts`, `src/lib/config/spotify.ts`, `src/lib/modules/auth/pages/auth.svelte`, `src/routes/app/+layout.svelte:18-28`, `package.json`

- [ ] **Step 1: Убедиться, что не осталось вызовов**

```bash
grep -rn 'api\.spotify\.com\|spotifyApi\|spotify-web-api-js' src
```

Ожидается: пусто. Всё, что найдётся, — недоделанная задача выше; доделать её, а не удалять вызов.

- [ ] **Step 2: Выпилить**

```bash
git rm src/lib/shared/api/spotify.ts src/lib/modules/auth/model/auth.model.ts src/lib/modules/auth/model/internal.model.ts
npm uninstall spotify-web-api-js
```

`session.ts` и `tokens.ts` нужны, пока логин идёт через OAuth-окно — оно ставит cookie. Но обмен кода на токен больше не нужен: из `session.ts` убрать `ensureToken`, `refreshTokens`, `scheduleRefresh`, `$tokens`, `applyTokens` и `persistentAtom`; оставить только открытие окна и ожидание редиректа, после которого дёргается `webSession.ensureToken()`. `tokens.ts` сокращается до `createAuthRequest` — `getTokensFromCode` и `refreshTokens` удалить.

В `config/spotify.ts` удалить `SPOTIFY_CLIENT_ID`, `SCOPES` и комментарий про квоту librespot; `LIBRESPOT_CLIENT_ID` и `REDIRECT_URI` оставить — они всё ещё нужны, чтобы открыть страницу логина.

В `app/+layout.svelte` и `auth.svelte` заменить `authModel.$isAuthorized` / `$isPending` / `login` на соответствующее из `webSession`.

- [ ] **Step 3: Проверка**

```bash
npm run check && npm run lint && npm run check:i18n
```

Затем полный проход с чистого листа: очистить `localStorage` целиком, `npm run tauri dev`, войти, дождаться главной. В сетевой панели за первую минуту не должно быть ни одного запроса на `api.spotify.com`. Пройти по всем экранам: главная, поиск, плейлист, альбом, артист, любимые, профиль, друзья, очередь, лирика, мини-плеер.

- [ ] **Step 4: Убедиться, что квота больше не тратится**

Считать запросы за первые 30 секунд после запуска: `api.spotify.com` — 0, `api-partner.spotify.com` — 2-4, `spclient.wg.spotify.com` — 2-3. До миграции первое число было 17.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Stop using the public Web API"
```

---

## Что осталось незакрытым

- **Web Playback SDK** остаётся на месте — он воспроизводит звук и регистрирует устройство, без которого команды Connect некуда слать. Токен ему отдаёт `webSession`, `api.spotify.com/v1` он не трогает.
- **Ротация TOTP.** Секрет читается из бандла, так что смена версии чинится сама — но если Spotify включит `enableTOTPVersionValidation` и одновременно поменяет схему обфускации, `keyOf` в `totp.ts` придётся переписывать руками.
- **Хеши мутаций.** Протухший хеш ломает запись, а не только показ. Ретрай в `pathfinderQuery` перечитывает бандл и повторяет один раз — этого хватает, но при сбое пользователь увидит откат оптимистичного действия.
- **Утечка таймеров** в `session.ts:157-165` (`scheduleRefresh` не снимает предыдущий `setTimeout`) уходит вместе с самим `scheduleRefresh` в Task 11.
