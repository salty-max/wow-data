// A game's database built from the pinned sources (PLAN.md, schema.sql):
// the client's own tables whole, their names in every language, then the
// Classic database's world, every link an id, every row its source.
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { classicDump } from "./github";
import { type Game, PINS, ROOT } from "./pins";
import { questie, type QuestieData, type QuestieRecord } from "./questie";
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
  "Lock",
  "QuestSort",
  "QuestInfo",
  "EmotesText",
  "Languages",
  "QuestV2",
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
    for (const locale of ["enUS", ...LOCALES]) {
      let data: Record<string, string>[];
      try {
        data = await wago(game, n.table, locale);
      } catch {
        continue;
      }
      db.transaction(() => {
        for (const r of data) {
          const name = r[n.name];
          if (!r.ID || !name) continue;
          const female = n.female && r[n.female] && r[n.female] !== name ? r[n.female] : null;
          count += insert.run(n.kind, Number(r.ID), locale, name, female).changes;
        }
      })();
    }
    log(`names ${n.kind}: ${count}`);
  }
}

// ── the client's items (its rows win) ───────────────────────────────────────
function clientItems(db: Database) {
  const n = db.run(`INSERT INTO item
    SELECT s.ID, i.ClassID, i.SubclassID, s.OverallQualityID, s.InventoryType, s.ItemLevel, s.RequiredLevel,
           s.ContainerSlots, NULLIF(s.PageID, 0), NULLIF(s.StartQuestID, 0), NULL, NULL, 'client',
           CASE WHEN s.AllowableClass > 0 AND (s.AllowableClass & 1503) <> 1503 THEN s.AllowableClass END
    FROM client_ItemSparse s LEFT JOIN client_Item i ON i.ID = s.ID`).changes;
  log(`item (client): ${n}`);
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
  const spawn = db.prepare("INSERT INTO spawn VALUES (?, NULL, ?, NULL, NULL, NULL, NULL, ?, NULL, ?, ?, 'questie')");
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
    "INSERT INTO creature (id, min_level, max_level, rank, faction_id, npc_flags, source) VALUES (?, ?, ?, ?, ?, ?, 'questie')",
  );
  const pathPoint = db.prepare(
    "INSERT OR IGNORE INTO path VALUES ('creature', ?, ?, ?, NULL, NULL, NULL, NULL, ?, NULL, ?, ?, NULL, 'questie')",
  );
  run("creature (questie)", () => {
    let n = 0;
    for (const [sid, r] of Object.entries(q.npcs)) {
      const id = Number(sid);
      creature.run(id, num(r.minLevel), num(r.maxLevel), num(r.rank), nz(r.factionID), num(r.npcFlags));
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
  const creatures = rows(sql, "creature_template");
  const insertCreature = db.prepare(
    "INSERT INTO creature VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'classicdb', ?, ?)",
  );
  const creatureColumns = db.prepare(
    `UPDATE creature SET type_id = ?, family_id = ?, unit_class = ?, display_ids = ?, loot_id = ?,
     skin_loot_id = ?, pick_loot_id = ?, kill_credit = ?, trainer_type = ?, trainer_class = ? WHERE id = ?`,
  );
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
      );
      if (r.Name) name.run("creature", num(r.Entry), r.Name);
      if (r.SubName) name.run("creature_subname", num(r.Entry), r.SubName);
    }
    return creatures.length;
  });
  const insertSpawn = db.prepare(
    "INSERT INTO spawn VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 'classicdb')",
  );
  for (const [table, kind] of [
    ["creature", "creature"],
    ["gameobject", "object"],
  ]) {
    const spawns = rows(sql, table);
    run(`spawn ${kind}`, () => {
      for (const r of spawns)
        insertSpawn.run(kind, num(r.guid), num(r.id), num(r.map), num(r.position_x), num(r.position_y), num(r.position_z));
      return spawns.length;
    });
  }

  // objects (a text's first page, a node's lock, a chest's loot)
  const objects = rows(sql, "gameobject_template");
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
  const items = rows(sql, "item_template");
  const insertItem = db.prepare(
    "INSERT OR IGNORE INTO item VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'classicdb', ?)",
  );
  const display = db.prepare("UPDATE item SET display_id = ? WHERE id = ? AND display_id IS NULL");
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
    }
    return n;
  });

  // quests: the quest, its texts, what it asks, who starts and ends it, what it gives
  const quests = rows(sql, "quest_template");
  const insertPrereq = db.prepare("INSERT OR IGNORE INTO quest_prereq VALUES (?, ?, 'all', 'classicdb')");
  const insertQuest = db.prepare(
    "INSERT INTO quest VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, 'classicdb', ?, ?, ?)",
  );
  const insertText = db.prepare("INSERT OR IGNORE INTO quest_text VALUES (?, 'enUS', ?, ?, 'classicdb')");
  const questColumns = db.prepare(
    "UPDATE quest SET type = ?, next_id = ?, special_flags = ?, exclusive_group = ?, src_item_id = COALESCE(src_item_id, ?) WHERE id = ?",
  );
  const exclusive = (r: Row) => ((num(r.ExclusiveGroup) ?? 0) > 0 ? num(r.ExclusiveGroup) : null);
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
        questColumns.run(nz(r.Type), nz(r.NextQuestId), nz(r.SpecialFlags), exclusive(r), nz(r.SrcItemId), id);
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
    }
    return quests.length;
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
  const insertLoot = db.prepare("INSERT INTO loot VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'classicdb')");
  const insertQuestieLoot = db.prepare("INSERT INTO loot VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, 'questie')");
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
  const vendorTemplate = new Map<number, number[]>();
  for (const r of rows(sql, "npc_vendor_template")) {
    const list = vendorTemplate.get(num(r.entry)!) ?? [];
    list.push(num(r.item)!);
    vendorTemplate.set(num(r.entry)!, list);
  }
  const insertVendor = db.prepare("INSERT INTO vendor VALUES (?, ?, 'classicdb')");
  run("vendor", () => {
    let n = 0;
    for (const r of rows(sql, "npc_vendor")) {
      insertVendor.run(num(r.entry), num(r.item));
      n++;
    }
    for (const c of creatures)
      for (const item of vendorTemplate.get(num(c.VendorTemplateId) ?? 0) ?? []) {
        insertVendor.run(num(c.Entry), item);
        n++;
      }
    return n;
  });
  // (Questie's vendors for an item the database sells nowhere)
  const sold = new Set((db.query("SELECT DISTINCT item_id AS id FROM vendor").all() as { id: number }[]).map((r) => r.id));
  const insertQuestieVendor = db.prepare("INSERT INTO vendor VALUES (?, ?, 'questie')");
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
  const pages = new Map<number, Row>(rows(sql, "page_text").map((r) => [num(r.entry)!, r]));
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
  const speech = rows(sql, "broadcast_text");
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

