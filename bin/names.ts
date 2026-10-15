// A game's names in a language from Wowhead, for what the client doesn't
// name: every creature (and its title), quest, and object (every one the world
// spawns, a text, a quest's, a herb's or a vein's), into data/wowhead/<game>/<locale>.json.
// Resumable: what is fetched is cached, the file written as it goes.
//   bun bin/names.ts <classic|forever> <locale> [--kinds creature,quest,object]
//   bun bin/names.ts <classic|forever> <locale> --seed DIR...   tooltips an addon
//     already fetched (npc-<id>-<locale>.json, object-<id>-<n>.json...) first
//   --offline: the seeds alone, nothing fetched
//   --gaps: only what the database names in no way in this language (a
//     language whose names the other sources give, but for a game's own)
//   bun bin/names.ts <classic|forever> <locale> --ranks   the ranks Questie
//     doesn't give (Forever's own creatures), from the cached tooltips'
//     "Level 12 Humanoid (Rare)", into data/wowhead/<game>/ranks.json
// The database must be built (bin/build.ts): it says which ids there are.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CACHE } from "../src/cache";
import { openDb } from "../src/db";
import { type Game, ROOT } from "../src/pins";
import {
  type NameKind,
  type Names,
  type Tooltip,
  readNames,
  titleOf,
  tooltip,
  WOWHEAD_LOCALES,
  writeNames,
} from "../src/wowhead";

const [game, locale, ...rest] = process.argv.slice(2) as [Game, string, ...string[]];
if ((game !== "classic" && game !== "forever") || !WOWHEAD_LOCALES[locale]) {
  console.error(`usage: names.ts <classic|forever> <${Object.keys(WOWHEAD_LOCALES).join("|")}> [--kinds ...] [--seed DIR...]`);
  process.exit(2);
}
const kindsAt = rest.indexOf("--kinds");
const kinds = (kindsAt >= 0 ? rest[kindsAt + 1].split(",") : ["creature", "quest", "object"]) as NameKind[];
const seedAt = rest.indexOf("--seed");
const seeds = seedAt >= 0 ? rest.slice(seedAt + 1).filter((a) => !a.startsWith("--")) : [];
// (--titles: every creature's title again, from the cached tooltips)
const retitle = rest.includes("--titles");
const offline = rest.includes("--offline");
const ranks = rest.includes("--ranks");
const gaps = rest.includes("--gaps");

const db = openDb(game);
const names: Names = readNames(game, locale);
const ids = (sql: string) => (db.query(sql).all() as { id: number }[]).map((r) => r.id);
// the ids worth a name: every creature and quest; an object that is read, a
// quest's, or a node's (herbs, veins)
const wanted: Record<NameKind, number[]> = {
  creature: ids("SELECT id FROM creature ORDER BY id"),
  quest: ids("SELECT id FROM quest ORDER BY id"),
  object: ids(`SELECT DISTINCT id FROM (
    SELECT id FROM readable WHERE kind = 'object'
    UNION SELECT entity_id AS id FROM quest_relation WHERE kind = 'object'
    UNION SELECT target_id AS id FROM quest_objective WHERE kind = 'object'
    UNION SELECT id FROM object WHERE lock_id IS NOT NULL
    UNION SELECT entity_id AS id FROM spawn WHERE kind = 'object') ORDER BY id`),
  item: [],
};
if (gaps) {
  const named = (kind: string) =>
    new Set(ids(`SELECT id FROM name WHERE kind = '${kind}' AND locale = '${locale}'`));
  for (const kind of ["creature", "quest", "object"] as const) {
    const has = named(kind);
    wanted[kind] = wanted[kind].filter((id) => !has.has(id));
  }
}
const titled = new Set(ids("SELECT id FROM name WHERE kind = 'creature_subname' AND locale = 'enUS'"));

// what a tooltip names
function take(kind: NameKind, id: number, t: Tooltip) {
  if (!t.name) return;
  (names[kind] ??= {})[id] = t.name;
  if (kind === "creature" && titled.has(id)) {
    const title = titleOf(t);
    if (title) (names.creature_subname ??= {})[id] = title;
  }
}

