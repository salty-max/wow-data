// A game's database built from the pinned sources (PLAN.md, schema.sql):
// the client's own tables whole, their names in every language, then the
// Classic database's world, every link an id, every row its source.
import { gamePage } from "./gametext";
export { gamePage } from "./gametext";
import { wowheadChanged, wowheadPages } from "./wowheadPages";
import { clientGathering } from "./gathering";
import { loadLandmarks } from "./landmarks";
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { absent, CACHE } from "./cache";
import { databaseTag } from "./dbRelease";
import { classicDump } from "./github";
import { type Game, PINS, ROOT } from "./pins";
import { loadPlayers, playerFacts } from "./players";
import { questie, questieSeason, questieZoneMaps, type QuestieData, type QuestieRecord } from "./questie";
import { rows } from "./sql";
import { LOCALES, wago } from "./wago";

type Row = Record<string, string | number | null>;

// The client's tables imported whole (client_<Table>); one a game lacks is skipped, said.
const CLIENT_TABLES = [
  "AreaTable",
  "WMOAreaTable",
  "AreaTrigger",
  "Map",
  "UiMap",
  "UiMapAssignment",
  "UiMapXMapArt",
  "UiMapArt",
  "UiMapArtStyleLayer",
  "UiMapArtTile",
  "WorldMapOverlay",
  "WorldMapOverlayTile",
  "DungeonEncounter",
  "SpellName",
  "SpellEffect",
  "SpellReagents",
  "CharStartOutfit",
  "SkillLine",
  "SkillLineAbility",
  "TalentTab",
  "ChrSpecialization",
  "ChrClasses",
  "ChrRaces",
  "TaxiNodes",
  "Faction",
  "FactionTemplate",
  "CreatureType",
  "CreatureFamily",
  "CreatureDisplayInfo",
  "CreatureDisplayInfoExtra",
  "ItemSparse",
  "Item",
  "ItemEffect",
  "ItemXItemEffect",
  "Lock",
  "QuestSort",
  "QuestInfo",
  "EmotesText",
  "Languages",
  "QuestV2",
  "GlobalStrings",
  "ZoneMusic",
  "ZoneIntroMusicTable",
  "SoundKitEntry",
];
// The client's tables that name things: kind, the id column, the name's (and a female form's).
const NAMED: { table: string; kind: string; name: string; female?: string }[] = [
  { table: "AreaTable", kind: "area", name: "AreaName_lang" },
  { table: "WMOAreaTable", kind: "wmo_area", name: "AreaName_lang" },
  { table: "Map", kind: "map", name: "MapName_lang" },
  { table: "UiMap", kind: "ui_map", name: "Name_lang" },
  { table: "DungeonEncounter", kind: "encounter", name: "Name_lang" },
  { table: "SpellName", kind: "spell", name: "Name_lang" },
  { table: "SkillLine", kind: "skill_line", name: "DisplayName_lang" },
  { table: "TalentTab", kind: "talent_tab", name: "Name_lang" },
  { table: "ChrSpecialization", kind: "specialization", name: "Name_lang", female: "FemaleName_lang" },
  { table: "ChrClasses", kind: "class", name: "Name_lang", female: "Name_female_lang" },
  { table: "ChrRaces", kind: "race", name: "Name_lang", female: "Name_female_lang" },
  { table: "TaxiNodes", kind: "taxi_node", name: "Name_lang" },
  { table: "Faction", kind: "faction", name: "Name_lang" },
  { table: "CreatureType", kind: "creature_type", name: "Name_lang" },
  { table: "CreatureFamily", kind: "creature_family", name: "Name_lang" },
  { table: "QuestSort", kind: "quest_sort", name: "SortName_lang" },
  { table: "QuestInfo", kind: "quest_info", name: "InfoName_lang" },
  { table: "Languages", kind: "language", name: "Name_lang" },
  { table: "ItemSparse", kind: "item", name: "Display_lang" },
  // (the client's other words in every language, by the same ids: an item's
  // flavour line, a spell's and its aura's description, a faction's, and the
  // interface's own strings, their tags in client_GlobalStrings)
  { table: "ItemSparse", kind: "item_description", name: "Description_lang" },
  { table: "Spell", kind: "spell_description", name: "Description_lang" },
  { table: "Spell", kind: "aura_description", name: "AuraDescription_lang" },
  { table: "Spell", kind: "spell_subtext", name: "NameSubtext_lang" },
  { table: "Faction", kind: "faction_description", name: "Description_lang" },
  { table: "GlobalStrings", kind: "global_string", name: "TagText_lang" },
];

const log = (s: string) => console.log(`  ${s}`);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const nz = (v: unknown) => {
  const n = num(v);
  return n ? n : null; // (0 is the databases' "none")
};

// ── the client's tables ──────────────────────────────────────────────────────
async function clientTables(db: Database, game: Game) {
  for (const table of CLIENT_TABLES) {
    let data: Record<string, string>[];
    try {
      data = await wago(game, table);
    } catch (e) {
      // (only wago.tools' "no such table" is an absence: a failed download stops the build)
      if (!absent(e)) throw e;
      log(`client_${table}: not in ${game} (${(e as Error).message})`);
      continue;
    }
    if (!data.length) {
      log(`client_${table}: empty in ${game}`);
      continue;
    }
    const cols = Object.keys(data[0]);
    // (a column of whole numbers is INTEGER, of numbers REAL, else TEXT)
    const types = cols.map((c) => {
      let kind = "INTEGER";
      for (const r of data) {
        const v = r[c];
        if (v === "") continue;
        if (/^-?\d+$/.test(v)) continue;
        if (/^-?\d*\.\d+(e-?\d+)?$/i.test(v)) {
          kind = "REAL";
          continue;
        }
        kind = "TEXT";
        break;
      }
      return kind;
    });
    db.run(`CREATE TABLE "client_${table}" (${cols.map((c, i) => `"${c}" ${types[i]}`).join(", ")})`);
    const insert = db.prepare(`INSERT INTO "client_${table}" VALUES (${cols.map(() => "?").join(", ")})`);
    db.transaction(() => {
      for (const r of data)
        insert.run(...cols.map((c, i) => (r[c] === "" ? null : types[i] === "TEXT" ? r[c] : Number(r[c]))));
    })();
    log(`client_${table}: ${data.length} rows`);
  }
}

// ── names in every language, from the client's tables ───────────────────────
async function clientNames(db: Database, game: Game) {
  const insert = db.prepare("INSERT OR IGNORE INTO name VALUES (?, ?, ?, ?, ?, 'client')");
  for (const n of NAMED) {
    let count = 0;
    const per: Record<string, number> = {};
    for (const locale of ["enUS", ...LOCALES]) {
      let data: Record<string, string>[];
      try {
        data = await wago(game, n.table, locale);
      } catch (e) {
        if (!absent(e)) throw e;
        if (locale === "enUS") break; // (the table isn't in this game)
        continue; // (the floor below says it)
      }
      per[locale] = 0;
      db.transaction(() => {
        for (const r of data) {
          const name = r[n.name];
          if (!r.ID || !name) continue;
          const female = n.female && r[n.female] && r[n.female] !== name ? r[n.female] : null;
          const added = insert.run(n.kind, Number(r.ID), locale, name, female).changes;
          count += added;
          per[locale] += added;
        }
      })();
    }
    log(`names ${n.kind}: ${count}`);
    try {
      nameFloor(n.kind, game, per);
    } catch (e) {
      // (a short language's download out of the cache, named: the next run
      // fetches it again instead of failing on the same file)
      const gone = LOCALES.filter((l) => (per[l] ?? 0) < (per.enUS ?? 0) * 0.95).map((l) =>
        path.join(CACHE, "wago", game, PINS.builds[game].build, `${n.table}-${l}.csv`),
      );
      for (const f of gone) rmSync(f, { force: true });
      throw new Error(`${(e as Error).message} (removed from the cache: ${gone.map((f) => path.relative(ROOT, f)).join(", ")})`);
    }
  }
}

// Every language of a client table holds as many names as English, give or
// take (99.9% at least on 23 October 2026, every kind, both games): one well
// short is a download that went wrong, and its names would leave every addon.
export function nameFloor(kind: string, game: Game, per: Record<string, number>, floor = 0.95) {
  const english = per.enUS;
  if (!english) return;
  const short = LOCALES.filter((l) => (per[l] ?? 0) < english * floor);
  if (short.length)
    throw new Error(
      `names ${kind} in ${game}: ${short.map((l) => `${l} ${per[l] ?? "missing"}`).join(", ")} against enUS ${english}`,
    );
}

// A frozen file one of the games is meant to have: missing there, the build
// stops rather than drop its facts without a word.
function frozenFile(file: string, game: Game, games: Game[]): boolean {
  if (existsSync(file)) return true;
  if (games.includes(game)) throw new Error(`${path.relative(ROOT, file)} is missing: ${game}'s build reads it`);
  return false;
}

// ── the client's items (its rows win) ───────────────────────────────────────
function clientItems(db: Database) {
  const n = db.run(`INSERT INTO item
    SELECT s.ID, i.ClassID, i.SubclassID, s.OverallQualityID, s.InventoryType, s.ItemLevel, s.RequiredLevel,
           s.ContainerSlots, NULLIF(s.PageID, 0), NULLIF(s.StartQuestID, 0), NULL, NULL, 'client',
           CASE WHEN s.AllowableClass > 0 AND (s.AllowableClass & 1503) <> 1503 THEN s.AllowableClass END
    FROM client_ItemSparse s LEFT JOIN client_Item i ON i.ID = s.ID`).changes;
  log(`item (client): ${n}`);
  // (the standing an item asks: the client's, the Classic database's after)
  const gated = db.run(`INSERT INTO item_reputation
    SELECT ID, MinFactionID, MinReputation, 'client' FROM client_ItemSparse WHERE MinFactionID > 0`).changes;
  log(`item_reputation (client): ${gated}`);
}