// ── Wowhead's names (data/wowhead/<game>/<locale>.json, bin/names.ts) ────────
// where the client has none: its own win (inserted first)
function wowheadNames(db: Database, game: Game) {
  const dir = path.join(ROOT, "data", "wowhead", game);
  if (!existsSync(dir)) return;
  const insert = db.prepare("INSERT OR IGNORE INTO name VALUES (?, ?, ?, ?, NULL, 'wowhead')");
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
      renamed = 0;
    db.transaction(() => {
      for (const [kind, byId] of Object.entries(names))
        for (const [id, name] of Object.entries(byId)) {
          const had = current.get(kind, Number(id), locale) as { name: string; source: string } | null;
          if (had && had.source === "questie" && fold(had.name) !== fold(name) && !/^\[|<PH>|\bUNUSED\b/i.test(name)) {
            const en = (english.get(kind, Number(id)) as { name: string } | null)?.name;
            if (!en || fold(en) !== fold(name)) renamed += replace.run(name, kind, Number(id), locale).changes;
            continue;
          }
          n += insert.run(kind, Number(id), locale, name).changes;
        }
    })();
    log(`names wowhead ${locale}: ${n}${renamed ? `, ${renamed} of the game's own over Questie's` : ""}`);
  }
}

// ── Wowhead's ranks (data/wowhead/<game>/ranks.json) ──────────────────────
// A creature's rank where Questie gives none (Forever's own: its traces
// don't tell a rare from the rest), from the frozen tooltips ("Niveau 10 Bête
// (Rare)"). Questie's own ranks are never changed.
function wowheadRanks(db: Database, game: Game) {
  const file = path.join(ROOT, "data", "wowhead", game, "ranks.json");
  if (!existsSync(file)) return;
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
  if (!existsSync(file)) return;
  const points = JSON.parse(readFileSync(file, "utf8")) as Record<string, Record<string, Record<string, [number, number][]>>>;
  const insert = db.prepare("INSERT INTO spawn VALUES (?, NULL, ?, NULL, NULL, NULL, NULL, ?, NULL, ?, ?, 'wowhead')");
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
  if (!existsSync(file)) return;
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
  if (!existsSync(file)) return;
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
const TOKENS: Record<string, string> = {
  nom: "$N", name: "$N", nombre: "$N",
  classe: "$C", class: "$C", klasse: "$C", clase: "$C",
  race: "$R", rasse: "$R", volk: "$R", raza: "$R",
};
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function gamePage(html: string): string {
  return html
    .replace(/&lt;([^&]{1,40})&gt;/g, (aside, t: string) => {
      const token = TOKENS[t.toLowerCase()];
      if (token) return token;
      const parts = t.split("/");
      return parts.length === 2 && !/[.!?]/.test(t) ? `$g${parts[0]}:${parts[1]};` : aside;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h\d)>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m),
    )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function wowheadBooks(db: Database, game: Game) {
  const dir = path.join(ROOT, "data", "wowhead", game);
  if (!existsSync(dir)) return;
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

// ── the whole build ──────────────────────────────────────────────────────────
export async function build(game: Game, file: string) {
  const db = new Database(file, { create: true });
  db.exec("PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;");
  db.exec(readFileSync(path.join(ROOT, "schema.sql"), "utf8"));
  const meta = db.prepare("INSERT INTO meta VALUES (?, ?)");
  meta.run("game", game);
  meta.run("built_at", new Date().toISOString());
  meta.run("pins", JSON.stringify(PINS));
  meta.run("schema", "1");
  const source = db.prepare("INSERT INTO source VALUES (?, ?, ?, ?)");
  const b = PINS.builds[game];
  source.run("client", `${b.product} ${b.build}`, "https://wago.tools", "Blizzard's");
  const c = PINS.repos.classicdb;
  source.run("classicdb", c.commit, `https://github.com/${c.repo}`, "GPL-3.0");
  const qd = PINS.repos.questie;
  source.run("questie", qd.commit, `https://github.com/${qd.repo}`, "none stated (credited)");
  source.run("wowhead", "data/wowhead (frozen)", "https://www.wowhead.com", "Wowhead's");
  console.log(`${game}: the client's tables (${b.build})`);
  await clientTables(db, game);
  console.log(`${game}: names in every language`);
  await clientNames(db, game);
  clientItems(db);
  console.log(`${game}: Questie (${qd.commit.slice(0, 12)})`);
  const data = await questie(game);
  questieWorld(db, data);
  console.log(`${game}: the Classic database (${c.commit.slice(0, 12)})`);
  await classicDb(db, data);
  wowheadNames(db, game);
  wowheadRanks(db, game);
  wowheadPoints(db, game);
  attRewards(db, game);
  attPrereqs(db, game);
  wowheadBooks(db, game);
  chains(db);
  db.exec("ANALYZE");
  db.close();
}
