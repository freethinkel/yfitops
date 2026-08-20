// Отладочный инструмент: гоняет одну операцию против настоящего gateway и
// печатает ответ. Нужен потому, что формы переменных persisted-запросов нигде
// не опубликованы — их выясняют по тексту ошибки, которая называет
// недостающее поле.
//
//   SPOTIFY_TOKEN=BQ... npm run probe -- queryArtistOverview '{"uri":"..."}'
//
// Хеш операции ищется в бандле плеера сам; SPOTIFY_HASH задаёт его вручную,
// если операция живёт в lazy-чанке и в main её нет.

const [, , operationName, rawVariables = "{}"] = process.argv;
const token = process.env.SPOTIFY_TOKEN;

if (!operationName || !token) {
  console.error(
    "usage: SPOTIFY_TOKEN=... node scripts/probe.mjs <operation> '<variables>'",
  );
  process.exit(1);
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const WEB_PLAYER_VERSION = "1.2.98.104.ga2fc9a0c-development";
const WEB_PLAYER_CLIENT_ID = "d8a5ed958d274c2e8ee717e6a4b0971d";

const hashOf = async (name) => {
  if (process.env.SPOTIFY_HASH) return process.env.SPOTIFY_HASH;

  const html = await fetch("https://open.spotify.com/", {
    headers: { "user-agent": USER_AGENT },
  }).then((res) => res.text());

  const bundleUrl = html.match(
    /https:\/\/open\.spotifycdn\.com\/cdn\/build\/web-player\/web-player\.[\w-]+\.js/,
  )?.[0];

  if (!bundleUrl) throw new Error("Web player bundle not found");

  const source = await fetch(bundleUrl, {
    headers: { "user-agent": USER_AGENT },
  }).then((res) => res.text());

  const hash = source.match(
    new RegExp(`\\.l\\("${name}","(?:query|mutation)","([0-9a-f]{64})"`),
  )?.[1];

  if (!hash) {
    throw new Error(
      `${name} не найдена в main-бандле — она в lazy-чанке, задай SPOTIFY_HASH вручную`,
    );
  }

  return hash;
};

const clientToken = await fetch(
  "https://clienttoken.spotify.com/v1/clienttoken",
  {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_data: {
        client_version: WEB_PLAYER_VERSION,
        client_id: WEB_PLAYER_CLIENT_ID,
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
  },
)
  .then((res) => res.json())
  .then((data) => data?.granted_token?.token);

if (!clientToken) throw new Error("Client token not granted");

const response = await fetch(
  "https://api-partner.spotify.com/pathfinder/v2/query",
  {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "client-token": clientToken,
      "content-type": "application/json;charset=UTF-8",
      "app-platform": "WebPlayer",
      "spotify-app-version": WEB_PLAYER_VERSION,
      "accept-language": "en",
      origin: "https://open.spotify.com",
      referer: "https://open.spotify.com/",
      "user-agent": USER_AGENT,
    },
    body: JSON.stringify({
      operationName,
      variables: JSON.parse(rawVariables),
      extensions: {
        persistedQuery: { version: 1, sha256Hash: await hashOf(operationName) },
      },
    }),
  },
);

const body = await response.json();

console.log(`HTTP ${response.status}`);
console.log(JSON.stringify(body, null, 2).slice(0, 6000));