// ── seeds: the tooltips the addons already fetched ──────────────────────────
// (npc-<id>-<locale>.json, object-<id>-<locale>.json; the Codex's
// <kind>-<id>-<n>.json with Wowhead's language number)
if (seeds.length) {
  const number = String(WOWHEAD_LOCALES[locale]);
  const KIND: Record<string, NameKind> = { npc: "creature", object: "object", quest: "quest" };
  let seeded = 0;
  for (const dir of seeds) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const m = f.match(/^(npc|object|quest)-(\d+)-(\w+)\.json$/);
      if (!m || (m[3] !== locale && m[3] !== number)) continue;
      const kind = KIND[m[1]],
        id = Number(m[2]);
      let t: Tooltip;
      try {
        t = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
      } catch {
        continue;
      }
      const cached = path.join(CACHE, "wowhead", game, kind, locale, `${id}.json`);
      if (!existsSync(cached)) {
        mkdirSync(path.dirname(cached), { recursive: true });
        writeFileSync(cached, JSON.stringify({ name: t.name, tooltip: t.tooltip }));
      }
      take(kind, id, t);
      seeded++;
    }
  }
  writeNames(game, locale, names);
  console.log(`seeded ${seeded} tooltips from ${seeds.length} folders`);
}

if (retitle) {
  names.creature_subname = {};
  for (const id of titled) {
    const file = path.join(CACHE, "wowhead", game, "creature", locale, `${id}.json`);
    if (existsSync(file)) take("creature", id, JSON.parse(readFileSync(file, "utf8")));
  }
  writeNames(game, locale, names);
  console.log(`titles again: ${Object.keys(names.creature_subname).length}`);
}

// ── the ranks Questie doesn't give, from the cached tooltips ────────────────
if (ranks) {
  const RANK: Record<string, number> = {
    standard: 0, normal: 0, élite: 1, elite: 1, "élite rare": 2, "rare elite": 2, "rare élite": 2, boss: 3, rare: 4,
  };
  const file = path.join(ROOT, "data", "wowhead", game, "ranks.json");
  const out: Record<string, number> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const dir = path.join(CACHE, "wowhead", game, "creature", locale);
  let n = 0;
  for (const id of ids("SELECT id FROM creature WHERE rank IS NULL ORDER BY id")) {
    const f = path.join(dir, `${id}.json`);
    if (!existsSync(f)) continue;
    const t: Tooltip = JSON.parse(readFileSync(f, "utf8"));
    const m = (t.tooltip ?? "").match(/(?:Niveau|Level|Stufe|Nivel|Уровень|Nível)[^<(]*\(([^)]+)\)/);
    const rank = m ? RANK[m[1].trim().toLowerCase()] : undefined;
    if (rank !== undefined) {
      out[id] = rank;
      n++;
    }
  }
  const sorted = Object.fromEntries(Object.entries(out).sort((a, b) => Number(a[0]) - Number(b[0])));
  writeFileSync(file, JSON.stringify(sorted, null, 1) + "\n");
  console.log(`ranks: ${n} from the tooltips -> data/wowhead/${game}/ranks.json`);
}

// ── the rest, fetched: four at a time, a breath between ─────────────────────
for (const kind of offline || ranks ? [] : kinds) {
  const todo = wanted[kind].filter((id) => !names[kind]?.[id]);
  console.log(`${game} ${locale} ${kind}: ${wanted[kind].length} wanted, ${todo.length} to fetch`);
  let done = 0,
    unnamed = 0;
  const queue = [...todo];
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      const t = await tooltip(game, kind, id, locale);
      if (t.name) take(kind, id, t);
      else unnamed++;
      if (++done % 500 === 0) {
        writeNames(game, locale, names);
        console.log(`  ${done}/${todo.length}`);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  writeNames(game, locale, names);
  console.log(`  ${kind}: ${Object.keys(names[kind] ?? {}).length} named (${unnamed} unknown to Wowhead)`);
}