// ── Questie's world ──────────────────────────────────────────────────────────
// Quests (who starts and ends them, what they ask, their requirements),
// NPCs and objects (levels, rank, flags, title, their spawns by zone and the
// paths they walk), the items the client lacks, and every name and quest
// text in its nine languages. Questie's own engine merged it (src/questie.ts).
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);
const slot = (v: unknown, i: number): unknown[] => {
  // (a Lua list with holes comes as an object: { "1": ..., "3": ... })
  if (Array.isArray(v)) return list(v[i - 1]);
  if (v && typeof v === "object") return list((v as Record<string, unknown>)[String(i)]);
  return [];
};
function questieWorld(db: Database, q: QuestieData) {
  const run = (label: string, fn: () => number) => {
    const t0 = performance.now();
    const n = db.transaction(fn)();
    log(`${label}: ${n} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  };
  const name = db.prepare("INSERT OR IGNORE INTO name VALUES (?, ?, ?, ?, NULL, 'questie')");
  const spawn = db.prepare("INSERT INTO spawn VALUES (?, NULL, ?, NULL, NULL, NULL, NULL, ?, NULL, ?, ?, 'questie', NULL, NULL)");
  // a table by zone: { zone: ... }. (Lua can't tell { [1] = ... } from a
  // list, so the export writes Dun Morogh's, zone 1, as an array: index i is
  // zone i + 1)
  const byZone = (v: unknown): [number, unknown][] =>
    Array.isArray(v) ? v.map((x, i) => [i + 1, x]) : Object.entries((v ?? {}) as Record<string, unknown>).map(([k, x]) => [Number(k), x]);
  // (spawns: { zone: [[x, y], ...] })
  const spawns = (kind: string, id: number, r: QuestieRecord) => {
    let n = 0;
    for (const [zone, points] of byZone(r.spawns))
      for (const p of list(points)) {
        const [x, y] = p as number[];
        if (typeof x === "number" && typeof y === "number") {
          spawn.run(kind, id, zone, x, y);
          n++;
        }
      }
    return n;
  };

  // NPCs: their spawns by zone, the paths they walk ({ zone: [ [ [x, y], ... ], ... ] })
  const creature = db.prepare(
    "INSERT INTO creature (id, min_level, max_level, rank, faction_id, npc_flags, friendly, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'questie')",
  );
  const pathPoint = db.prepare(
    "INSERT OR IGNORE INTO path VALUES ('creature', ?, ?, ?, NULL, NULL, NULL, NULL, ?, NULL, ?, ?, NULL, 'questie')",
  );
  run("creature (questie)", () => {
    let n = 0;
    for (const [sid, r] of Object.entries(q.npcs)) {
      const id = Number(sid);
      // (the sides it is friendly to: "A", "H", "AH", Questie's own word for it)
      const friendly = typeof r.friendlyToFaction === "string" && /^(A|H|AH)$/.test(r.friendlyToFaction) ? r.friendlyToFaction : null;
      creature.run(id, num(r.minLevel), num(r.maxLevel), num(r.rank), nz(r.factionID), num(r.npcFlags), friendly);
      if (typeof r.name === "string") name.run("creature", id, "enUS", r.name);
      if (typeof r.subName === "string" && r.subName) name.run("creature_subname", id, "enUS", r.subName);
      spawns("creature", id, r);
      let pathId = 0;
      for (const [zone, paths] of byZone(r.waypoints)) {
        const all = list(paths);
        // (one path as points, or several)
        const ways = all.length && Array.isArray(all[0]) && typeof (all[0] as unknown[])[0] === "number" ? [all] : all;
        for (const way of ways) {
          pathId++;
          list(way).forEach((p, i) => {
            const [x, y] = p as number[];
            if (typeof x === "number") pathPoint.run(id, pathId, i + 1, zone, x, y);
          });
        }
      }
      n++;
    }
    return n;
  });
  const object = db.prepare("INSERT INTO object (id, source) VALUES (?, 'questie')");
  run("object (questie)", () => {
    let n = 0;
    for (const [sid, r] of Object.entries(q.objects)) {
      const id = Number(sid);
      object.run(id);
      if (typeof r.name === "string") name.run("object", id, "enUS", r.name);
      spawns("object", id, r);
      n++;
    }
    return n;
  });
  // items the client lacks (its rows won: inserted first)
  const item = db.prepare(
    "INSERT OR IGNORE INTO item (id, class_id, subclass_id, item_level, required_level, start_quest_id, source) VALUES (?, ?, ?, ?, ?, ?, 'questie')",
  );
  run("item (questie)", () => {
    let n = 0;
    for (const [sid, r] of Object.entries(q.items)) {
      const id = Number(sid);
      n += item.run(id, num(r.class), num(r.subClass), num(r.itemLevel), num(r.requiredLevel), nz(r.startQuest)).changes;
      if (typeof r.name === "string") name.run("item", id, "enUS", r.name);
    }
    return n;
  });

  // quests
  const quest = db.prepare(
    `INSERT INTO quest (id, level, min_level, zone_id, sort_id, races, classes, skill_line_id, prev_id, next_in_chain, flags, src_item_id, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'questie')`,
  );
  const text = db.prepare("INSERT OR IGNORE INTO quest_text VALUES (?, ?, 'objectives', ?, 'questie')");
  const objective = db.prepare("INSERT OR IGNORE INTO quest_objective VALUES (?, ?, ?, ?, ?, ?, 'questie')");
  const relation = db.prepare("INSERT OR IGNORE INTO quest_relation VALUES (?, ?, ?, ?, 'questie')");
  const reward = db.prepare("INSERT INTO quest_reward VALUES (?, 'reputation', ?, ?, 'questie')");
  const prereq = db.prepare("INSERT OR IGNORE INTO quest_prereq VALUES (?, ?, ?, 'questie')");
  // (the standing it asks before it is offered: a floor, a ceiling, each a
  // [faction, value], the two merged when they name one faction)
  const standing = db.prepare(
    `INSERT INTO quest_standing VALUES (?, ?, ?, ?, 'questie')
     ON CONFLICT (quest_id, faction_id) DO UPDATE SET min_value = COALESCE(min_value, excluded.min_value),
       max_value = COALESCE(max_value, excluded.max_value)`,
  );
  const KINDS = ["creature", "object", "item"];
  run("quest (questie)", () => {
    let n = 0;
    for (const [sid, r] of Object.entries(q.quests)) {
      const id = Number(sid);
      const zone = num(r.zoneOrSort) ?? 0;
      const skill = list(r.requiredSkill)[0];
      const prev = list(r.preQuestSingle)[0] ?? list(r.preQuestGroup)[0];
      quest.run(
        id,
        num(r.questLevel),
        num(r.requiredLevel),
        zone > 0 ? zone : null,
        zone < 0 ? -zone : null,
        nz(r.requiredRaces),
        nz(r.requiredClasses),
        nz(skill),
        nz(prev),
        nz(r.nextQuestInChain),
        nz(r.questFlags),
        nz(r.sourceItemId),
      );
      if (typeof r.name === "string") name.run("quest", id, "enUS", r.name);
      for (const p of list(r.preQuestSingle)) if (typeof p === "number" && p) prereq.run(id, p, "any");
      for (const p of list(r.preQuestGroup)) if (typeof p === "number" && p) prereq.run(id, p, "all");
      const lines = list(r.objectivesText) as string[];
      if (lines.length) text.run(id, "enUS", lines.join("\n"));
      // what it asks: creatures, objects, items ([id, text?]), reputation ([faction, value]),
      // kill credits ([[ids], base creature, text]), spells ([spell, text, item]), items still needed
      const objectives = r.objectives;
      for (let k = 1; k <= 3; k++)
        slot(objectives, k).forEach((o, i) => {
          const [target, words] = list(o) as [number, string?];
          if (typeof target === "number") objective.run(id, i + 1, KINDS[k - 1], target, null, words ?? null);
        });
      const rep = slot(objectives, 4) as number[];
      if (typeof rep[0] === "number") objective.run(id, 1, "reputation", rep[0], rep[1] ?? null, null);
      slot(objectives, 5).forEach((o, i) => {
        const [, base, words] = list(o) as [unknown, number, string?];
        if (typeof base === "number") objective.run(id, 100 + i, "creature", base, null, words ?? null);
      });
      slot(objectives, 6).forEach((o, i) => {
        const [spell, words] = list(o) as [number, string?];
        if (typeof spell === "number") objective.run(id, i + 1, "spell", spell, null, words ?? null);
      });
      list(r.requiredSourceItems).forEach((it, i) => {
        if (typeof it === "number") objective.run(id, i + 1, "source", it, null, null);
      });
      // who starts it (creatures, objects, items) and ends it (creatures, objects)
      for (let k = 1; k <= 3; k++) for (const e of slot(r.startedBy, k)) if (typeof e === "number") relation.run(id, "start", KINDS[k - 1], e);
      for (let k = 1; k <= 2; k++) for (const e of slot(r.finishedBy, k)) if (typeof e === "number") relation.run(id, "end", KINDS[k - 1], e);
      for (const rr of list(r.reputationReward)) {
        const [faction, value] = list(rr) as number[];
        if (typeof faction === "number") reward.run(id, faction, value ?? null);
      }
      const [minFaction, minValue] = list(r.requiredMinRep) as number[];
      if (typeof minFaction === "number" && minFaction) standing.run(id, minFaction, minValue ?? null, null);
      const [maxFaction, maxValue] = list(r.requiredMaxRep) as number[];
      if (typeof maxFaction === "number" && maxFaction) standing.run(id, maxFaction, null, maxValue ?? null);
      n++;
    }
    return n;
  });

  // its nine languages: names, titles, quests' objectives
  run("names (questie)", () => {
    let n = 0;
    for (const [locale, tables] of Object.entries(q.l10n)) {
      for (const [sid, v] of Object.entries(tables.quests ?? {})) {
        const [title, lines] = list(v) as [string, unknown];
        if (typeof title === "string") n += name.run("quest", Number(sid), locale, title).changes;
        const objectives = list(lines) as string[];
        if (objectives.length) text.run(Number(sid), locale, objectives.join("\n"));
      }
      for (const [sid, v] of Object.entries(tables.npcs ?? {})) {
        const [nm, title] = list(v) as [string, string?];
        if (typeof nm === "string") n += name.run("creature", Number(sid), locale, nm).changes;
        if (typeof title === "string" && title) name.run("creature_subname", Number(sid), locale, title);
      }
      for (const [kind, key] of [
        ["object", "objects"],
        ["item", "items"],
      ] as const)
        for (const [sid, v] of Object.entries(tables[key] ?? {}))
          if (typeof v === "string") n += name.run(kind, Number(sid), locale, v).changes;
    }
    return n;
  });
}

// ── the Classic database: what Questie lacks ─────────────────────────────────
// Rows Questie owns get the Classic database's own columns only (a creature's
// type, family and models; an object's type, lock and page; a quest's type,
// next quest, details and rewards, its objectives' counts); a row Questie
// lacks comes whole. Loot odds, vendors, trainers, books, speech and the
// world's coordinates (spawns with their own id, paths) are its alone.
async function classicDb(db: Database, q: QuestieData) {
  const sql = gunzipSync(readFileSync(await classicDump())).toString("utf8");
  const owned = (table: string) =>
    new Set((db.query(`SELECT id FROM ${table} WHERE source = 'questie'`).all() as { id: number }[]).map((r) => r.id));
  const questieCreatures = owned("creature"),
    questieObjects = owned("object"),
    questieQuests = owned("quest");
  const name = db.prepare("INSERT OR IGNORE INTO name VALUES (?, ?, 'enUS', ?, NULL, 'classicdb')");
  const run = (label: string, fn: () => number) => {
    const t0 = performance.now();
    const n = db.transaction(fn)();
    log(`${label}: ${n} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  };

  // creatures and their spawns
  const creatures = rows(sql, "creature_template", 1);
  const insertCreature = db.prepare(
    "INSERT INTO creature VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'classicdb', ?, ?, ?, NULL)",
  );
  const creatureColumns = db.prepare(
    `UPDATE creature SET type_id = ?, family_id = ?, unit_class = ?, display_ids = ?, loot_id = ?,
     skin_loot_id = ?, pick_loot_id = ?, kill_credit = ?, trainer_type = ?, trainer_class = ?, unit_flags = ?,
     faction_id = ?, npc_flags = ?, min_level = COALESCE(?, min_level), max_level = COALESCE(?, max_level) WHERE id = ?`,
  );
  // (a creature Questie has keeps Questie's row, but its server-side fields are
  // the Classic database's, which a running server needs right: Questie's
  // npc flags leave out vendors and trainers (Katie Hunter, Murak Winterborn)
  // and its factions misplace some (Alterac Valley's miners under Orgrimmar's
  // template); its levels too, the game's own where Questie's are off (691
  // creatures: Riverpaw Overseer 19-20, Morganth 27, as both games' tooltips
  // show them; checked 15 October 2026); its ranks, which agree, stay)
  // (a trainer's kind, for a trainer only: TrainerType 0 is a class's, and every creature's default)
  const trainer = (r: Row) => ((num(r.NpcFlags) ?? 0) & 16 ? num(r.TrainerType) : null);
  run("creature", () => {
    for (const r of creatures) {
      const models = [r.ModelId1, r.ModelId2, r.ModelId3, r.ModelId4].filter((m) => nz(m)).join(",");
      const credit = [r.KillCredit1, r.KillCredit2].filter((m) => nz(m)).join(",");
      if (questieCreatures.has(num(r.Entry)!)) {
        creatureColumns.run(
          nz(r.CreatureType),
          nz(r.Family),
          nz(r.UnitClass),
          models || null,
          nz(r.LootId),
          nz(r.SkinningLootId),
          nz(r.PickpocketLootId),
          credit || null,
          trainer(r),
          nz(r.TrainerClass),
          num(r.UnitFlags),
          nz(r.Faction),
          num(r.NpcFlags),
          nz(r.MinLevel),
          nz(r.MaxLevel),
          num(r.Entry),
        );
        if (r.Name) name.run("creature", num(r.Entry), r.Name);
        continue;
      }
      insertCreature.run(
        num(r.Entry),
        num(r.MinLevel),
        num(r.MaxLevel),
        nz(r.CreatureType),
        nz(r.Family),
        num(r.Rank),
        nz(r.Faction),
        num(r.NpcFlags),
        nz(r.UnitClass),
        models || null,
        nz(r.LootId),
        nz(r.SkinningLootId),
        nz(r.PickpocketLootId),
        credit || null,
        trainer(r),
        nz(r.TrainerClass),
        num(r.UnitFlags),
      );
      if (r.Name) name.run("creature", num(r.Entry), r.Name);
      if (r.SubName) name.run("creature_subname", num(r.Entry), r.SubName);
    }
    return creatures.length;
  });
  const insertSpawn = db.prepare(
    "INSERT INTO spawn VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 'classicdb', ?, ?)",
  );
  for (const [table, kind] of [
    ["creature", "creature"],
    ["gameobject", "object"],
  ]) {
    const spawns = rows(sql, table);
    run(`spawn ${kind}`, () => {
      for (const r of spawns)
        insertSpawn.run(
          kind,
          num(r.guid),
          num(r.id),
          num(r.map),
          num(r.position_x),
          num(r.position_y),
          num(r.position_z),
          kind === "creature" ? num(r.MovementType) : null,
          kind === "creature" ? num(r.spawndist) : null,
        );
      return spawns.length;
    });
  }

  // the spawns another creature may take (a rare in an ordinary mob's place),
  // the things an object's spawn may be (one of a pool's chests, Atal'ai
  // artifacts), and spawn groups, whose spawns share their entries
  const insertSpawnEntry = db.prepare("INSERT OR IGNORE INTO spawn_entry VALUES (?, ?, ?, 'classicdb')");
  for (const [table, kind] of [
    ["creature_spawn_entry", "creature"],
    ["gameobject_spawn_entry", "object"],
  ]) {
    const entries = rows(sql, table);
    run(`spawn_entry ${kind}`, () => {
      for (const r of entries) insertSpawnEntry.run(kind, num(r.guid), num(r.entry));
      return entries.length;
    });
  }
  const groups = rows(sql, "spawn_group"),
    groupEntries = rows(sql, "spawn_group_entry"),
    groupSpawns = rows(sql, "spawn_group_spawn");
  const insertGroup = db.prepare("INSERT INTO spawn_group VALUES (?, ?, 'classicdb')");
  const insertGroupEntry = db.prepare("INSERT INTO spawn_group_entry VALUES (?, ?, 'classicdb')");
  const insertGroupSpawn = db.prepare("INSERT INTO spawn_group_spawn VALUES (?, ?, 'classicdb')");
  run("spawn_group", () => {
    for (const r of groups) insertGroup.run(num(r.Id), num(r.Type) === 1 ? "object" : "creature");
    for (const r of groupEntries) insertGroupEntry.run(num(r.Id), num(r.Entry));
    for (const r of groupSpawns) insertGroupSpawn.run(num(r.Id), num(r.Guid));
    return groups.length;
  });

  // a dungeon's encounters, what credits each (a boss's kill, most of them)
  const encounters = rows(sql, "instance_encounters");
  const insertEncounter = db.prepare("INSERT OR REPLACE INTO encounter VALUES (?, ?, ?, ?, 'classicdb')");
  run("encounter", () => {
    for (const r of encounters) insertEncounter.run(num(r.entry), num(r.creditType), num(r.creditEntry), nz(r.lastEncounterDungeon));
    return encounters.length;
  });
  // the graveyards and other safe places, the game's events (their names in name)
  const graves = rows(sql, "world_safe_locs");
  const insertGrave = db.prepare("INSERT OR REPLACE INTO graveyard VALUES (?, ?, ?, ?, ?, 'classicdb')");
  run("graveyard", () => {
    for (const r of graves) {
      insertGrave.run(num(r.id), num(r.map), num(r.x), num(r.y), num(r.z));
      if (r.name) name.run("graveyard", num(r.id), r.name);
    }
    return graves.length;
  });
  const events = rows(sql, "game_event");
  const insertEvent = db.prepare("INSERT OR REPLACE INTO game_event VALUES (?, ?, 'classicdb')");
  run("game_event", () => {
    for (const r of events) {
      insertEvent.run(num(r.entry), nz(r.holiday));
      if (r.description) name.run("game_event", num(r.entry), r.description);
    }
    return events.length;
  });

  // objects (a text's first page, a node's lock, a chest's loot)
  const objects = rows(sql, "gameobject_template", 1);
  const insertObject = db.prepare("INSERT INTO object VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'classicdb')");
  const objectColumns = db.prepare(
    "UPDATE object SET type = ?, display_id = ?, faction_id = ?, lock_id = ?, page_id = ?, loot_id = ?, data = ? WHERE id = ?",
  );
  run("object", () => {
    for (const r of objects) {
      const type = num(r.type);
      const data: number[] = [];
      for (let i = 0; i <= 23; i++) data.push(Number(r[`data${i}`] ?? 0));
      const insert = questieObjects.has(num(r.entry)!)
        ? (...v: (number | string | null)[]) => objectColumns.run(...v.slice(1), v[0])
        : (...v: (number | string | null)[]) => insertObject.run(...v);
      insert(
        num(r.entry),
        type,
        nz(r.displayId),
        nz(r.faction),
        type === 3 || type === 25 ? nz(data[0]) : null, // chest, fishing hole: data0 is the lock
        type === 9 ? nz(data[0]) : null, // text: data0 is its first page
        type === 3 || type === 25 ? nz(data[1]) : null,
        JSON.stringify(data),
      );
      if (r.name) name.run("object", num(r.entry), r.name);
    }
    return objects.length;
  });

  // items: the client's and Questie's first (their rows won), the database's for the rest
  const items = rows(sql, "item_template", 1);
  const insertItem = db.prepare(
    "INSERT OR IGNORE INTO item VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'classicdb', ?)",
  );
  const display = db.prepare("UPDATE item SET display_id = ? WHERE id = ? AND display_id IS NULL");
  const gate = db.prepare("INSERT OR IGNORE INTO item_reputation VALUES (?, ?, ?, 'classicdb')");
  const classes = db.prepare("UPDATE item SET allowable_class = ? WHERE id = ? AND allowable_class IS NULL");
  // (a mask holding every class is no limit: -1, 32767, 2047 as sources write it;
  // 1503 is the nine classes')
  const allowed = (r: Row) => {
    const mask = num(r.AllowableClass) ?? 0;
    return mask > 0 && (mask & 1503) !== 1503 ? mask : null;
  };
  run("item (database)", () => {
    let n = 0;
    for (const r of items) {
      n += insertItem.run(
        num(r.entry),
        num(r.class),
        num(r.subclass),
        num(r.Quality),
        num(r.InventoryType),
        num(r.ItemLevel),
        num(r.RequiredLevel),
        num(r.ContainerSlots),
        nz(r.PageText),
        nz(r.startquest),
        nz(r.displayid),
        allowed(r),
      ).changes;
      display.run(nz(r.displayid), num(r.entry));
      if (allowed(r)) classes.run(allowed(r), num(r.entry));
      if (r.name) name.run("item", num(r.entry), r.name);
      if (nz(r.RequiredReputationFaction))
        gate.run(num(r.entry), num(r.RequiredReputationFaction), num(r.RequiredReputationRank) ?? 0);
    }
    return n;
  });

  // quests: the quest, its texts, what it asks, who starts and ends it, what it gives
  const quests = rows(sql, "quest_template", 1);
  const insertPrereq = db.prepare("INSERT OR IGNORE INTO quest_prereq VALUES (?, ?, 'all', 'classicdb')");
  const insertQuest = db.prepare(
    "INSERT INTO quest VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, 'classicdb', ?, ?, ?, ?)",
  );
  const insertText = db.prepare("INSERT OR IGNORE INTO quest_text VALUES (?, 'enUS', ?, ?, 'classicdb')");
  const questColumns = db.prepare(
    "UPDATE quest SET type = ?, next_id = ?, special_flags = ?, exclusive_group = ?, src_item_id = COALESCE(src_item_id, ?), skill_line_id = COALESCE(skill_line_id, ?), skill_value = ? WHERE id = ?",
  );
  const exclusive = (r: Row) => ((num(r.ExclusiveGroup) ?? 0) > 0 ? num(r.ExclusiveGroup) : null);
  // (the standing it asks, for a quest Questie lacks: Questie's own are its)
  const standing = db.prepare(
    `INSERT INTO quest_standing VALUES (?, ?, ?, ?, 'classicdb')
     ON CONFLICT (quest_id, faction_id) DO UPDATE SET min_value = COALESCE(min_value, excluded.min_value),
       max_value = COALESCE(max_value, excluded.max_value)`,
  );
  // (Questie's objectives carry no count: the database's, where it asks the same thing)
  const objectiveCount = db.prepare(
    "UPDATE quest_objective SET count = ? WHERE quest_id = ? AND kind = ? AND target_id = ? AND source = 'questie' AND count IS NULL",
  );
  const insertObjective = db.prepare("INSERT INTO quest_objective VALUES (?, ?, ?, ?, ?, NULL, 'classicdb')");
  const insertReward = db.prepare("INSERT INTO quest_reward VALUES (?, ?, ?, ?, 'classicdb')");
  const TEXTS: [string, string][] = [
    ["details", "Details"],
    ["objectives", "Objectives"],
    ["request", "RequestItemsText"],
    ["reward", "OfferRewardText"],
    ["end", "EndText"],
    ["objective1", "ObjectiveText1"],
    ["objective2", "ObjectiveText2"],
    ["objective3", "ObjectiveText3"],
    ["objective4", "ObjectiveText4"],
  ];
  // (the items Questie's objectives name: an item asked that Questie leaves out
  // is the database's, a quest's own letter to deliver most of all: Questie
  // doesn't list the item a quest gave you at its start)
  const questieItems = new Set(
    (db.query("SELECT quest_id || ':' || target_id AS k FROM quest_objective WHERE kind = 'item' AND source = 'questie'").all() as { k: string }[]).map(
      (r) => r.k,
    ),
  );
  run("quest", () => {
    for (const r of quests) {
      const id = num(r.entry);
      const zone = num(r.ZoneOrSort) ?? 0;
      if (questieQuests.has(id!)) {
        // Questie's quest: the database's type, next quest, texts, rewards (not
        // reputation: Questie's), its objectives' counts
        questColumns.run(nz(r.Type), nz(r.NextQuestId), nz(r.SpecialFlags), exclusive(r), nz(r.SrcItemId), nz(r.RequiredSkill), nz(r.RequiredSkillValue), id);
        if ((num(r.RewOrReqMoney) ?? 0) > 0) insertReward.run(id, "money", 0, num(r.RewOrReqMoney));
        if (nz(r.PrevQuestId)) insertPrereq.run(id, num(r.PrevQuestId));
      if (r.Title) name.run("quest", id, r.Title);
        for (const [field, col] of TEXTS) if (r[col]) insertText.run(id, field, r[col]);
        for (let i = 1; i <= 4; i++) {
          const target = num(r[`ReqCreatureOrGOId${i}`]) ?? 0;
          if (target > 0) objectiveCount.run(num(r[`ReqCreatureOrGOCount${i}`]), id, "creature", target);
          if (target < 0) objectiveCount.run(num(r[`ReqCreatureOrGOCount${i}`]), id, "object", -target);
          if (nz(r[`ReqItemId${i}`])) {
            objectiveCount.run(num(r[`ReqItemCount${i}`]), id, "item", num(r[`ReqItemId${i}`]));
            if (!questieItems.has(`${id}:${num(r[`ReqItemId${i}`])}`))
              insertObjective.run(id, i, "item", num(r[`ReqItemId${i}`]), num(r[`ReqItemCount${i}`]));
          }
          if (nz(r[`ReqSourceId${i}`])) objectiveCount.run(num(r[`ReqSourceCount${i}`]), id, "source", num(r[`ReqSourceId${i}`]));
          if (nz(r[`RewItemId${i}`])) insertReward.run(id, "item", num(r[`RewItemId${i}`]), num(r[`RewItemCount${i}`]));
        }
        for (let i = 1; i <= 6; i++)
          if (nz(r[`RewChoiceItemId${i}`]))
            insertReward.run(id, "choice", num(r[`RewChoiceItemId${i}`]), num(r[`RewChoiceItemCount${i}`]));
        if (nz(r.RewSpell)) insertReward.run(id, "spell", num(r.RewSpell), null);
        if (nz(r.RewSpellCast)) insertReward.run(id, "cast", num(r.RewSpellCast), null);
        continue;
      }
      insertQuest.run(
        id,
        num(r.QuestLevel),
        num(r.MinLevel),
        zone > 0 ? zone : null,
        zone < 0 ? -zone : null,
        nz(r.Type),
        nz(r.RequiredRaces),
        nz(r.RequiredClasses),
        nz(r.RequiredSkill),
        nz(r.PrevQuestId),
        nz(r.NextQuestId),
        nz(r.NextQuestInChain),
        num(r.QuestFlags),
        nz(r.SpecialFlags),
        exclusive(r),
        nz(r.SrcItemId),
        nz(r.RequiredSkillValue),
      );
      if ((num(r.RewOrReqMoney) ?? 0) > 0) insertReward.run(id, "money", 0, num(r.RewOrReqMoney));
      if (r.Title) name.run("quest", id, r.Title);
      for (const [field, col] of TEXTS) if (r[col]) insertText.run(id, field, r[col]);
      let creatures = 0,
        objects = 0;
      for (let i = 1; i <= 4; i++) {
        const target = num(r[`ReqCreatureOrGOId${i}`]) ?? 0;
        if (target > 0) insertObjective.run(id, ++creatures, "creature", target, num(r[`ReqCreatureOrGOCount${i}`]));
        if (target < 0) insertObjective.run(id, ++objects, "object", -target, num(r[`ReqCreatureOrGOCount${i}`]));
        if (nz(r[`ReqItemId${i}`])) insertObjective.run(id, i, "item", num(r[`ReqItemId${i}`]), num(r[`ReqItemCount${i}`]));
        if (nz(r[`ReqSourceId${i}`]))
          insertObjective.run(id, i, "source", num(r[`ReqSourceId${i}`]), num(r[`ReqSourceCount${i}`]));
        if (nz(r[`ReqSpellCast${i}`])) insertObjective.run(id, i, "spell", num(r[`ReqSpellCast${i}`]), null);
        if (nz(r[`RewItemId${i}`])) insertReward.run(id, "item", num(r[`RewItemId${i}`]), num(r[`RewItemCount${i}`]));
      }
      for (let i = 1; i <= 6; i++)
        if (nz(r[`RewChoiceItemId${i}`]))
          insertReward.run(id, "choice", num(r[`RewChoiceItemId${i}`]), num(r[`RewChoiceItemCount${i}`]));
      for (let i = 1; i <= 5; i++)
        if (nz(r[`RewRepFaction${i}`]))
          insertReward.run(id, "reputation", num(r[`RewRepFaction${i}`]), num(r[`RewRepValue${i}`]));
      if (nz(r.RewSpell)) insertReward.run(id, "spell", num(r.RewSpell), null);
      if (nz(r.RewSpellCast)) insertReward.run(id, "cast", num(r.RewSpellCast), null);
      if (nz(r.RequiredMinRepFaction)) standing.run(id, num(r.RequiredMinRepFaction), num(r.RequiredMinRepValue), null);
      if (nz(r.RequiredMaxRepFaction)) standing.run(id, num(r.RequiredMaxRepFaction), null, num(r.RequiredMaxRepValue));
    }
    return quests.length;
  });

  // the reputation kills give, up to two factions a creature, each with the
  // last standing it still counts at; TeamDependent: the first the Alliance's,
  // the second the Horde's
  const kill = db.prepare("INSERT OR IGNORE INTO kill_reputation VALUES (?, ?, ?, ?, ?, ?, 'classicdb')");
  run("kill_reputation", () => {
    let n = 0;
    for (const r of rows(sql, "creature_onkill_reputation")) {
      const team = num(r.TeamDependent) === 1;
      for (const i of [1, 2]) {
        const faction = num(r[`RewOnKillRepFaction${i}`]) ?? 0;
        const value = num(r[`RewOnKillRepValue${i}`]) ?? 0;
        if (faction <= 0 || value === 0) continue;
        n += kill.run(
          num(r.creature_id),
          faction,
          value,
          num(r[`MaxStanding${i}`]),
          num(r[`IsTeamAward${i}`]) ? 1 : null,
          team ? (i === 1 ? "A" : "H") : null,
        ).changes;
      }
    }
    return n;
  });
  // what the Classic database lacks or gets wrong, by hand (data/kill-reputation.json)
  run("kill_reputation guides", () => {
    const file: {
      add: { faction: number; creatures: number[]; value: number; max_standing: number }[];
      caps: { faction: number; max_standing: number }[];
    } = JSON.parse(readFileSync(path.join(ROOT, "data", "kill-reputation.json"), "utf8"));
    db.prepare("INSERT INTO source VALUES (?, ?, ?, ?)").run("guides", "data/kill-reputation.json (frozen)", null, "the guides' figures, cited in each entry");
    const has = db.prepare("SELECT source FROM kill_reputation WHERE creature_id = ? AND faction_id = ?");
    const add = db.prepare("INSERT INTO kill_reputation VALUES (?, ?, ?, ?, NULL, NULL, 'guides')");
    const cap = db.prepare("UPDATE kill_reputation SET max_standing = ?, source = 'guides' WHERE faction_id = ? AND value > 0");
    let n = 0;
    for (const a of file.add)
      for (const c of a.creatures) {
        const there = has.get(c, a.faction) as { source: string } | null;
        if (there) throw new Error(`kill-reputation.json: ${c} for ${a.faction} is in ${there.source} now: drop the entry, or make it a cap`);
        n += add.run(c, a.faction, a.value, a.max_standing).changes;
      }
    for (const c of file.caps) n += cap.run(c.max_standing, c.faction).changes;
    return n;
  });
  const insertRelation = db.prepare("INSERT INTO quest_relation VALUES (?, ?, ?, ?, 'classicdb')");
  for (const [table, role, kind] of [
    ["creature_questrelation", "start", "creature"],
    ["creature_involvedrelation", "end", "creature"],
    ["gameobject_questrelation", "start", "object"],
    ["gameobject_involvedrelation", "end", "object"],
  ]) {
    const data = rows(sql, table);
    // (who starts and ends a quest: Questie's, the database's only for a quest Questie lacks)
    run(`quest_relation ${table}`, () => {
      let n = 0;
      for (const r of data)
        if (!questieQuests.has(num(r.quest)!)) {
          insertRelation.run(num(r.quest), role, kind, num(r.id));
          n++;
        }
      return n;
    });
  }
  run("quest_relation item", () => {
    let n = 0;
    for (const r of items)
      if (nz(r.startquest) && !questieQuests.has(num(r.startquest)!)) {
        insertRelation.run(num(r.startquest), "start", "item", num(r.entry));
        n++;
      }
    return n;
  });
  // loot, vendors, trainers
  const insertLoot = db.prepare("INSERT INTO loot VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'classicdb', ?)");
  const insertQuestieLoot = db.prepare("INSERT INTO loot VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, 'questie', NULL)");
  // (a condition of an active game event, type 12: the event; Winter or Summer Season Fishing)
  const eventOf = new Map<number, number>();
  for (const r of rows(sql, "conditions")) if (num(r.type) === 12) eventOf.set(num(r.condition_entry)!, num(r.value1)!);
  for (const [table, kind] of [
    ["creature_loot_template", "creature"],
    ["gameobject_loot_template", "object"],
    ["item_loot_template", "item"],
    ["fishing_loot_template", "fishing"],
    ["skinning_loot_template", "skinning"],
    ["pickpocketing_loot_template", "pickpocket"],
    ["disenchant_loot_template", "disenchant"],
    ["reference_loot_template", "reference"],
  ]) {
    const data = rows(sql, table);
    run(`loot ${kind}`, () => {
      for (const r of data) {
        const ref = (num(r.mincountOrRef) ?? 0) < 0 ? -(num(r.mincountOrRef) as number) : null;
        insertLoot.run(
          kind,
          num(r.entry),
          ref ? null : num(r.item),
          ref,
          num(r.ChanceOrQuestChance),
          num(r.groupid),
          ref ? null : num(r.mincountOrRef),
          num(r.maxcount),
          eventOf.get(num(r.condition_id) ?? 0) ?? null,
        );
      }
      return data.length;
    });
  }
  // (Questie's drops where the database has none for the item: Forever's own)
  run("loot (questie)", () => {
    const dropped = new Set((db.query("SELECT DISTINCT item_id AS id FROM loot WHERE item_id IS NOT NULL").all() as { id: number }[]).map((r) => r.id));
    let n = 0;
    for (const [sid, it] of Object.entries(q.items)) {
      const id = Number(sid);
      if (dropped.has(id)) continue;
      for (const [field, kind] of [
        ["npcDrops", "creature"],
        ["objectDrops", "object"],
        ["itemDrops", "item"],
      ] as const)
        for (const from of (it[field] ?? []) as number[]) {
          insertQuestieLoot.run(kind, from, id);
          n++;
        }
    }
    return n;
  });
  const vendorTemplate = new Map<number, Row[]>();
  for (const r of rows(sql, "npc_vendor_template")) {
    const list = vendorTemplate.get(num(r.entry)!) ?? [];
    list.push(r);
    vendorTemplate.set(num(r.entry)!, list);
  }
  const insertVendor = db.prepare("INSERT INTO vendor VALUES (?, ?, 'classicdb', ?, ?)");
  // (a limited stock: maxcount held at once, one more every incrtime seconds)
  const stock = (r: Row): [number | null, number | null] => (nz(r.maxcount) ? [num(r.maxcount), nz(r.incrtime)] : [null, null]);
  run("vendor", () => {
    let n = 0;
    for (const r of rows(sql, "npc_vendor")) {
      insertVendor.run(num(r.entry), num(r.item), ...stock(r));
      n++;
    }
    for (const c of creatures)
      for (const r of vendorTemplate.get(num(c.VendorTemplateId) ?? 0) ?? []) {
        insertVendor.run(num(c.Entry), num(r.item), ...stock(r));
        n++;
      }
    return n;
  });
  // (Questie's vendors for an item the database sells nowhere)
  const sold = new Set((db.query("SELECT DISTINCT item_id AS id FROM vendor").all() as { id: number }[]).map((r) => r.id));
  const insertQuestieVendor = db.prepare("INSERT INTO vendor VALUES (?, ?, 'questie', NULL, NULL)");
  run("vendor (questie)", () => {
    let n = 0;
    for (const [sid, it] of Object.entries(q.items))
      if (!sold.has(Number(sid)))
        for (const npc of (it.vendors ?? []) as number[]) {
          insertQuestieVendor.run(npc, Number(sid));
          n++;
        }
    return n;
  });
  const trainerTemplate = new Map<number, Row[]>();
  for (const r of rows(sql, "npc_trainer_template")) {
    const list = trainerTemplate.get(num(r.entry)!) ?? [];
    list.push(r);
    trainerTemplate.set(num(r.entry)!, list);
  }
  const insertTrainer = db.prepare("INSERT INTO trainer_spell VALUES (?, ?, ?, ?, ?, ?, 'classicdb', ?)");
  const teach = (npc: number | null, r: Row) =>
    insertTrainer.run(
      npc,
      num(r.spell),
      num(r.spellcost),
      num(r.reqlevel),
      nz(r.reqskill),
      nz(r.reqskillvalue),
      nz(r.ReqAbility1),
    );
  run("trainer_spell", () => {
    let n = 0;
    for (const r of rows(sql, "npc_trainer")) {
      teach(num(r.entry), r);
      n++;
    }
    for (const c of creatures)
      for (const r of trainerTemplate.get(num(c.TrainerTemplateId) ?? 0) ?? []) {
        teach(num(c.Entry), r);
        n++;
      }
    return n;
  });

  // what is written in the world: a text object's or an item's page chain
  const pages = new Map<number, Row>(rows(sql, "page_text", 1).map((r) => [num(r.entry)!, r]));
  const insertReadable = db.prepare("INSERT OR IGNORE INTO readable VALUES (?, ?, ?, NULL, 'classicdb')");
  const insertPage = db.prepare("INSERT OR IGNORE INTO readable_page VALUES (?, ?, 'enUS', ?, ?, 'classicdb')");
  const readable = (kind: string, id: number, first: number) => {
    insertReadable.run(kind, id, first);
    let page: number | null = first,
      idx = 0;
    const seen = new Set<number>();
    while (page && pages.has(page) && !seen.has(page)) {
      seen.add(page);
      const p: Row = pages.get(page)!;
      insertPage.run(kind, id, ++idx, String(p.text ?? ""));
      page = nz(p.next_page);
    }
  };
  run("readable", () => {
    let n = 0;
    for (const r of objects)
      if (num(r.type) === 9 && nz(r.data0)) {
        readable("object", num(r.entry)!, num(r.data0)!);
        n++;
      }
    for (const r of items)
      if (nz(r.PageText)) {
        readable("item", num(r.entry)!, num(r.PageText)!);
        n++;
      }
    return n;
  });

  // what npcs say: English and the database's translations
  const insertSpeech = db.prepare("INSERT OR IGNORE INTO speech VALUES (?, ?, ?, ?, ?, 'classicdb')");
  const speech = rows(sql, "broadcast_text", 1);
  const language = new Map<number, number | null>();
  run("speech enUS", () => {
    for (const r of speech) {
      language.set(num(r.Id)!, nz(r.LanguageID));
      insertSpeech.run(num(r.Id), "enUS", r.Text || null, r.Text1 || null, nz(r.LanguageID));
    }
    return speech.length;
  });
  const translated = rows(sql, "broadcast_text_locale");
  run("speech translated", () => {
    for (const r of translated)
      insertSpeech.run(num(r.Id), r.Locale, r.Text_lang || null, r.Text1_lang || null, language.get(num(r.Id)!) ?? null);
    return translated.length;
  });

  // what npcs say when their window opens: a creature's gossip menu, its
  // texts broadcast texts (every language speech has) or npc_text's (English)
  const menus = new Map<number, Row[]>();
  for (const r of rows(sql, "gossip_menu")) menus.set(num(r.entry)!, [...(menus.get(num(r.entry)!) ?? []), r]);
  const broadcast = new Map<number, Row>(rows(sql, "npc_text_broadcast_text").map((r) => [num(r.Id)!, r]));
  const npcText = new Map<number, Row>(rows(sql, "npc_text", 1).map((r) => [num(r.ID)!, r]));
  const insertGossip = db.prepare("INSERT OR IGNORE INTO gossip VALUES (?, ?, ?, ?, 'enUS', ?, ?, ?, NULL, ?, 'classicdb')");
  const insertBroadcast = db.prepare(
    `INSERT OR IGNORE INTO gossip SELECT ?, ?, ?, ?, locale, text, text_female, ?, id, ?, 'classicdb'
     FROM speech WHERE id = ? AND COALESCE(text, text_female) IS NOT NULL`,
  );
  run("gossip", () => {
    let n = 0;
    for (const c of creatures) {
      const menu = nz(c.GossipMenuId);
      if (!menu) continue;
      for (const m of menus.get(menu) ?? []) {
        const textId = num(m.text_id)!,
          condition = num(m.condition_id) ?? 0;
        const b = broadcast.get(textId),
          t = npcText.get(textId);
        for (let i = 0; i < 8; i++) {
          if (b && nz(b[`BroadcastTextId${i}`]))
            n += insertBroadcast.run(num(c.Entry), menu, textId, i, num(b[`Prob${i}`]), condition, num(b[`BroadcastTextId${i}`])).changes;
          else if (t && (t[`text${i}_0`] || t[`text${i}_1`]))
            n += insertGossip.run(num(c.Entry), menu, textId, i, t[`text${i}_0`] || null, t[`text${i}_1`] || null, num(t[`prob${i}`]), condition).changes;
        }
      }
    }
    return n;
  });
  // every menu's text by the menu, and the choices that lead from one to the
  // next: the pages of a tale an npc tells over several windows
  const insertMenuText = db.prepare("INSERT OR IGNORE INTO gossip_page VALUES (?, ?, ?, 'enUS', ?, ?, ?, NULL, ?, 'classicdb')");
  const insertMenuTextBroadcast = db.prepare(
    `INSERT OR IGNORE INTO gossip_page SELECT ?, ?, ?, locale, text, text_female, ?, id, ?, 'classicdb'
     FROM speech WHERE id = ? AND COALESCE(text, text_female) IS NOT NULL`,
  );
  run("gossip page", () => {
    let n = 0;
    for (const [menu, rows] of menus)
      for (const m of rows) {
        const textId = num(m.text_id)!,
          condition = num(m.condition_id) ?? 0;
        const b = broadcast.get(textId),
          t = npcText.get(textId);
        for (let i = 0; i < 8; i++) {
          if (b && nz(b[`BroadcastTextId${i}`])) n += insertMenuTextBroadcast.run(menu, textId, i, num(b[`Prob${i}`]), condition, num(b[`BroadcastTextId${i}`])).changes;
          else if (t && (t[`text${i}_0`] || t[`text${i}_1`]))
            n += insertMenuText.run(menu, textId, i, t[`text${i}_0`] || null, t[`text${i}_1`] || null, num(t[`prob${i}`]), condition).changes;
        }
      }
    return n;
  });
  const insertChoice = db.prepare("INSERT OR IGNORE INTO gossip_option VALUES (?, ?, 'enUS', ?, NULL, NULL, ?, ?, 'classicdb')");
  const insertChoiceBroadcast = db.prepare(
    `INSERT OR IGNORE INTO gossip_option SELECT ?, ?, locale, text, text_female, id, ?, ?, 'classicdb'
     FROM speech WHERE id = ? AND COALESCE(text, text_female) IS NOT NULL`,
  );
  const options = rows(sql, "gossip_menu_option");
  run("gossip option", () => {
    let n = 0;
    for (const o of options) {
      const next = (num(o.action_menu_id) ?? 0) > 0 ? num(o.action_menu_id) : null,
        condition = num(o.condition_id) ?? 0,
        said = nz(o.option_broadcast_text);
      if (said) n += insertChoiceBroadcast.run(num(o.menu_id), num(o.id), next, condition, said).changes;
      else n += insertChoice.run(num(o.menu_id), num(o.id), o.option_text || null, next, condition).changes;
    }
    return n;
  });

  // the way creatures walk: one spawn's own path, a creature's
  const insertPath = db.prepare("INSERT OR IGNORE INTO path VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, NULL, ?, 'classicdb')");
  const movement = rows(sql, "creature_movement");
  run("path spawn", () => {
    for (const r of movement)
      insertPath.run("spawn", num(r.Id), 0, num(r.Point), num(r.PositionX), num(r.PositionY), num(r.PositionZ), num(r.WaitTime));
    return movement.length;
  });
  db.run("UPDATE path SET map_id = (SELECT map_id FROM spawn WHERE kind = 'creature' AND spawn_id = path.owner_id) WHERE owner = 'spawn'");
  const template = rows(sql, "creature_movement_template");
  run("path creature", () => {
    for (const r of template)
      insertPath.run(
        "creature",
        num(r.Entry),
        num(r.PathId),
        num(r.Point),
        num(r.PositionX),
        num(r.PositionY),
        num(r.PositionZ),
        num(r.WaitTime),
      );
    return template.length;
  });
}

// ── the TBC Anniversary client's items (data/tbc/items.json, bin/tbc-items.ts) ─
// what an addon's TBC package names and neither client has: Classic Era's
// database (the TBC packages read Classic Era's files), source tbc, where it
// names no such item
function tbcItems(db: Database) {
  const file = path.join(ROOT, "data", "tbc", "items.json");
  if (!frozenFile(file, "classic", ["classic"])) return;
  const frozen = JSON.parse(readFileSync(file, "utf8")) as { product: string; build: string; items: Record<string, Record<string, string>> };
  db.prepare("INSERT INTO source VALUES (?, ?, ?, ?)").run("tbc", `${frozen.product} ${frozen.build} (frozen: data/tbc/items.json)`, "https://wago.tools", "Blizzard's");
  const insert = db.prepare("INSERT OR IGNORE INTO name VALUES ('item', ?, ?, ?, NULL, 'tbc')");
  let n = 0;
  db.transaction(() => {
    for (const [id, names] of Object.entries(frozen.items))
      for (const [locale, name] of Object.entries(names)) n += insert.run(Number(id), locale, name).changes;
  })();
  log(`names tbc: ${n}`);
}

// ── Wowhead's names (data/wowhead/<game>/<locale>.json, bin/names.ts) ────────
// where the client has none: its own win (inserted first). What the client
// shows in English, of a thing whose English comes later, is handed back.
type Shown = [kind: string, id: number, locale: string];
function wowheadNames(db: Database, game: Game): Shown[] {
  const later: Shown[] = [];
  const dir = path.join(ROOT, "data", "wowhead", game);
  if (!frozenFile(dir, game, ["classic", "forever"])) return later;
  const insert = db.prepare("INSERT OR IGNORE INTO name VALUES (?, ?, ?, ?, NULL, 'wowhead')");
  const shownInEnglish = db.prepare("INSERT OR IGNORE INTO name VALUES (?, ?, ?, ?, NULL, 'english')");
  // The game's own names (Wowhead mines them from each client), which win over
  // Questie's where they truly differ: Questie's translations lag the
  // clients' (Forever's "Sentinelle de Dolanaar", "Finkle Einhorn"; Classic
  // Era's French keeps "Le seigneur de Blackrock", "Goulet des Warsong", where
  // Questie has the later "Rochenoire", "Chanteguerres"). Not a placeholder,
  // nor the English left in.
  const current = db.prepare("SELECT name, source FROM name WHERE kind = ? AND id = ? AND locale = ?");
  const english = db.prepare("SELECT name FROM name WHERE kind = ? AND id = ? AND locale = 'enUS'");
  const replace = db.prepare("UPDATE name SET name = ?, source = 'wowhead' WHERE kind = ? AND id = ? AND locale = ?");
  const fold = (s: string) => s.replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();
  for (const f of readdirSync(dir).filter((f) => /^[a-z]{2}[A-Z]{2}\.json$/.test(f))) {
    const locale = f.slice(0, -5);
    const names = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Record<string, Record<string, string>>;
    let n = 0,
      renamed = 0,
      shown = 0;
    db.transaction(() => {
      for (const [kind, byId] of Object.entries(names))
        for (const [id, name] of Object.entries(byId)) {
          // (a name in brackets: Wowhead's English where the language's client has
          // none; the client shows the English: the language's name is it, so
          // that every language names what its client shows, of a source of its
          // own, "english": no translation, which a glossary leaves out)
          if (/^\[.*\]$/.test(name)) {
            const en = (english.get(kind, Number(id)) as { name: string } | null)?.name;
            // (not a placeholder of the English's own: "[DNT] Kill Credit")
            if (en && !en.startsWith("[")) shown += shownInEnglish.run(kind, Number(id), locale, en).changes;
            // (an English of Wowhead's pages or the players', Forever's own: the Dalaran Tome)
            else if (!en) later.push([kind, Number(id), locale]);
            continue;
          }
          const had = current.get(kind, Number(id), locale) as { name: string; source: string } | null;
          if (had && had.source === "questie" && fold(had.name) !== fold(name) && !/^\[|<PH>|\bUNUSED\b/i.test(name)) {
            const en = (english.get(kind, Number(id)) as { name: string } | null)?.name;
            if (!en || fold(en) !== fold(name)) renamed += replace.run(name, kind, Number(id), locale).changes;
            continue;
          }
          n += insert.run(kind, Number(id), locale, name).changes;
        }
    })();
    log(
      `names wowhead ${locale}: ${n}${renamed ? `, ${renamed} of the game's own over Questie's` : ""}${shown ? `, ${shown} the client shows in English` : ""}`,
    );
  }
  return later;
}
// (once Wowhead's pages and the players have named them in English: Harrigen
// <The Undermarket> in every language Wowhead gives him in brackets)
function shownInEnglishLater(db: Database, later: Shown[]) {
  const english = db.prepare("SELECT name FROM name WHERE kind = ? AND id = ? AND locale = 'enUS'");
  const insert = db.prepare("INSERT OR IGNORE INTO name VALUES (?, ?, ?, ?, NULL, 'english')");
  let n = 0;
  db.transaction(() => {
    for (const [kind, id, locale] of later) {
      const en = (english.get(kind, id) as { name: string } | null)?.name;
      if (en && !en.startsWith("[")) n += insert.run(kind, id, locale, en).changes;
    }
  })();
  log(`names the client shows in English, named in English later: ${n} of ${later.length}`);
}

// ── a language's sibling (esMX takes esES's name where it has none) ───────────
// Latin American Spanish is Spain's, bar a few names: where esMX has no name
// of a thing (no row, or only the English its client shows) and esES has one,
// esMX takes esES's, of the source `esES`, so an addon names it like any
// real name and a real esMX name, once a source gives it, wins on the next
// build (the user's call, 26 October 2026). The other languages have no
// sibling: German, French, Russian and the rest stay as their sources leave
// them (docs/sources.md).
const SIBLINGS: [locale: string, from: string][] = [["esMX", "esES"]];
function siblingNames(db: Database) {
  db.prepare("INSERT INTO source VALUES (?, ?, ?, ?)").run("esES", "the esES name, where esMX has none", "https://wago.tools", "Blizzard's (Spain's Spanish, where Latin America's has no name)");
  for (const [locale, from] of SIBLINGS) {
    // (the English an esMX row holds is no name: replaced; only a real name is lent)
    // (nor a placeholder of the lender's: "[UNUSED] Sulhasa", "<PH>"; nor the English
    // it holds untranslated: a name equal to enUS's is no Spanish, the esMX row stays
    // english, unless the client itself writes it so)
    const real = `f.source <> 'english' AND f.name NOT LIKE '[%' AND f.name NOT LIKE '%<PH>%' AND f.name NOT LIKE '%UNUSED%' AND (f.source = 'client' OR NOT EXISTS (SELECT 1 FROM name u WHERE u.kind = f.kind AND u.id = f.id AND u.locale = 'enUS' AND u.name = f.name))`;
    const gone = db.prepare(`DELETE FROM name WHERE locale = ? AND source = 'english' AND EXISTS (SELECT 1 FROM name f WHERE f.kind = name.kind AND f.id = name.id AND f.locale = ? AND ${real})`).run(locale, from).changes;
    const lent = db
      .prepare(
        `INSERT OR IGNORE INTO name SELECT kind, id, ?, name, female, 'esES' FROM name f WHERE f.locale = ? AND ${real}`,
      )
      .run(locale, from).changes;
    log(`names ${locale} from ${from}: ${lent} (${gone} of them the English it showed)`);
  }
}

// ── Wowhead's ranks (data/wowhead/<game>/ranks.json) ──────────────────────
// A creature's rank where Questie gives none (Forever's own: its traces
// don't tell a rare from the rest), from the frozen tooltips ("Niveau 10 Bête
// (Rare)"). Questie's own ranks are never changed.
function wowheadRanks(db: Database, game: Game) {
  const file = path.join(ROOT, "data", "wowhead", game, "ranks.json");
  if (!frozenFile(file, game, ["forever"])) return;
  const ranks = JSON.parse(readFileSync(file, "utf8")) as Record<string, number>;
  const set = db.prepare("UPDATE creature SET rank = ? WHERE id = ? AND rank IS NULL");
  let n = 0;
  db.transaction(() => {
    for (const [id, rank] of Object.entries(ranks)) n += set.run(rank, Number(id)).changes;
  })();
  log(`ranks wowhead: ${n}`);
}

// ── Wowhead's points (data/wowhead/<game>/points.json) ────────────────────
// Where Wowhead's players met a creature or an object, by zone (percent of
// the zone's map), frozen by bin/wowhead-points.ts for what the addons need
// (a roaming rare's haunts, a book's copies): spawns of source wowhead, in
// Wowhead's order.
function wowheadPoints(db: Database, game: Game) {
  const file = path.join(ROOT, "data", "wowhead", game, "points.json");
  if (!frozenFile(file, game, ["classic", "forever"])) return;
  const points = JSON.parse(readFileSync(file, "utf8")) as Record<string, Record<string, Record<string, [number, number][]>>>;
  const insert = db.prepare("INSERT INTO spawn VALUES (?, NULL, ?, NULL, NULL, NULL, NULL, ?, NULL, ?, ?, 'wowhead', NULL, NULL)");
  let n = 0;
  db.transaction(() => {
    for (const [kind, byId] of Object.entries(points))
      for (const [id, byArea] of Object.entries(byId))
        for (const [area, pts] of Object.entries(byArea))
          for (const [x, y] of pts) n += insert.run(kind === "npc" ? "creature" : kind, Number(id), Number(area), x, y).changes;
  })();
  log(`spawns wowhead: ${n}`);
}

// ── AllTheThings' rewards (data/allthethings/<game>/rewards.json) ──────────
// The items a quest rewards, for the quests no other source gives any to
// (Forever's own: Questie keeps no rewards, the Classic database knows them
// not): AllTheThings' Forever database (MIT), frozen at the commit in the
// file's own source row, never fetched again.
const ATT_COMMIT = "a21caf2a7ec636785505a7f4e7e4311d16ce28af";
// AllTheThings' prerequisites (data/allthethings/<game>/prereqs.json): every
// one of them needed first, for the quests no other source gives any to
// (Forever's own chains Questie doesn't link: "Murloc Gills", then "The State
// of the Mines"), frozen as its rewards.
function attPrereqs(db: Database, game: Game) {
  const file = path.join(ROOT, "data", "allthethings", game, "prereqs.json");
  if (!frozenFile(file, game, ["forever"])) return;
  const prereqs = JSON.parse(readFileSync(file, "utf8")) as Record<string, number[]>;
  const has = db.prepare("SELECT 1 FROM quest_prereq WHERE quest_id = ? LIMIT 1");
  const known = db.prepare("SELECT prev_id FROM quest WHERE id = ?");
  const insert = db.prepare("INSERT OR IGNORE INTO quest_prereq VALUES (?, ?, 'all', 'allthethings')");
  const setPrev = db.prepare("UPDATE quest SET prev_id = ? WHERE id = ? AND prev_id IS NULL");
  let n = 0;
  db.transaction(() => {
    for (const [id, prevs] of Object.entries(prereqs)) {
      if (!known.get(Number(id)) || has.get(Number(id))) continue;
      for (const p of prevs) n += insert.run(Number(id), p).changes;
      if (prevs[0]) setPrev.run(prevs[0], Number(id));
    }
  })();
  log(`prerequisites allthethings: ${n}`);
}

function attRewards(db: Database, game: Game) {
  const file = path.join(ROOT, "data", "allthethings", game, "rewards.json");
  if (!frozenFile(file, game, ["forever"])) return;
  const rewards = JSON.parse(readFileSync(file, "utf8")) as Record<string, number[]>;
  const has = db.prepare("SELECT 1 FROM quest_reward WHERE quest_id = ? AND kind IN ('item', 'choice') LIMIT 1");
  const known = db.prepare("SELECT 1 FROM quest WHERE id = ?");
  const insert = db.prepare("INSERT INTO quest_reward VALUES (?, 'item', ?, NULL, 'allthethings')");
  let n = 0;
  db.transaction(() => {
    for (const [id, items] of Object.entries(rewards)) {
      if (!known.get(Number(id)) || has.get(Number(id))) continue;
      for (const item of items) n += insert.run(Number(id), item).changes;
    }
  })();
  db.prepare("INSERT OR REPLACE INTO source VALUES ('allthethings', ?, 'https://github.com/ATTWoWAddon/AllTheThings', 'MIT')").run(
    `${ATT_COMMIT.slice(0, 12)} (frozen: data/allthethings)`,
  );
  log(`rewards allthethings: ${n}`);
}

// ── Wowhead's book pages (data/wowhead/<game>/books-<locale>.json) ──────────
// A text's pages in another language, saved from Wowhead's pages in a
// browser (they don't answer scripts): { "o<object id>" | "i<item id>": [
// HTML pages ] }. Kept as the game writes them: its markup turned back into
// the game's own (lines, $N $C $R, $gmale:female;), nothing else changed.
// Wowhead writes the reader's name, class and race in the page's language
// (<nom>, <Klasse>) and a gendered word as <male/female> ("der
// Überbringer/die Überbringerin"); any other <...> is the game's own aside
// (<texte illisible>, <unleserlicher Text>), kept.
function wowheadBooks(db: Database, game: Game) {
  const dir = path.join(ROOT, "data", "wowhead", game);
  if (!frozenFile(path.join(dir, "books-enUS.json"), game, ["forever"])) return;
  const readable = db.prepare("INSERT OR IGNORE INTO readable VALUES (?, ?, NULL, NULL, 'wowhead')");
  const page = db.prepare("INSERT OR IGNORE INTO readable_page VALUES (?, ?, ?, ?, ?, 'wowhead')");
  for (const f of readdirSync(dir).filter((f) => /^books-[a-z]{2}[A-Z]{2}\.json$/.test(f))) {
    const locale = f.slice(6, -5);
    const books = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Record<string, string[]>;
    let n = 0;
    db.transaction(() => {
      for (const [key, pages] of Object.entries(books)) {
        const kind = key[0] === "o" ? "object" : "item",
          id = Number(key.slice(1));
        readable.run(kind, id);
        pages.forEach((html, i) => (n += page.run(kind, id, locale, i + 1, gamePage(html)).changes));
      }
    })();
    log(`readable pages wowhead ${locale}: ${n}`);
  }
}

// ── Questie's own zone ids, made the game's ─────────────────────────────────
// Questie names a few places by ids of its own that the client's AreaTable
// doesn't have (its support/Zones/uiMapIdToAreaId.lua: an instance's wing,
// 10026 for Dire Maul's Warpwood Quarter, 1585 Blackrock Depths; a whole
// continent's map, 10073 Kalimdor, 10074 the Eastern Kingdoms, 10089 Azeroth).
// A spawn under one gets the game's zone, from where its creature or object
// stands: in an instance, the map most of them stand on in the Classic
// database (one vote each), then the Map table's AreaTableID, else the one
// area at the map's top; on a continent, the one zone whose client
// UiMapAssignment regions hold each one's spot (all its spawns agreeing; two
// zones' regions overlapping there, Blackrock Mountain's between Searing
// Gorge and the Burning Steppes: none); none where neither says, never an id
// the game doesn't know. A spot's percents keep the map they are on: the
// UiMap Questie's id stands for (its table), where the spawn has one.
function questieZones(db: Database, zoneMaps: Map<number, number>) {
  db.transaction(() => {
    const priv = (
      db
        .query("SELECT DISTINCT area_id FROM spawn WHERE source = 'questie' AND area_id IS NOT NULL AND area_id NOT IN (SELECT ID FROM client_AreaTable)")
        .all() as { area_id: number }[]
    ).map((r) => r.area_id);
    if (!priv.length) return;
    const instances = new Set((db.query("SELECT ID FROM client_Map WHERE InstanceType > 0").all() as { ID: number }[]).map((r) => r.ID));
    const known = new Set((db.query("SELECT ID FROM client_AreaTable").all() as { ID: number }[]).map((r) => r.ID));
    const zoneOfMap = new Map<number, number>();
    for (const r of db.query("SELECT ContinentID map, min(ID) area, count(*) n FROM client_AreaTable WHERE ParentAreaID = 0 GROUP BY ContinentID").all() as { map: number; area: number; n: number }[])
      if (r.n === 1 && instances.has(r.map)) zoneOfMap.set(r.map, r.area);
    for (const r of db.query("SELECT ID, AreaTableID FROM client_Map WHERE InstanceType > 0 AND AreaTableID > 0").all() as { ID: number; AreaTableID: number }[])
      if (known.has(r.AreaTableID)) zoneOfMap.set(r.ID, r.AreaTableID);
    // (the zones whose regions hold the spot: one, or it can't be told,
    // regions being rectangles that overlap where zones meet)
    const regions = db.prepare(
      `SELECT DISTINCT AreaID area FROM client_UiMapAssignment WHERE MapID = ? AND AreaID > 0 AND ? BETWEEN Region_0 AND Region_3 AND ? BETWEEN Region_1 AND Region_4`,
    );
    const entities = db.prepare("SELECT DISTINCT kind, entity_id FROM spawn WHERE source = 'questie' AND area_id = ?");
    const theirs = db.prepare("SELECT map_id, x, y FROM spawn WHERE source = 'classicdb' AND kind = ? AND entity_id = ? AND map_id IS NOT NULL");
    const setAll = db.prepare("UPDATE spawn SET area_id = ? WHERE source = 'questie' AND area_id = ?");
    const setOne = db.prepare("UPDATE spawn SET area_id = ? WHERE source = 'questie' AND area_id = ? AND kind = ? AND entity_id = ?");
    const setUi = db.prepare(
      "UPDATE spawn SET ui_map_id = ? WHERE source = 'questie' AND area_id = ? AND ui_map_id IS NULL AND ux BETWEEN 0 AND 100 AND uy BETWEEN 0 AND 100",
    );
    let instance = 0, continent = 0, none = 0, spots = 0;
    for (const id of priv) {
      const ui = zoneMaps.get(id);
      if (ui !== undefined) spots += setUi.run(ui, id).changes;
      const ents = entities.all(id) as { kind: string; entity_id: number }[];
      const at = ents.map((e) => ({ e, at: theirs.all(e.kind, e.entity_id) as { map_id: number; x: number | null; y: number | null }[] }));
      // (one vote each: the map most of its spawns stand on)
      const votes = new Map<number, number>();
      for (const { at: a } of at) {
        const own = new Map<number, number>();
        for (const s of a) own.set(s.map_id, (own.get(s.map_id) ?? 0) + 1);
        const map = [...own].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]?.[0];
        if (map !== undefined) votes.set(map, (votes.get(map) ?? 0) + 1);
      }
      const map = [...votes].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]?.[0];
      if (map !== undefined && zoneOfMap.has(map)) {
        instance += setAll.run(zoneOfMap.get(map)!, id).changes;
        continue;
      }
      for (const { e, at: a } of at) {
        const areas = new Set(
          a
            .filter((s) => s.x !== null && s.y !== null)
            .map((s) => {
              const held = regions.all(s.map_id, s.x!, s.y!) as { area: number }[];
              return held.length === 1 ? held[0].area : null;
            }),
        );
        const area = areas.size === 1 ? [...areas][0] : null;
        const n = setOne.run(area, id, e.kind, e.entity_id).changes;
        if (area === null) none += n;
        else continent += n;
      }
    }
    log(`questie zones: ${instance} spawns in an instance, ${continent} on a continent, ${none} none, ${spots} spots given their map (${priv.length} ids of Questie's own)`);
  })();
}

