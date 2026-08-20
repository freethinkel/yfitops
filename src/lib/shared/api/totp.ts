import { fetch } from "@tauri-apps/plugin-http";
import { bundleMeta } from "./pathfinder";

/**
 * The web player's token is only handed out together with a one-time code.
 * Its secret is obfuscated inside the player's bundle and versioned — the
 * server can turn down an outdated version — so it is read from the same
 * place as the query hashes rather than kept as a constant here.
 */
const SERVER_TIME_URL = "https://open.spotify.com/api/server-time";
const PERIOD = 30;
const DIGITS = 6;

/** Straight out of the bundle: XOR by position, joined, and those bytes are the key. */
const keyOf = (secret: string) =>
  new TextEncoder().encode(
    [...secret].map((char, i) => char.charCodeAt(0) ^ ((i % 33) + 9)).join(""),
  );

/**
 * Spotify's own clock, not this machine's: a code computed against a drifting
 * local clock is refused, and the drift is invisible from here.
 */
const serverTime = async () => {
  try {
    const response = await fetch(SERVER_TIME_URL, {
      headers: { referer: "https://open.spotify.com/" },
      connectTimeout: 4_000,
    });

    const seconds = Number((await response.json())?.serverTime);
    if (seconds && !Number.isNaN(seconds)) return seconds;
  } catch {
    // the network let us down; local time is usually close enough to try
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
