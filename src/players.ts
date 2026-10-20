// Players' facts (data/players/<game>/<locale>.json, bin/players.ts): what
// the game told the players who said yes to the addons' opt-in (the kit's
// collector), sent by Ravenpost to its inbox (salty-max/ravenpost, inbox/) and merged from
// there daily: quests' texts, givers and enders, creatures' names, levels,
// ranks, types and approximate sightings, what NPCs said, what a creature or an
// object gave. The live game's own words, so new content is known without
// waiting for the other sources. They fill gaps only: a fact any other source
// has stays its.
//
// A file: { facts: [[kind, entity, field, value, build, [who…]], …] }, `who`
// the players who sent that value (each a hash). Where players disagree on
// one value (a text, a giver), the one most of them saw wins, then the newest
// build's; a level is the range of every one seen; lines and loot are kept
// each.
import type { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { type Game, ROOT } from "./pins";

/** One fact, its language and how many players saw it. */
export type PlayerFact = [locale: string, kind: string, entity: string, field: string, value: string, build: string | null, seen: number];

// A fact one player alone sent is taken: the opt-in is new and its players
// few. Each is a Battle.net account (the inbox signs them in), so agreement
// can't be faked without accounts. Raise it when players are many.
export const MIN_SEEN = 1;

// UnitClassification's words, as creature.rank.
const RANKS: Record<string, number> = { normal: 0, trivial: 0, minus: 0, elite: 1, rareelite: 2, worldboss: 3, rare: 4 };
const QUEST_TEXTS = new Set(["details", "objectives", "request", "reward"]);

/** The game's line breaks as the other sources write them ($B). */
export const gameText = (s: string) => s.replace(/\r?\n/g, "$B");

/** Of several values for one fact, the one most players saw, then the newest build's. */
export function pick(facts: PlayerFact[]): PlayerFact {
  return facts.reduce((best, f) => {
    if (f[6] !== best[6]) return f[6] > best[6] ? f : best;
    return Number(f[5] ?? 0) > Number(best[5] ?? 0) ? f : best;
  });
}

export function loadPlayers(db: Database, game: Game) {
  const dir = path.join(ROOT, "data", "players", game);
  if (!existsSync(dir)) return;
  const facts: PlayerFact[] = [];
  for (const f of readdirSync(dir).filter((f) => /^[a-z]{2}[A-Z]{2}\.json$/.test(f))) {
    const locale = f.slice(0, -5);
    const { facts: lines } = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as {
      facts: [string, string, string, string, string | null, string[]][];
    };
    for (const [kind, entity, field, value, build, who] of lines) facts.push([locale, kind, entity, field, value, build, who.length]);
  }
  db.prepare("INSERT OR IGNORE INTO source VALUES ('players', 'data/players', 'https://github.com/salty-max/ravenpost/tree/main/inbox', 'the players'' own, through the addons'' opt-in')").run();
  const told = players(db, facts);
  console.log(`  players: ${Object.entries(told).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing new"}`);
}

/** Players' facts into the database, where no other source has them. */
export function players(db: Database, all: PlayerFact[]): Record<string, number> {
  const facts = all.filter((f) => f[6] >= MIN_SEEN);
  const told: Record<string, number> = {};
  const count = (what: string, n: number) => {
    if (n) told[what] = (told[what] ?? 0) + n;
  };
  // (one value a fact: per language for words, across them for the rest)
  const groups = new Map<string, PlayerFact[]>();
  const group = (key: string, f: PlayerFact) => {
    const g = groups.get(key);
    if (g) g.push(f);
    else groups.set(key, [f]);
  };
  const ranges = new Map<number, [number, number]>();
  const lines: PlayerFact[] = [];
  const loot: PlayerFact[] = [];
  const sightings: PlayerFact[] = [];
  for (const f of facts) {
    const [locale, kind, entity, field, value] = f;
    if (kind === "say" || kind === "gossip") lines.push(f);
    else if (kind === "loot") loot.push(f);
    else if (kind === "npc" && field === "where") sightings.push(f);
    else if (kind === "npc" && field === "level") {
      const [lo, hi] = JSON.parse(value) as [number, number];
      const r = ranges.get(Number(entity));
      ranges.set(Number(entity), r ? [Math.min(r[0], lo), Math.max(r[1], hi)] : [lo, hi]);
    } else if (field === "title" || field === "name" || QUEST_TEXTS.has(field) || field === "type" || field === "family")
      group(`${kind}|${entity}|${field}|${locale}`, f);
    else group(`${kind}|${entity}|${field}`, f);
  }
  const chosen = [...groups.values()].map(pick);

  db.transaction(() => {
    const quest = db.prepare("INSERT OR IGNORE INTO quest (id, source) VALUES (?, 'players')");
    const creature = db.prepare("INSERT OR IGNORE INTO creature (id, source) VALUES (?, 'players')");
    const name = db.prepare("INSERT OR IGNORE INTO name VALUES (?, ?, ?, ?, NULL, 'players')");
    const text = db.prepare("INSERT OR IGNORE INTO quest_text VALUES (?, ?, ?, ?, 'players')");
    const related = db.prepare("SELECT 1 FROM quest_relation WHERE quest_id = ? AND role = ?");
    const relation = db.prepare("INSERT OR IGNORE INTO quest_relation VALUES (?, ?, ?, ?, 'players')");
    const typeOf = db.prepare("SELECT id FROM name WHERE kind = ? AND locale = ? AND lower(name) = lower(?)");
    const set = (column: string) => db.prepare(`UPDATE creature SET ${column} = ? WHERE id = ? AND ${column} IS NULL`);
    const setType = set("type_id"),
      setFamily = set("family_id"),
      setRank = set("rank");
    for (const [locale, kind, entity, field, value] of chosen) {
      const id = Number(entity);
      if (kind === "quest") {
        count("quests", quest.run(id).changes);
        if (field === "title") count("quest titles", name.run("quest", id, locale, value).changes);
        else if (QUEST_TEXTS.has(field)) count("quest texts", text.run(id, locale, field, gameText(value)).changes);
        else if ((field === "giver" || field === "ender") && /^(npc|object):\d+$/.test(value)) {
          const role = field === "giver" ? "start" : "end";
          const [what, who] = value.split(":");
          if (!related.get(id, role)) count("givers and enders", relation.run(id, role, what === "npc" ? "creature" : "object", Number(who)).changes);
        }
      } else if (kind === "npc") {
        count("creatures", creature.run(id).changes);
        if (field === "name") count("creature names", name.run("creature", id, locale, value).changes);
        else if (field === "rank" && value in RANKS) count("ranks", setRank.run(RANKS[value], id).changes);
        else if ((field === "typeId" || field === "familyId") && /^\d+$/.test(value))
          count(field === "typeId" ? "types" : "families", (field === "typeId" ? setType : setFamily).run(Number(value), id).changes);
        else if (field === "type" || field === "family") {
          const t = typeOf.get(field === "type" ? "creature_type" : "creature_family", locale, value) as { id: number } | null;
          if (t) count(field === "type" ? "types" : "families", (field === "type" ? setType : setFamily).run(t.id, id).changes);
        }
      }
    }
    const sighting = db.prepare(`INSERT OR IGNORE INTO creature_sighting
      (npc_id, locale, ui_map_id, observer_x, observer_y, build, seen, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'players')`);
    for (const [locale, , entity, , value, build, seen] of sightings) {
      let position: unknown;
      try { position = JSON.parse(value); } catch { continue; }
      if (!Array.isArray(position) || position.length !== 3) continue;
      const [map, x, y] = position;
      if (!Number.isInteger(map) || map < 1 || map > 100_000
        || typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 100
        || typeof y !== "number" || !Number.isFinite(y) || y < 0 || y > 100) continue;
      count("creatures", creature.run(Number(entity)).changes);
      count("sightings", sighting.run(Number(entity), locale, map, x, y, build, seen).changes);
    }
    const level = db.prepare("UPDATE creature SET min_level = ?, max_level = ? WHERE id = ? AND min_level IS NULL");
    for (const [id, [lo, hi]] of ranges) {
      count("creatures", creature.run(id).changes);
      count("levels", level.run(lo, hi, id).changes);
    }
    const line = db.prepare("INSERT OR IGNORE INTO npc_line VALUES (?, ?, ?, ?, ?, 'players')");
    for (const [locale, kind, entity, field, value, , seen] of lines)
      count("lines", line.run(Number(entity), locale, kind === "gossip" ? "gossip" : field, gameText(value), seen).changes);
    // (what a creature or an object gave: the items, never their odds, for
    // the sources no other source gives any loot to)
    const looted = db.prepare("SELECT 1 FROM loot WHERE kind = ? AND source_id = ?");
    const object = db.prepare("INSERT OR IGNORE INTO object (id, source) VALUES (?, 'players')");
    const lootIdOf = {
      creature: db.prepare("SELECT loot_id FROM creature WHERE id = ?"),
      object: db.prepare("SELECT loot_id FROM object WHERE id = ?"),
    };
    const setLoot = {
      creature: db.prepare("UPDATE creature SET loot_id = ? WHERE id = ? AND loot_id IS NULL"),
      object: db.prepare("UPDATE object SET loot_id = ? WHERE id = ? AND loot_id IS NULL"),
    };
    const drop = db.prepare("INSERT INTO loot (kind, source_id, item_id, source) VALUES (?, ?, ?, 'players')");
    const bySource = new Map<string, Set<number>>();
    for (const [, , entity, , value] of loot) {
      const items = bySource.get(entity) ?? new Set();
      items.add(Number(value));
      bySource.set(entity, items);
    }
    for (const [source, items] of bySource) {
      const [what, sid] = source.split(":");
      const id = Number(sid);
      const kind = what === "npc" ? "creature" : "object";
      // (the thing itself, which a player looted, even where another source
      // gives its loot: Questie's of a creature or an object no other source
      // has, which the build would else leave out)
      count(kind === "creature" ? "creatures" : "objects", (kind === "creature" ? creature : object).run(id).changes);
      const template = (lootIdOf[kind].get(id) as { loot_id: number | null } | null)?.loot_id ?? id;
      if (looted.get(kind, template)) continue;
      setLoot[kind].run(template, id);
      for (const item of items) count("loot", drop.run(kind, template, item).changes);
    }
  })();
  return told;
}