// ── a quest chain's first quest (Classic's and Forever's alike) ─────────────
function chains(db: Database) {
  // (a chain's first quest: the previous quest's, else the one that leads in by NextQuestInChain)
  db.transaction(() => {
    const all = db.query("SELECT id, prev_id, next_in_chain FROM quest").all() as {
      id: number;
      prev_id: number | null;
      next_in_chain: number | null;
    }[];
    const parent = new Map<number, number>();
    for (const q of all) if (q.prev_id && q.prev_id > 0) parent.set(q.id, q.prev_id);
    for (const q of all) if (q.next_in_chain && !parent.has(q.next_in_chain)) parent.set(q.next_in_chain, q.id);
    const update = db.prepare("UPDATE quest SET chain_root = ? WHERE id = ?");
    let n = 0;
    for (const q of all) {
      let root = q.id;
      const seen = new Set<number>([root]);
      while (parent.has(root) && !seen.has(parent.get(root)!)) {
        root = parent.get(root)!;
        seen.add(root);
      }
      if (root !== q.id) n += update.run(root, q.id).changes;
    }
    log(`quest chain_root: ${n}`);
  })();

}

// ── Season of Discovery's, where Forever shows none of it ──────────────────
// Wowhead's Forever environment answers for Season of Discovery's ids (its
// Molten Core's Baron Geddon, 228433), and Questie's Forever delta-base,
// imported from its pages, carries SoD with them: creatures, objects and
// quests, its items' drops and vendors. Of what Questie's SoD base has that
// Classic Era hasn't (questieSeason), Forever keeps what it shows (20 October
// 2026): what its players met (Questie's Forever traces, the players' facts),
// what holds something only Forever has (an item or a quest Classic Era's
// client lacks: a list of it was seen in Forever), what Wowhead saw Forever
// change (wowheadChanged: the library's books turned in by any class), and
// who starts, ends or is asked for by a SoD quest it keeps or a quest only
// it has, and who drops what such a quest asks for. Wowhead's "unchanged"
// is SoD's copy and its "added in patch" SoD's (Forever's players looted the
// world books it dates 1.15.0): no evidence either. The rest goes, with every
// row that names it, but its names (`left_out`: a journal may hold its id,
// the user's call, 20 October 2026). A SoD item stays
// (Forever's client has it), its drops, contents, vendors and recipe only
// where Forever's players looted it or such a quest asks for it.
async function seasonOfDiscovery(db: Database, game: Game) {
  const { sod, traced } = await questieSeason();
  const seen = { creature: new Set(traced.creature), object: new Set(traced.object), quest: new Set(traced.quest), item: new Set(traced.item) };
  // (the players': a creature seen or heard, a quest and who gave or took it,
  // what a creature or an object gave)
  for (const [, kind, entity, field, value] of playerFacts(game)) {
    if (kind === "npc" || kind === "say" || kind === "gossip") seen.creature.add(Number(entity));
    else if (kind === "quest") {
      seen.quest.add(Number(entity));
      if ((field === "giver" || field === "ender") && /^(npc|object):\d+$/.test(value)) {
        const [what, who] = value.split(":");
        seen[what === "npc" ? "creature" : "object"].add(Number(who));
      }
    } else if (kind === "loot") {
      const [from, id] = entity.split(":");
      seen[from === "npc" ? "creature" : "object"].add(Number(id));
      seen.item.add(Number(value));
    }
  }
  db.exec("CREATE TEMP TABLE classic_item (id INTEGER PRIMARY KEY); CREATE TEMP TABLE classic_quest (id INTEGER PRIMARY KEY)");
  for (const [table, ids] of [
    ["classic_item", await wago("classic", "Item")],
    ["classic_quest", await wago("classic", "QuestV2")],
  ] as const) {
    const insert = db.prepare(`INSERT OR IGNORE INTO ${table} VALUES (?)`);
    db.transaction(() => {
      for (const r of ids) insert.run(Number(r.ID));
    })();
  }
  const changed = wowheadChanged(game);
  for (const kind of ["creature", "object", "quest"] as const) for (const id of changed[kind]) seen[kind].add(id);
  // (a quest's evidence is its own, settled here: a SoD quest without any is
  // no quest only Forever has, though Classic Era's client lacks it too)
  db.exec("CREATE TEMP TABLE unseen_quest (id INTEGER PRIMARY KEY)");
  const unseenQuest = db.prepare("INSERT INTO unseen_quest VALUES (?)");
  db.transaction(() => {
    for (const id of sod.quest) if (!seen.quest.has(id)) unseenQuest.run(id);
  })();
  const onlyForever = "SELECT id FROM quest WHERE id NOT IN (SELECT id FROM classic_quest) AND id NOT IN (SELECT id FROM unseen_quest)";
  const holds = db.query(
    `SELECT kind, source_id AS id FROM loot WHERE kind IN ('creature', 'object') AND source IN ('questie', 'wowhead')
       AND item_id IN (SELECT ID FROM client_Item) AND item_id NOT IN (SELECT id FROM classic_item)
     UNION SELECT kind, entity_id FROM quest_relation WHERE kind IN ('creature', 'object') AND quest_id IN (${onlyForever})`,
  ).all() as { kind: "creature" | "object"; id: number }[];
  for (const { kind, id } of holds) seen[kind].add(id);
  // (who starts and ends a SoD quest Forever keeps or a quest only Forever has,
  // what it asks for, and who drops an item it asks for: the Dragonslayer's
  // quests' Alonso, The Cook in the Cage's key from Colonel Kurzen, Stalk With
  // The Earthmother's charges from the Blasting Supplies)
  db.exec("CREATE TEMP TABLE kept_quest (id INTEGER PRIMARY KEY)");
  const keep = db.prepare("INSERT OR IGNORE INTO kept_quest VALUES (?)");
  db.transaction(() => {
    for (const id of sod.quest) if (seen.quest.has(id)) keep.run(id);
  })();
  db.exec(`INSERT OR IGNORE INTO kept_quest ${onlyForever}`);
  const asked = (db.query("SELECT DISTINCT target_id AS id FROM quest_objective WHERE kind IN ('item', 'source') AND quest_id IN (SELECT id FROM kept_quest)").all() as { id: number }[]).map((r) => r.id);
  for (const id of asked) seen.item.add(id);
  const ofKept = db.query(
    `SELECT kind, entity_id AS id FROM quest_relation WHERE kind IN ('creature', 'object') AND quest_id IN (SELECT id FROM kept_quest)
     UNION SELECT kind, target_id FROM quest_objective WHERE kind IN ('creature', 'object') AND quest_id IN (SELECT id FROM kept_quest)
     UNION SELECT kind, source_id FROM loot WHERE kind IN ('creature', 'object') AND source IN ('questie', 'wowhead')
       AND item_id IN (SELECT target_id FROM quest_objective WHERE kind IN ('item', 'source') AND quest_id IN (SELECT id FROM kept_quest))`,
  ).all() as { kind: "creature" | "object"; id: number }[];
  for (const { kind, id } of ofKept) seen[kind].add(id);

  db.exec("CREATE TEMP TABLE gone (kind TEXT NOT NULL, id INTEGER NOT NULL, PRIMARY KEY (kind, id)); CREATE TEMP TABLE unseen_item (id INTEGER PRIMARY KEY)");
  db.transaction(() => {
    for (const kind of ["creature", "object", "quest"] as const) {
      const gone = db.prepare(`INSERT INTO gone SELECT '${kind}', id FROM ${kind} WHERE id = ?`);
      for (const id of sod[kind]) if (!seen[kind].has(id)) gone.run(id);
    }
    const unseen = db.prepare("INSERT INTO unseen_item VALUES (?)");
    for (const id of sod.item) if (!seen.item.has(id)) unseen.run(id);
  })();
  const of = (kind: string) => `(SELECT id FROM gone WHERE kind = '${kind}')`;
  const n: Record<string, number> = {};
  db.transaction(() => {
    // (its names stay, in every language: the ids a saved file may hold)
    n["kept as names"] = db.prepare("INSERT INTO left_out SELECT kind, id, 'season_of_discovery' FROM gone").run().changes;
    for (const [table, where] of [
      ["creature", `id IN ${of("creature")}`],
      ["object", `id IN ${of("object")}`],
      ["quest", `id IN ${of("quest")}`],
      ["spawn", `(kind = 'creature' AND entity_id IN ${of("creature")}) OR (kind = 'object' AND entity_id IN ${of("object")})`],
      ["spawn_entry", `(kind = 'creature' AND entity_id IN ${of("creature")}) OR (kind = 'object' AND entity_id IN ${of("object")})`],
      ["path", `owner = 'creature' AND owner_id IN ${of("creature")}`],
      ["loot", `source IN ('questie', 'wowhead') AND ((kind = 'creature' AND source_id IN ${of("creature")}) OR (kind = 'object' AND source_id IN ${of("object")}))`],
      ["vendor", `npc_id IN ${of("creature")}`],
      ["trainer_spell", `npc_id IN ${of("creature")}`],
      // (gossip_option and gossip_page are by the menu, reached only from gossip: a
      // menu of a creature gone here is left unreachable, harmless)
      ["gossip", `npc_id IN ${of("creature")}`],
      ["npc_line", `npc_id IN ${of("creature")}`],
      ["creature_sighting", `npc_id IN ${of("creature")}`],
      ["rare_zone", `creature_id IN ${of("creature")}`],
      ["encounter", `credit_type = 0 AND credit_id IN ${of("creature")}`],
      ["gathering_node", `object_id IN ${of("object")}`],
      ["readable", `kind = 'object' AND id IN ${of("object")}`],
      ["readable_page", `kind = 'object' AND id IN ${of("object")}`],
      ["quest_relation", `quest_id IN ${of("quest")} OR (kind = 'creature' AND entity_id IN ${of("creature")}) OR (kind = 'object' AND entity_id IN ${of("object")})`],
      ["quest_objective", `quest_id IN ${of("quest")} OR (kind = 'creature' AND target_id IN ${of("creature")}) OR (kind = 'object' AND target_id IN ${of("object")})`],
      ["quest_text", `quest_id IN ${of("quest")}`],
      ["quest_reward", `quest_id IN ${of("quest")}`],
      ["quest_prereq", `quest_id IN ${of("quest")} OR abs(prev_id) IN ${of("quest")}`],
      ["recipe_source", `(kind = 'trainer' AND ref_id IN ${of("creature")}) OR (kind = 'quest' AND ref_id IN ${of("quest")})`],
    ] as const) {
      const changes = db.prepare(`DELETE FROM ${table} WHERE ${where}`).run().changes;
      if (changes) n[table] = changes;
    }
    n["items' quests"] = db.prepare(`UPDATE item SET start_quest_id = NULL WHERE start_quest_id IN ${of("quest")}`).run().changes;
    for (const column of ["prev_id", "next_id", "next_in_chain"])
      db.prepare(`UPDATE quest SET ${column} = NULL WHERE ${column} IN ${of("quest")}`).run();
    // (a SoD item no player looted in Forever: where Questie's and Wowhead's lists put it)
    const unseen = "item_id IN (SELECT id FROM unseen_item)";
    n["items' drops"] = db.prepare(`DELETE FROM loot WHERE source IN ('questie', 'wowhead') AND ${unseen}`).run().changes;
    n["items' contents"] = db.prepare("DELETE FROM loot WHERE kind = 'item' AND source IN ('questie', 'wowhead') AND source_id IN (SELECT id FROM unseen_item)").run().changes;
    n["items' vendors"] = db.prepare(`DELETE FROM vendor WHERE source IN ('questie', 'wowhead') AND ${unseen}`).run().changes;
    n["items' recipes"] = db.prepare("DELETE FROM recipe_source WHERE kind = 'item' AND ref_id IN (SELECT id FROM unseen_item)").run().changes;
  })();
  db.exec("DROP TABLE gone; DROP TABLE unseen_item; DROP TABLE kept_quest; DROP TABLE unseen_quest; DROP TABLE classic_item; DROP TABLE classic_quest");
  log(`season of discovery's left out: ${Object.entries(n).map(([k, v]) => `${v} ${k}`).join(", ")}`);
}

