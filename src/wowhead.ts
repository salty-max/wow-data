// Wowhead's names, for what the client doesn't name (creatures, objects,
// quests) in the other client languages. Its tooltip service answers
// scripts (its pages don't): https://nether.wowhead.com/<game>/tooltip/
// <kind>/<id>?locale=<n>. Fetched slowly, cached (.cache/wowhead/), and the
// names kept in the repository (data/wowhead/<game>/<locale>.json), so a
// build never asks Wowhead again. The client's own names win (the user's
// call): the build adds these where the client has none, and over Questie's
// where the two truly differ (Wowhead's are mined from the client).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CACHE } from "./cache";
import { fetchRetry } from "./fetch";
import { type Game, ROOT } from "./pins";

// Wowhead's language numbers (no Italian, no Traditional Chinese)
export const WOWHEAD_LOCALES: Record<string, number> = {
  koKR: 1,
  frFR: 2,
  deDE: 3,
  zhCN: 4,
  esES: 6,
  esMX: 7,
  ruRU: 8,
  ptBR: 10,
};
// our kinds, Wowhead's
export const WOWHEAD_KINDS = { creature: "npc", object: "object", quest: "quest", item: "item" } as const;
export type NameKind = keyof typeof WOWHEAD_KINDS;
// a game's names in a language: { kind: { id: name } } (creature_subname: an npc's title)
export type Names = Record<string, Record<string, string>>;

export const namesFile = (game: Game, locale: string) => path.join(ROOT, "data", "wowhead", game, `${locale}.json`);
export function readNames(game: Game, locale: string): Names {
  const file = namesFile(game, locale);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
}
export function writeNames(game: Game, locale: string, names: Names) {
  const file = namesFile(game, locale);
  mkdirSync(path.dirname(file), { recursive: true });
  // (sorted, one name a line: a diff shows what changed)
  const sorted: Names = {};
  for (const kind of Object.keys(names).sort()) {
    sorted[kind] = {};
    for (const id of Object.keys(names[kind]).sort((a, b) => Number(a) - Number(b))) sorted[kind][id] = names[kind][id];
  }
  writeFileSync(file, JSON.stringify(sorted, null, 1) + "\n");
}

export type Tooltip = { name?: string; tooltip?: string };
// a tooltip, once (cached as fetched; a thing Wowhead doesn't know: {})
export async function tooltip(game: Game, kind: NameKind, id: number, locale: string): Promise<Tooltip> {
  const file = path.join(CACHE, "wowhead", game, kind, locale, `${id}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const url = `https://nether.wowhead.com/${game}/tooltip/${WOWHEAD_KINDS[kind]}/${id}?locale=${WOWHEAD_LOCALES[locale] ?? 0}`;
  const res = await fetchRetry(url);
  const body: Tooltip = res.ok ? await res.json() : {};
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ name: body.name, tooltip: body.tooltip }));
  return body;
}
// an npc's title: the tooltip's second line, unless that line is its level
// and type ("Niveau 12 Humanoïde (Rare)", "Humanoïde (Standard)": a rank in
// brackets at its end, or a level's number), which a tooltip without the
// title shows there
export function titleOf(t: Tooltip): string | undefined {
  const cells = [...(t.tooltip ?? "").matchAll(/<td>(?:<b[^>]*>)?([^<]+)(?:<\/b>)?<\/td>/g)].map((m) => m[1].trim());
  const line = cells[1];
  if (!line || /\([^)]*\)\s*$/.test(line) || /(^|\s)(\d+|\?\?)(\s|$)/.test(line)) return undefined;
  return line;
}
