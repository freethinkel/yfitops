import Database from "@tauri-apps/plugin-sql";
import type { WritableAtom } from "nanostores";

/**
 * localStorage held ~5MB for the whole app, so a liked-songs run of a few
 * megabytes was never cached at all. SQLite lives outside the webview and has
 * room for the lot.
 */
// ponytail: one key/value table — SQLite is here for the space, not the schema
let db: Promise<Database> | null = null;

const open = () =>
  (db ??= Database.load("sqlite:cache.db").then(async (database) => {
    await database.execute(
      "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    return database;
  }));

const failed = (err: unknown) => console.error("cache:", err);

export const forget = async (key: string) => {
  const database = await open();

  // a cache that cannot forget is still better than a broken page
  await database.execute("DELETE FROM kv WHERE key = $1", [key]).catch(failed);
};

/** For values read once rather than mirrored into a store. */
export const read = async <T>(key: string): Promise<T | null> => {
  try {
    const database = await open();
    const rows = await database.select<{ value: string }[]>(
      "SELECT value FROM kv WHERE key = $1",
      [key],
    );

    return rows[0] ? (JSON.parse(rows[0].value) as T) : null;
  } catch (err) {
    failed(err);
    return null;
  }
};

export const write = async (key: string, value: unknown) => {
  try {
    const database = await open();

    await database.execute(
      "INSERT INTO kv (key, value) VALUES ($1, $2)" +
        " ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      [key, JSON.stringify(value)],
    );
  } catch (err) {
    failed(err);
  }
};

/**
 * Stale-while-revalidate: the store starts with whatever the last session
 * left on disk, so the app paints instantly, and the usual fetch still runs
 * and overwrites it.
 */
export const persisted = <T>($store: WritableAtom<T>, key: string) => {
  open()
    .then((database) =>
      database.select<{ value: string }[]>(
        "SELECT value FROM kv WHERE key = $1",
        [key],
      ),
    )
    .then((rows) => {
      // the fetch can win this race — a cached value must never overwrite fresh
      if (rows[0] && !$store.get()) $store.set(JSON.parse(rows[0].value) as T);
    })
    .catch(failed);

  return $store.listen((value) => {
    if (value == null) return;

    open()
      .then((database) =>
        database.execute(
          "INSERT INTO kv (key, value) VALUES ($1, $2)" +
            " ON CONFLICT (key) DO UPDATE SET value = excluded.value",
          [key, JSON.stringify(value)],
        ),
      )
      .catch(failed);
  });
};