// ── loot from a creature or an object no source has ─────────────────────────
// Questie's and Wowhead's loot names the creature or the object itself, and
// Questie keeps an item's sources it can't resolve: in Forever, those of
// Wowhead's Forever pages, which carry Season of Discovery's too (Waylaid
// Supplies' Artifact Storage, 404352). A row whose creature or object no
// source has is left out, once every source of them is in (the players' too).
function unknownLoot(db: Database) {
  for (const kind of ["creature", "object"] as const) {
    const n = db.prepare(`DELETE FROM loot WHERE kind = ? AND source IN ('questie', 'wowhead') AND source_id NOT IN (SELECT id FROM ${kind})`).run(kind).changes;
    log(`loot left out: ${n} rows of ${kind === "object" ? "an object" : "a creature"} no source has`);
  }
}

// ── what an item casts, what a spell teaches ────────────────────────────────
// The items' spells from the client's ItemEffect (Classic Era's names the
// item; Forever's through ItemXItemEffect). Then what teaches what: a recipe
// item's use spell and a trainer's lesson that are no spell of a skill line
// themselves teach the one of the same name in the item's required skill
// (ItemSparse) or the trainer's: "Recipe: Goretusk Liver Pie" teaches Goretusk
// Liver Pie, Cook Ghilm's Spiced Wolf Meat (2559) teaches the cook's own
// (2539). The client's learn effect (36) decides where it has one; the name
// only where exactly one spell of the skill line bears it (a use spell named
// "Learning", Season of Discovery's, says nothing: the item's own name then).
const RECIPE_PREFIX = /^(Recipe|Pattern|Plans|Formula|Schematic|Manual|Design|Book|Tome|Codex|Libram|Grimoire): /;
async function teachings(db: Database, game: Game) {
  const has = (table: string) => !!db.query("SELECT 1 FROM sqlite_master WHERE name = ?").get(table);
  if (!has("client_ItemEffect")) {
    log("item_spell: no ItemEffect in this client");
    return;
  }
  const cols = (db.query("PRAGMA table_info(client_ItemEffect)").all() as { name: string }[]).map((c) => c.name);
  const n = cols.includes("ParentItemID")
    ? db.run("INSERT INTO item_spell SELECT ParentItemID, SpellID, TriggerType, 'client' FROM client_ItemEffect WHERE ParentItemID > 0 AND SpellID > 0").changes
    : has("client_ItemXItemEffect")
      ? db.run(`INSERT INTO item_spell SELECT x.ItemID, e.SpellID, e.TriggerType, 'client'
                FROM client_ItemXItemEffect x JOIN client_ItemEffect e ON e.ID = x.ItemEffectID WHERE e.SpellID > 0`).changes
      : 0;
  log(`item_spell: ${n}`);

  const spellName = new Map<number, string>();
  for (const r of db.query("SELECT id, name FROM name WHERE kind = 'spell' AND locale = 'enUS'").all() as { id: number; name: string }[])
    spellName.set(r.id, r.name);
  // the skill lines' spells by name: skill line -> name -> the spells
  const bySkill = new Map<number, Map<string, Set<number>>>();
  const inSkill = new Set<number>();
  for (const r of db.query("SELECT SkillLine AS line, Spell AS spell FROM client_SkillLineAbility").all() as { line: number; spell: number }[]) {
    inSkill.add(r.spell);
    const name = spellName.get(r.spell);
    if (!name) continue;
    const names = bySkill.get(r.line) ?? new Map();
    bySkill.set(r.line, names);
    (names.get(name) ?? names.set(name, new Set()).get(name)!).add(r.spell);
  }
  // (Forever's trainers are the Classic database's, their lessons Classic's
  // own spells, which Forever's client no longer has (its trainers teach the
  // recipe itself): what such a lesson teaches, from the pinned Classic
  // client's learn effect, for a spell this client doesn't know)
  const known = new Set((db.query("SELECT DISTINCT SpellID AS id FROM client_SpellEffect").all() as { id: number }[]).map((r) => r.id));
  const classicLearns = new Map<number, number>();
  if (game === "forever")
    for (const r of await wago("classic", "SpellEffect"))
      if (num(r.Effect) === 36 && (num(r.EffectTriggerSpell) ?? 0) > 0) classicLearns.set(num(r.SpellID)!, num(r.EffectTriggerSpell)!);
  const learns = new Map<number, number>();
  // (by the spell the effect belongs to: SpellID, never the effect's own row ID)
  for (const r of db.query("SELECT SpellID AS id, EffectTriggerSpell AS taught FROM client_SpellEffect WHERE Effect = 36 AND EffectTriggerSpell > 0").all() as { id: number; taught: number }[])
    learns.set(r.id, r.taught);
  const insert = db.prepare("INSERT OR IGNORE INTO teaching VALUES (?, ?, ?, ?)");
  // what spell teaches, by the learn effect, else by one of the names given
  const resolve = (spell: number, line: number, names: string[]): [number, string] | null => {
    const taught = learns.get(spell);
    if (taught) return [taught, "client"];
    const classic = known.has(spell) ? undefined : classicLearns.get(spell);
    if (classic && inSkill.has(classic)) return [classic, "classic"];
    for (const raw of names) {
      const name = raw.replace(RECIPE_PREFIX, "");
      if (name === "Learning") continue;
      const found = bySkill.get(line)?.get(name);
      if (found?.size === 1) return [[...found][0], "name"];
    }
    return null;
  };
  let items = 0, trainers = 0, unresolved = 0;
  // (what each recipe item teaches, item by item: a use spell many items
  // share says nothing of its own (Forever's "Learning", 402265, on every
  // recipe), so it is resolved by each item's name and never stands in
  // teaching for all of them, where it once taught an elixir to every cook)
  const itemTeaches = new Map<number, number>();
  const recipes = db.query(`SELECT s.item_id AS item, s.spell_id AS spell, p.RequiredSkill AS line, n.name AS name
                            FROM item_spell s JOIN item i ON i.id = s.item_id AND i.class_id = 9
                            JOIN client_ItemSparse p ON p.ID = s.item_id
                            LEFT JOIN name n ON n.kind = 'item' AND n.id = s.item_id AND n.locale = 'enUS'
                            WHERE s.trigger = 0 AND p.RequiredSkill > 0`).all() as { item: number; spell: number; line: number; name: string | null }[];
  const users = new Map<number, number>();
  for (const r of recipes) users.set(r.spell, (users.get(r.spell) ?? 0) + 1);
  db.transaction(() => {
    for (const r of recipes) {
      if (inSkill.has(r.spell)) continue;
      const shared = (users.get(r.spell) ?? 0) > 1 && !learns.has(r.spell);
      const got = shared ? resolve(-1, r.line, [r.name ?? ""]) : resolve(r.spell, r.line, [spellName.get(r.spell) ?? "", r.name ?? ""]);
      if (got) {
        itemTeaches.set(r.item, got[0]);
        if (!shared) insert.run(r.spell, got[0], r.line, got[1]);
        items++;
      } else unresolved++;
    }
    for (const r of db.query("SELECT DISTINCT spell_id AS spell, skill_line_id AS line FROM trainer_spell WHERE skill_line_id > 0").all() as { spell: number; line: number }[]) {
      if (inSkill.has(r.spell) || (!learns.has(r.spell) && !spellName.get(r.spell) && !classicLearns.has(r.spell))) continue;
      const got = resolve(r.spell, r.line, [spellName.get(r.spell) ?? ""]);
      if (got) {
        insert.run(r.spell, got[0], r.line, got[1]);
        trainers++;
      } else unresolved++;
    }
  })();
  log(`teaching: ${items} recipe items, ${trainers} trainers' lessons (${unresolved} unresolved: no spell of that name in the skill line, or more than one)`);
  recipeSources(db, learns, itemTeaches);
}

