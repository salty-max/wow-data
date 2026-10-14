// Forever's own world on top of the Classic one (forever.db): what
// AllTheThings' Forever database (MIT) and QuestieDB's traces of the beta
// record, each row its source. Facts only: what a quest asks, as each source
// lists it; an addon draws its own conclusions (Hearthtale's which creature
// is a kill, from the quest's words). Moved from Hearthtale's
// scripts/forever-data.ts. Classic's content stays: a row is marked removed
// only once a source says so (none does yet).
import type { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { repoDir, repoFile, repoTree } from "./github";
import { ROOT } from "./pins";

type Trace = Record<string, unknown>;
type AttObjective = { index?: number; text?: string; provider?: [string, number]; cr?: number; crs?: number[] };
type AttQuest = {
  id: number;
  title?: string;
  map?: string;
  qg?: number[];
  qgNames?: string;
  provider?: [string, number];
  races?: unknown;
  classes?: unknown;
  lvl?: number | number[];
  prev?: number[];
  repeatable?: boolean;
  objectives: AttObjective[];
  rewards: number[];
  found: { item: number; from: string; id: number; name?: string }[];
};
type Sources = {
  att: { quests: Record<string, AttQuest>; npcs: Record<string, { name: string; map?: string }> };
  traces: Record<"quests" | "npcs" | "objects" | "items", Record<string, Trace>>;
};

const log = (s: string) => console.log(`  ${s}`);
const CLASS: Record<string, number> = {
  WARRIOR: 1,
  PALADIN: 2,
  HUNTER: 4,
  ROGUE: 8,
  PRIEST: 16,
  SHAMAN: 64,
  MAGE: 128,
  WARLOCK: 256,
  DRUID: 1024,
};
const RACE: Record<string, number> = { HUMAN: 1, ORC: 2, DWARF: 4, NIGHTELF: 8, UNDEAD: 16, SCOURGE: 16, TAUREN: 32, GNOME: 64, TROLL: 128 };
const ALLIANCE = 1 | 4 | 8 | 64,
  HORDE = 2 | 16 | 32 | 128;
// a race list, or a side ("HORDE_ONLY"), as a ChrRaces mask
const raceMask = (r: unknown) =>
  r === "HORDE_ONLY"
    ? HORDE
    : r === "ALLIANCE_ONLY"
      ? ALLIANCE
      : Array.isArray(r)
        ? r.reduce((m: number, k) => m | (RACE[String(k)] ?? 0), 0) || null
        : null;
const classMask = (c: unknown) =>
  Array.isArray(c) ? c.reduce((m: number, k) => m | (CLASS[String(k)] ?? 0), 0) || null : null;
// "Alamar Grimm <Warlock Trainer>": a name and its subname
const nameRole = (s: string) => {
  const m = s.match(/^(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim(), sub: m[2].trim() } : { name: s.trim(), sub: null };
};
// "0/6 Windshaper Novice Seer defeated": its count and its words
const parseLine = (s?: string) => {
  const m = s?.match(/^(\d+)\/(\d+)\s+(.*)$/);
  return m ? { n: Number(m[2]), words: m[3].trim() } : s ? { n: 1, words: s.trim() } : undefined;
};

export async function foreverLayer(db: Database) {
  // the sources, downloaded once (wow-data's cache), read by bin/forever-read.lua
  const attFiles = (await repoTree("allthethings")).filter((f) =>
    /^\.contrib\/\.db\/forever\/(zones|dungeons & raids)\/.*\.lua$/.test(f),
  );
  for (const f of attFiles) await repoFile("allthethings", f);
  const TRACES = "src/corrections/Forever/traces";
  for (const f of ["foreverQuestTraces", "foreverNpcTraces", "foreverObjectTraces", "foreverItemTraces"])
    await repoFile("questiedb", `${TRACES}/${f}.lua`);
  const read = spawnSync(
    "luajit",
    [path.join(ROOT, "bin", "forever-read.lua"), repoDir("allthethings", ".contrib/.db/forever"), repoDir("questiedb", TRACES)],
    { maxBuffer: 1 << 28 },
  );
  if (read.status !== 0) throw new Error(`forever-read.lua: ${read.stderr}`);
  const sources = JSON.parse(read.stdout.toString()) as Sources;

  // what the Classic world already has
  const has = (table: string) => new Set((db.query(`SELECT id FROM ${table}`).all() as { id: number }[]).map((r) => r.id));
  const creatures = has("creature"),
    objects = has("object"),
    items = has("item"),
    quests = has("quest");
  const classicQuests = new Set(quests);
  // (the client's quest ids: a quest Forever has)
  const questV2 = new Set((db.query("SELECT ID AS id FROM client_QuestV2").all() as { id: number }[]).map((r) => r.id));

  // ── places: an ATT map constant ("MAP.ZEPHRAS_ISLE") is the zone of that name
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/^the /, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const JUNK = /UNUSED|unused|^Jeff |TEST|DELETE|Delete ME|Test|\*\*\*|^GM |Programmer|Designer|Not Used|^zz/;
  const areas = db
    .query("SELECT a.ID AS id, a.ParentAreaID AS parent, n.name FROM client_AreaTable a JOIN name n ON n.kind = 'area' AND n.id = a.ID AND n.locale = 'enUS'")
    .all() as { id: number; parent: number; name: string }[];
  const parentOf = new Map(areas.map((a) => [a.id, a.parent]));
  const zoneByName = new Map<string, number>();
  for (const top of [true, false])
    for (const a of areas)
      if (!JUNK.test(a.name) && (a.parent === 0) === top && !zoneByName.has(norm(a.name))) zoneByName.set(norm(a.name), a.id);
  const rootOf = (id: number) => {
    for (let i = 0; i < 6 && (parentOf.get(id) ?? 0) !== 0; i++) id = parentOf.get(id)!;
    return id;
  };
  const zoneOf = (map?: string) => {
    if (!map?.startsWith("MAP.") || /^MAP\.(EASTERN_KINGDOMS|KALIMDOR|AZEROTH)$/.test(map)) return null;
    const id = zoneByName.get(norm(map.slice(4).replace(/_/g, " ")));
    return id ? rootOf(id) : null;
  };

  const insertCreature = db.prepare(
    "INSERT OR IGNORE INTO creature (id, source) VALUES (?, ?)",
  );
  const insertObject = db.prepare("INSERT OR IGNORE INTO object (id, source) VALUES (?, ?)");
  const insertItem = db.prepare("INSERT OR IGNORE INTO item (id, source) VALUES (?, ?)");
  const insertName = db.prepare("INSERT OR IGNORE INTO name VALUES (?, ?, 'enUS', ?, NULL, ?)");
  const insertSpawn = db.prepare(
    "INSERT INTO spawn VALUES (?, NULL, ?, NULL, NULL, NULL, NULL, ?, NULL, ?, ?, 'questiedb')",
  );
  const insertRelation = db.prepare("INSERT OR IGNORE INTO quest_relation VALUES (?, ?, ?, ?, ?)");
  // (a drop two sources tell, or one twice: once each)
  const dropped = new Set<string>();
  const loot = db.prepare("INSERT INTO loot VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?)");
  const insertLoot = {
    run: (kind: string, from: number, item: number, source: string) => {
      const key = `${kind}|${from}|${item}|${source}`;
      if (dropped.has(key)) return { changes: 0 };
      dropped.add(key);
      return loot.run(kind, from, item, source);
    },
  };
  const insertQuest = db.prepare(
    `INSERT INTO quest (id, level, min_level, zone_id, races, classes, prev_id, flags, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertText = db.prepare("INSERT OR IGNORE INTO quest_text VALUES (?, 'enUS', ?, ?, ?)");
  const insertObjective = db.prepare("INSERT OR IGNORE INTO quest_objective VALUES (?, ?, ?, ?, ?, ?, ?)");
  const insertReward = db.prepare("INSERT INTO quest_reward VALUES (?, ?, ?, ?, 'allthethings')");
  const count = { creatures: 0, objects: 0, items: 0, quests: 0, spawns: 0, relations: 0, loot: 0 };

  db.transaction(() => {
    // creatures and objects the traces saw: new ones, Forever's spawns of all, what they give and take back
    for (const [kind, table, traced, known] of [
      ["creature", "creature", sources.traces.npcs, creatures],
      ["object", "object", sources.traces.objects, objects],
    ] as const) {
      for (const [sid, t] of Object.entries(traced)) {
        const id = Number(sid);
        if (!known.has(id) && typeof t.name === "string") {
          (table === "creature" ? insertCreature : insertObject).run(id, "questiedb");
          known.add(id);
          count[table === "creature" ? "creatures" : "objects"]++;
        }
        if (typeof t.name === "string") insertName.run(kind, id, t.name, "questiedb");
        for (const [zone, points] of Object.entries((t.spawns ?? {}) as Record<string, [number, number][]>))
          for (const [x, y] of points) {
            insertSpawn.run(kind, id, Number(zone), x, y);
            count.spawns++;
          }
        for (const q of (t.questStarts ?? []) as number[]) count.relations += insertRelation.run(q, "start", kind, id, "questiedb").changes;
        for (const q of (t.questEnds ?? []) as number[]) count.relations += insertRelation.run(q, "end", kind, id, "questiedb").changes;
      }
    }
    // creatures AllTheThings names (an npc, a quest's giver: "Name <Role>")
    for (const [sid, n] of Object.entries(sources.att.npcs)) {
      const id = Number(sid);
      if (!creatures.has(id)) {
        insertCreature.run(id, "allthethings");
        creatures.add(id);
        count.creatures++;
      }
      const { name, sub } = nameRole(n.name);
      insertName.run("creature", id, name, "allthethings");
      if (sub) insertName.run("creature_subname", id, sub, "allthethings");
    }
    for (const q of Object.values(sources.att.quests)) {
      const names = (q.qgNames ?? "").split(/,\s*/);
      (q.qg ?? []).forEach((id, i) => {
        if (!creatures.has(id)) {
          insertCreature.run(id, "allthethings");
          creatures.add(id);
          count.creatures++;
        }
        if (names[i]) {
          const { name, sub } = nameRole(names[i]);
          insertName.run("creature", id, name, "allthethings");
          if (sub) insertName.run("creature_subname", id, sub, "allthethings");
        }
      });
    }
    // items the traces saw, and what drops them
    for (const [sid, t] of Object.entries(sources.traces.items)) {
      const id = Number(sid);
      if (!items.has(id) && typeof t.name === "string") {
        insertItem.run(id, "questiedb");
        items.add(id);
        count.items++;
      }
      if (typeof t.name === "string") insertName.run("item", id, t.name, "questiedb");
      for (const c of (t.npcDrops ?? []) as number[]) count.loot += insertLoot.run("creature", c, id, "questiedb").changes;
      for (const o of (t.objectDrops ?? []) as number[]) count.loot += insertLoot.run("object", o, id, "questiedb").changes;
    }

    // quests of Forever's own: the client knows them, the Classic database doesn't
    const ids = new Set(
      [...Object.keys(sources.att.quests), ...Object.keys(sources.traces.quests)]
        .map(Number)
        .filter((id) => !classicQuests.has(id) && questV2.has(id)),
    );
    for (const id of [...ids].sort((a, b) => a - b)) {
      const a = sources.att.quests[id];
      const t = sources.traces.quests[id] ?? {};
      const title = (t.name as string | undefined) ?? a?.title;
      if (!title) continue;
      const lvl = Array.isArray(a?.lvl) ? a.lvl[0] : a?.lvl;
      const level = (t.questLevel as number | undefined) ?? lvl ?? null;
      const src = t.name ? "questiedb" : "allthethings";
      // (where: ATT's map, else the zone its giver stands in, as the traces saw it)
      const started = (t.startedBy ?? []) as number[][];
      const giver = a?.qg?.[0] ?? started[0]?.[0];
      const giverZone = giver
        ? ((sources.traces.npcs[giver]?.zoneID as number | undefined) ?? null)
        : null;
      insertQuest.run(
        id,
        level,
        lvl ?? null,
        zoneOf(a?.map) ?? (giverZone ? rootOf(giverZone) : null),
        raceMask(a?.races),
        classMask(a?.classes),
        a?.prev?.[0] ?? null,
        a?.repeatable ? 1 : null,
        src,
      );
      quests.add(id);
      count.quests++;
      insertName.run("quest", id, title, src);
      const text = ((t.objectivesText ?? []) as string[]).join(" ");
      if (text) insertText.run(id, "objectives", text, "questiedb");
      // what it asks: AllTheThings' lines (their counts, their words), the traces' lists
      const k = { creature: 0, object: 0, item: 0, event: 0 };
      for (const o of a?.objectives ?? []) {
        const line = parseLine(o.text);
        const [p, pid] = o.provider ?? [];
        const kind = p === "n" ? "creature" : p === "o" ? "object" : p === "i" ? "item" : "event";
        insertObjective.run(id, ++k[kind], kind, kind === "event" ? 0 : (pid ?? 0), line?.n ?? null, o.text ?? null, "allthethings");
        // (a creature the quest log names: "0/6 Windshaper Novice Seer slain")
        const named = kind === "creature" && line?.words.match(/^(.*?)\s+(slain|defeated|killed)$/);
        if (named && pid) {
          if (!creatures.has(pid)) {
            insertCreature.run(pid, "allthethings");
            creatures.add(pid);
            count.creatures++;
          }
          insertName.run("creature", pid, named[1], "allthethings");
        }
        if (kind === "item" && pid) for (const c of [o.cr, ...(o.crs ?? [])]) if (c) count.loot += insertLoot.run("creature", c, pid, "allthethings").changes;
      }
      const listed = (t.objectives ?? {}) as Record<string, number[][]>;
      for (const [slot, kind] of [
        ["1", "creature"],
        ["2", "object"],
        ["3", "item"],
      ] as const)
        (listed[slot] ?? []).forEach(([tid], i) => insertObjective.run(id, i + 1, kind, tid, null, null, "questiedb"));
      // who gives it and takes it back
      for (const g of a?.qg ?? []) count.relations += insertRelation.run(id, "start", "creature", g, "allthethings").changes;
      if (a?.provider?.[0] === "o") count.relations += insertRelation.run(id, "start", "object", a.provider[1], "allthethings").changes;
      const finished = (t.finishedBy ?? []) as number[][];
      for (const [i, kind] of ["creature", "object", "item"].entries()) {
        for (const e of started[i] ?? []) count.relations += insertRelation.run(id, "start", kind, e, "questiedb").changes;
        if (kind !== "item") for (const e of finished[i] ?? []) count.relations += insertRelation.run(id, "end", kind, e, "questiedb").changes;
      }
      for (const r of a?.rewards ?? []) insertReward.run(id, "item", r, null);
      for (const f of a?.found ?? [])
        count.loot += insertLoot.run(f.from === "o" ? "object" : "creature", f.id, f.item, "allthethings").changes;
    }
    // (a new creature's or object's loot rows are keyed by its own id)
    db.run("UPDATE creature SET loot_id = id WHERE loot_id IS NULL AND source != 'classicdb' AND id IN (SELECT source_id FROM loot WHERE kind = 'creature')");
    db.run("UPDATE object SET loot_id = id WHERE loot_id IS NULL AND source != 'classicdb' AND id IN (SELECT source_id FROM loot WHERE kind = 'object')");
  })();
  for (const [k, v] of Object.entries(count)) log(`forever ${k}: ${v}`);
}
