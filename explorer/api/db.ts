// The two databases, open read only, opened again when a build replaces one
// (bin/build.ts writes aside and renames: the old file stays open otherwise).
import { Database } from "bun:sqlite";
import { existsSync, statSync } from "node:fs";
import { dbPath } from "../../src/db";
import type { Game } from "../../src/pins";

export type Row = Record<string, any>;
export const GAMES: Game[] = ["classic", "forever"];
export const LOCALES = ["enUS", "deDE", "esES", "esMX", "frFR", "itIT", "koKR", "ptBR", "ruRU", "zhCN", "zhTW"];

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function gameOf(name: string): Game {
  if (name !== "classic" && name !== "forever") throw new HttpError(404, `No game called ${name}`);
  return name;
}

const open = new Map<Game, { db: Database; mtime: number }>();
export const built = (game: Game) => existsSync(dbPath(game));

// the game's database (read only), the current file
export function db(game: Game): Database {
  const file = dbPath(game);
  if (!existsSync(file)) throw new HttpError(503, `${game}.db isn't built yet: bun bin/build.ts ${game}`);
  const mtime = statSync(file).mtimeMs;
  const known = open.get(game);
  if (known?.mtime === mtime) return known.db;
  known?.db.close();
  const d = new Database(file, { readonly: true });
  open.set(game, { db: d, mtime });
  return d;
}

export const metaOf = (d: Database, key: string): string | undefined =>
  (d.query("SELECT value FROM meta WHERE key = ?").get(key) as Row | null)?.value;