// Every way a recipe is learned (recipe_source): with the skill, from a
// trainer, a recipe item, a quest.
// (a trade: the client's skill line categories 11, the professions, and 9,
// the secondary ones: cooking, first aid, fishing. A class's spells are no
// recipes.)
const TRADES = [9, 11];
function recipeSources(db: Database, learns: Map<number, number>, itemTeaches: Map<number, number>) {
  const lineOf = new Map<number, number>();
  for (const r of db.query(`SELECT a.SkillLine AS line, a.Spell AS spell FROM client_SkillLineAbility a
                            JOIN client_SkillLine l ON l.ID = a.SkillLine WHERE l.CategoryID IN (${TRADES.join(",")})`).all() as { line: number; spell: number }[])
    if (!lineOf.has(r.spell)) lineOf.set(r.spell, r.line);
  const taught = new Map<number, number>();
  for (const r of db.query("SELECT spell_id AS spell, taught_spell_id AS taught FROM teaching").all() as { spell: number; taught: number }[])
    taught.set(r.spell, r.taught);
  // (the recipe a spell is, or teaches)
  const recipeOf = (spell: number) => (lineOf.has(spell) ? spell : (taught.get(spell) ?? learns.get(spell)));
  const insert = db.prepare("INSERT INTO recipe_source VALUES (?, ?, ?, ?, ?, ?)");
  const seen = new Set<string>();
  const add = (recipe: number | undefined, kind: string, ref: number | null, value: number | null, source: string) => {
    if (recipe === undefined || !lineOf.has(recipe)) return 0;
    const key = `${recipe}|${kind}|${ref}`;
    if (seen.has(key)) return 0;
    seen.add(key);
    insert.run(recipe, lineOf.get(recipe)!, kind, ref, value && value > 0 ? value : null, source);
    return 1;
  };
  const n = { skill: 0, trainer: 0, item: 0, quest: 0 };
  db.transaction(() => {
    for (const r of db.query("SELECT Spell AS spell FROM client_SkillLineAbility WHERE AcquireMethod = 1").all() as { spell: number }[])
      n.skill += add(r.spell, "skill", null, null, "client");
    for (const r of db.query("SELECT npc_id AS npc, spell_id AS spell, skill_value AS value, source FROM trainer_spell").all() as { npc: number; spell: number; value: number | null; source: string }[])
      n.trainer += add(recipeOf(r.spell), "trainer", r.npc, r.value, r.source);
    // (an item's use that teaches the recipe, trigger 0: Classic Era's
    // client; the recipe itself as the item's "learn" effect, trigger 6:
    // Forever's)
    // (an item whose learn effect names its recipe: that one alone, never a
    // name's guess besides: Plans: Stronger-hold Gauntlets teaches 16741)
    const named = new Set((db.query("SELECT item_id AS item, spell_id AS spell FROM item_spell WHERE trigger = 6").all() as { item: number; spell: number }[])
      .filter((r) => lineOf.has(r.spell)).map((r) => r.item));
    for (const r of db.query(`SELECT s.item_id AS item, s.spell_id AS spell, s.trigger AS trigger, p.RequiredSkillRank AS value FROM item_spell s
                              LEFT JOIN client_ItemSparse p ON p.ID = s.item_id WHERE s.trigger IN (0, 6)`).all() as { item: number; spell: number; trigger: number; value: number | null }[])
      if (r.trigger === 6 ? lineOf.has(r.spell) : !lineOf.has(r.spell) && !named.has(r.item))
        n.item += add(r.trigger === 6 ? r.spell : (itemTeaches.get(r.item) ?? recipeOf(r.spell)), "item", r.item, r.value, "client");
    for (const r of db.query("SELECT quest_id AS quest, ref_id AS spell, source FROM quest_reward WHERE kind IN ('spell', 'cast')").all() as { quest: number; spell: number; source: string }[])
      n.quest += add(recipeOf(r.spell), "quest", r.quest, null, r.source);
  })();
  log(`recipe_source: ${n.skill} with the skill, ${n.trainer} trainers, ${n.item} items, ${n.quest} quests`);
}

