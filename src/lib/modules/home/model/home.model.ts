import { atom, onMount } from "nanostores";
import { webSession } from "$lib/modules/auth/model";
import { pathfinderQuery } from "$lib/shared/api/pathfinder";
import { persisted, read, write } from "$lib/shared/helpers/persisted";
import type { FeedSection } from "../types";
import { parseHome, type HomeResponse } from "./feed";

/**
 * The home feed — Discover Weekly, the daily mixes, "Made for you" — none of
 * which the public Web API exposes. It comes from the same GraphQL gateway the
 * web player uses, on the internal session.
 *
 * The hash below is only a starting point: it is bound to a web player build,
 * and when Spotify ships a new one the client picks the fresh hash out of the
 * player's bundle by itself.
 */
const HOME_QUERY_HASH =
  "76243c78b0e20ecdbe41b794dec8cbe73f75e585b0a7201b8d2e84578412847a";

export const $greeting = atom("");
export const $sections = atom<FeedSection[] | null>(null);
export const $isPending = atom(false);
export const $error = atom<string | null>(null);

export const $isEnabled = webSession.$isAuthorized;
export const enable = webSession.login;

const load = async () => {
  $isPending.set(true);
  $error.set(null);

  try {
    const response = await pathfinderQuery<HomeResponse>({
      operationName: "home",
      fallbackHash: HOME_QUERY_HASH,
      accessToken: await webSession.ensureToken(),
      variables: {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        sp_t: localStorage.getItem("pathfinder_device_id") ?? "",
        facet: null,
        sectionItemsLimit: 10,
        homeEndUserIntegration: "INTEGRATION_WEB_PLAYER",
      },
    });

    const feed = parseHome(response);
    $greeting.set(feed.greeting);
    $sections.set(feed.sections);
    loaded = true;
    write(FETCHED_AT, Date.now());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("home:", message);
    $error.set(message);
  } finally {
    $isPending.set(false);
  }
};

// ponytail: a flag, not the store's value — the persisted feed must not pass
// for "already loaded", or it would never refresh
let loaded = false;

/**
 * The feed itself has been cached all along; this caches the trip to the
 * gateway. Its own key rather than a store: the decision to skip is taken once
 * at mount, and a store restored asynchronously would not be there yet.
 */
const SECTIONS = "home-sections";
const GREETING = "home-greeting";
const FETCHED_AT = "home-fetched-at";
const MAX_AGE = 30 * 60 * 1000;

const loadIfStale = async () => {
  if (loaded || $isPending.get()) return;

  // straight from the cache rather than from the store: the store is restored
  // asynchronously too, and which of the two lands first is not ours to say
  const [at, cached] = await Promise.all([
    read<number>(FETCHED_AT),
    read<FeedSection[]>(SECTIONS),
  ]);

  // an empty cache is worth a request whatever the stamp says
  if (Date.now() - (at ?? 0) < MAX_AGE && cached?.length) {
    loaded = true;
    return;
  }

  await load();
};

onMount($sections, () => {
  const unbind = [
    persisted($sections, SECTIONS),
    persisted($greeting, GREETING),
  ];

  const stop = webSession.$isAuthorized.subscribe((authorized) => {
    if (authorized) loadIfStale();
  });

  return () => {
    unbind.forEach((off) => off());
    stop();
  };
});

export const reload = load;
