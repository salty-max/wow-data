// The game client's own tables (DB2) on wago.tools, at the pinned builds:
// .cache/wago/<game>/<build>/<table>-<locale>.csv.
import { readFileSync } from "node:fs";
import { cached } from "./cache";
import { csv } from "./csv";
import { type Game, PINS, wagoQuery } from "./pins";

export const LOCALES = ["deDE", "esES", "esMX", "frFR", "itIT", "koKR", "ptBR", "ruRU", "zhCN", "zhTW"];

// the table's file (downloaded once)
export function wagoFile(game: Game, table: string, locale = "enUS"): Promise<string> {
  const pin = PINS.builds[game];
  const loc = locale === "enUS" ? "" : `&locale=${locale}`;
  return cached(`https://wago.tools/db2/${table}/csv?${wagoQuery(pin)}${loc}`, `wago/${game}/${pin.build}/${table}-${locale}.csv`);
}
// the table's rows
export async function wago(game: Game, table: string, locale = "enUS"): Promise<Record<string, string>[]> {
  return csv(readFileSync(await wagoFile(game, table, locale), "utf8"));
}