// ── the whole build ──────────────────────────────────────────────────────────
// The music: the client's chain from an area to the files it plays. An area's
// ZoneMusic (its own, else its parent zone's: a subzone with none plays the
// zone's) names a ZoneMusic set; the set's two sound kits (Sounds_0 by day,
// Sounds_1 by night) hold the tracks as SoundKitEntry rows. A building's
// WMOAreaTable row may carry a set of its own (an inn). A ZoneMusic id no
// ZoneMusic row has plays nothing (Forever's WMOAreaTable has thousands): left
// out, counted. The underwater sets and the intro-less areas aren't read.
function music(db: Database) {
  const has = (t: string) => !!db.query("SELECT 1 FROM sqlite_master WHERE name = ?").get(t);
  if (!has("client_ZoneMusic") || !has("client_SoundKitEntry")) {
    log("music: no ZoneMusic in this client");
    return;
  }
  const files = new Map<number, number[]>();
  for (const r of db.query("SELECT SoundKitID k, FileDataID f FROM client_SoundKitEntry ORDER BY ID").all() as { k: number; f: number }[]) {
    const list = files.get(r.k) ?? [];
    files.set(r.k, list);
    if (!list.includes(r.f)) list.push(r.f);
  }
  const sets = db.query("SELECT ID, SetName, Sounds_0 d, Sounds_1 n FROM client_ZoneMusic").all() as { ID: number; SetName: string; d: number; n: number }[];
  const known = new Set<number>();
  const addSet = db.prepare("INSERT INTO music_set VALUES (?, ?, 'client')");
  const addTrack = db.prepare("INSERT INTO music_track VALUES (?, ?, ?, ?, 'client')");
  for (const z of sets) {
    const day = files.get(z.d) ?? [];
    const night = files.get(z.n) ?? [];
    if (!day.length && !night.length) continue;
    known.add(z.ID);
    addSet.run(z.ID, z.SetName || `set ${z.ID}`);
    let seq = 0;
    for (const f of day) addTrack.run(z.ID, f, night.includes(f) ? "both" : "day", seq++);
    for (const f of night) if (!day.includes(f)) addTrack.run(z.ID, f, "night", seq++);
  }
  const areas = db.query("SELECT ID, ParentAreaID parent, ZoneMusic zm FROM client_AreaTable").all() as { ID: number; parent: number; zm: number }[];
  const byId = new Map(areas.map((a) => [a.ID, a]));
  const addArea = db.prepare("INSERT OR IGNORE INTO music_area VALUES (?, ?, ?, ?, 'client')");
  let own = 0, inherited = 0;
  for (const a of areas) {
    let x: { ID: number; parent: number; zm: number } | undefined = a;
    for (let up = 0; x && !known.has(x.zm) && x.parent && up < 8; up++) x = byId.get(x.parent);
    if (!x || !known.has(x.zm)) continue;
    addArea.run(a.ID, x.zm, x === a ? "own" : "parent", 1);
    if (x === a) own++;
    else inherited++;
  }
  // A building row with no area of its own takes its WMO's: the area a sibling
  // group names (the lowest id), pinned as inexact. One with neither is counted.
  const wmoRows = db.query("SELECT WMOID id, AreaTableID a, ZoneMusic zm FROM client_WMOAreaTable").all() as { id: number; a: number; zm: number }[];
  const wmoArea = new Map<number, number>();
  for (const w of wmoRows) if (byId.has(w.a) && (!wmoArea.has(w.id) || w.a < wmoArea.get(w.id)!)) wmoArea.set(w.id, w.a);
  let wmo = 0, dead = 0, homeless = 0;
  for (const w of wmoRows) {
    if (w.zm <= 0) continue;
    if (!known.has(w.zm)) {
      dead++;
      continue;
    }
    const area = byId.has(w.a) ? w.a : wmoArea.get(w.id);
    if (area === undefined) homeless++;
    else wmo += addArea.run(area, w.zm, "wmo", byId.has(w.a) && byId.get(w.a)!.parent ? 1 : 0).changes;
  }
  let intros = 0;
  if (has("client_ZoneIntroMusicTable")) {
    const introKit = new Map((db.query("SELECT ID, Name, SoundID k, MinDelayMinutes d FROM client_ZoneIntroMusicTable").all() as { ID: number; Name: string; k: number; d: number }[]).map((i) => [i.ID, i]));
    const addIntro = db.prepare("INSERT INTO music_intro VALUES (?, ?, ?, ?, ?, 'client')");
    for (const a of db.query("SELECT ID, IntroSound i FROM client_AreaTable WHERE IntroSound > 0").all() as { ID: number; i: number }[]) {
      const i = introKit.get(a.i);
      if (!i) continue;
      for (const f of files.get(i.k) ?? []) {
        addIntro.run(a.ID, i.ID, i.Name, f, i.d);
        intros++;
      }
    }
  }
  log(`music: ${known.size} sets, areas ${own} own + ${inherited} inherited + ${wmo} by building, ${intros} intro tracks, ${dead} building rows name a set the client lacks and ${homeless} have no area (both left out)`);
}

