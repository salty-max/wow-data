// A game's database built from the pinned sources (PLAN.md, schema.sql):
// the client's own tables whole, their names in every language, then the
// Classic database's world, every link an id, every row its source.
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { classicDump } from "./github";
import { type Game, PINS, ROOT } from "./pins";
import { rows } from "./sql";
import { LOCALES, wago } from "./wago";

type Row = Record<string, string | number | null>;

// The client's tables imported whole (client_<Table>); one a game lacks is skipped, said.
const CLIENT_TABLES = [
  "AreaTable",
  "WMOAreaTable",
  "Map",
  "UiMap",
  "UiMapAssignment",
  "WorldMapOverlay",
  "DungeonEncounter",
  "SpellName",
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

// ── the Classic database's world ─────────────────────────────────────────────
async function classicDb(db: Database) {
  const sql = gunzipSync(readFileSync(await classicDump())).toString("utf8");
  const name = db.prepare("INSERT OR IGNORE INTO name VALUES (?, ?, 'enUS', ?, NULL, 'classicdb')");
  const run = (label: string, fn: () => number) => log(`${label}: ${db.transaction(fn)()}`);

  // creatures and their spawns
  const creatures = rows(sql, "creature_template");
  const insertCreature = db.prepare(
    "INSERT INTO creature VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'classicdb')",
  );
  run("creature", () => {
    for (const r of creatures) {
      const models = [r.ModelId1, r.ModelId2, r.ModelId3, r.ModelId4].filter((m) => nz(m)).join(",");
      const credit = [r.KillCredit1, r.KillCredit2].filter((m) => nz(m)).join(",");
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
  run("object", () => {
    for (const r of objects) {
      const type = num(r.type);
      const data: number[] = [];
      for (let i = 0; i <= 23; i++) data.push(Number(r[`data${i}`] ?? 0));
      insertObject.run(
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

  // items: the client's where it has them (its names won), the database's for the rest
  run(
    "item (client)",
    () =>
      db.run(`INSERT INTO item
        SELECT s.ID, i.ClassID, i.SubclassID, s.OverallQualityID, s.InventoryType, s.ItemLevel, s.RequiredLevel,
               s.ContainerSlots, NULLIF(s.PageID, 0), NULLIF(s.StartQuestID, 0), NULL, NULL, 'client'
        FROM client_ItemSparse s LEFT JOIN client_Item i ON i.ID = s.ID`).changes,
  );
  const items = rows(sql, "item_template");
  const insertItem = db.prepare("INSERT OR IGNORE INTO item VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'classicdb')");
  const display = db.prepare("UPDATE item SET display_id = ? WHERE id = ? AND display_id IS NULL");
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
      ).changes;
      display.run(nz(r.displayid), num(r.entry));
      if (r.name) name.run("item", num(r.entry), r.name);
    }
    return n;
  });

  // quests: the quest, its texts, what it asks, who starts and ends it, what it gives
  const quests = rows(sql, "quest_template");
  const insertQuest = db.prepare(
    "INSERT INTO quest VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, 'classicdb')",
  );
  const insertText = db.prepare("INSERT INTO quest_text VALUES (?, 'enUS', ?, ?, 'classicdb')");
  const insertObjective = db.prepare("INSERT INTO quest_objective VALUES (?, ?, ?, ?, ?, 'classicdb')");
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
  run("quest", () => {
    for (const r of quests) {
      const id = num(r.entry);
      const zone = num(r.ZoneOrSort) ?? 0;
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
      );
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
    run(`quest_relation ${table}`, () => {
      for (const r of data) insertRelation.run(num(r.quest), role, kind, num(r.id));
      return data.length;
    });
  }
  run("quest_relation item", () => {
    let n = 0;
    for (const r of items)
      if (nz(r.startquest)) {
        insertRelation.run(num(r.startquest), "start", "item", num(r.entry));
        n++;
      }
    return n;
  });
  // (a chain's first quest: the previous quest's, else the one that leads in by NextQuestInChain)
  run("quest chain_root", () => {
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
    return n;
  });

  // loot, vendors, trainers
  const insertLoot = db.prepare("INSERT INTO loot VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'classicdb')");
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
  const trainerTemplate = new Map<number, Row[]>();
  for (const r of rows(sql, "npc_trainer_template")) {
    const list = trainerTemplate.get(num(r.entry)!) ?? [];
    list.push(r);
    trainerTemplate.set(num(r.entry)!, list);
  }
  const insertTrainer = db.prepare("INSERT INTO trainer_spell VALUES (?, ?, ?, ?, ?, ?, 'classicdb')");
  const teach = (npc: number | null, r: Row) =>
    insertTrainer.run(npc, num(r.spell), num(r.spellcost), num(r.reqlevel), nz(r.reqskill), nz(r.reqskillvalue));
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
  const insertPath = db.prepare("INSERT OR IGNORE INTO path VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, ?, 'classicdb')");
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
  console.log(`${game}: the client's tables (${b.build})`);
  await clientTables(db, game);
  console.log(`${game}: names in every language`);
  await clientNames(db, game);
  console.log(`${game}: the Classic database (${c.commit.slice(0, 12)})`);
  await classicDb(db);
  db.exec("ANALYZE");
  db.close();
}