export async function build(game: Game, file: string) {
  const db = new Database(file, { create: true });
  db.exec("PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;");
  db.exec(readFileSync(path.join(ROOT, "schema.sql"), "utf8"));
  const meta = db.prepare("INSERT INTO meta VALUES (?, ?)");
  meta.run("game", game);
  meta.run("built_at", new Date().toISOString());
  meta.run("pins", JSON.stringify(PINS));
  meta.run("schema", "1");
  // (the inputs' revision, as the release names it: openDb tells a database of other inputs)
  try {
    meta.run("tag", databaseTag());
  } catch {}
  const source = db.prepare("INSERT INTO source VALUES (?, ?, ?, ?)");
  const b = PINS.builds[game];
  source.run("client", `${b.product} ${b.build}`, "https://wago.tools", "Blizzard's");
  const c = PINS.repos.classicdb;
  source.run("classicdb", c.commit, `https://github.com/${c.repo}`, "GPL-3.0");
  const qd = PINS.repos.questie;
  source.run("questie", qd.commit, `https://github.com/${qd.repo}`, "none stated (credited)");
  source.run("wowhead", "data/wowhead (frozen)", "https://www.wowhead.com", "Wowhead's");
  source.run("english", "data/wowhead (frozen): its names in brackets", "https://www.wowhead.com", "Blizzard's (the English a client shows where its language has no name)");
  console.log(`${game}: the client's tables (${b.build})`);
  await clientTables(db, game);
  music(db);
  console.log(`${game}: names in every language`);
  await clientNames(db, game);
  clientItems(db);
  console.log(`${game}: Questie (${qd.commit.slice(0, 12)})`);
  const data = await questie(game);
  questieWorld(db, data);
  console.log(`${game}: the Classic database (${c.commit.slice(0, 12)})`);
  await classicDb(db, data);
  questieZones(db, await questieZoneMaps());
  clientGathering(db);
  await teachings(db, game);
  const shownLater = wowheadNames(db, game);
  if (game === "classic") tbcItems(db);
  wowheadRanks(db, game);
  wowheadPoints(db, game);
  attRewards(db, game);
  attPrereqs(db, game);
  wowheadBooks(db, game);
  wowheadPages(db, game, log);
  loadPlayers(db, game);
  loadLandmarks(db, game);
  shownInEnglishLater(db, shownLater);
  if (game === "forever") await seasonOfDiscovery(db, game);
  unknownLoot(db);
  chains(db);
  siblingNames(db);
  db.exec("ANALYZE");
  db.close();
}
