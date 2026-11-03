// The class guide's data (schema.sql, docs/class-guide.md): the level a spell
// is learned at, the talents as the talent window shows them, and what each
// class has to learn, from the client's own tables in either game.
import { Database } from "bun:sqlite";
import { type Game } from "./pins";
import { LOCALES, wago } from "./wago";

const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const log = (s: string) => console.log(`  ${s}`);

// the first talent point is taken at level 10, one more a level
export const FIRST_TALENT_LEVEL = 10;
// a node's distance to its neighbour in the trait trees' layout
const CELL = 600;
// two tabs of a tree are further apart than this; the columns of a tab are not
const TAB_GAP = 1500;
// the layouts end near 11000: a node placed past this is off the window, taken out of the
// tree (Lightning Reflexes' old node at x 102800, whose new one stands in the tree; Improved
// Serpent Sting at y 39300, where Trueshot Aura took its place)
const FAR = 20000;

type Q = Record<string, unknown>;
const all = (db: Database, sql: string): Q[] => db.query(sql).all() as Q[];

// ChrClasses id of a single-class mask (Warrior 1 -> 1, Paladin 2 -> 2, Hunter 4 -> 3...)
export function classOfMask(mask: number): number | null {
  return mask > 0 && (mask & (mask - 1)) === 0 ? Math.log2(mask) + 1 : null;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function spellLevels(db: Database) {
  const n = db.run(
    `INSERT INTO spell_level SELECT SpellID, SpellLevel, BaseLevel, MaxLevel, 'client' FROM client_SpellLevels
     WHERE DifficultyID = 0 AND SpellLevel > 0 GROUP BY SpellID`,
  ).changes;
  log(`spell_level: ${n}`);
}

// Classic Era: the Talent table, a row for each talent
function eraTalents(db: Database) {
  const tabClass = new Map(all(db, "SELECT ID, ClassMask FROM client_TalentTab").map((t) => [num(t.ID), classOfMask(num(t.ClassMask))]));
  const insert = db.prepare("INSERT INTO talent VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'client')");
  const rank = db.prepare("INSERT INTO talent_rank VALUES (?, ?, ?)");
  const prereq = db.prepare("INSERT INTO talent_prereq VALUES (?, ?, ?, NULL)");
  let n = 0;
  db.transaction(() => {
    for (const t of all(db, "SELECT * FROM client_Talent")) {
      const cls = tabClass.get(num(t.TabID));
      if (!cls) throw new Error(`talent ${t.ID}: tab ${t.TabID} has no single class`);
      const spells: number[] = [];
      for (let i = 0; i < 9; i++) if (num(t[`SpellRank_${i}`])) spells.push(num(t[`SpellRank_${i}`]));
      const points = 5 * num(t.TierID);
      insert.run(num(t.ID), cls, num(t.TabID), num(t.TierID), num(t.ColumnIndex), spells.length, spells[0], points, FIRST_TALENT_LEVEL + points, num(t.ID), num(t.TabID));
      spells.forEach((s, i) => rank.run(num(t.ID), i + 1, s));
      for (let i = 0; i < 3; i++) if (num(t[`PrereqTalent_${i}`])) prereq.run(num(t.ID), num(t[`PrereqTalent_${i}`]), num(t[`PrereqRank_${i}`]) + 1);
      n++;
    }
  })();
  log(`talent: ${n} (Classic Era's Talent table)`);
}

// Forever: retail's trait trees. Each class has one live tree, named by
// SkillLineXTraitTree (the client carries older and partial trees of the same
// class too: they are not read). A node's tab is the cluster of columns it
// stands in, its row and column its position in cells from the tab's own
// origin, found from the talents Classic had (the median of their offsets: a
// few were moved).
function foreverTalents(db: Database) {
  const era = all(db, "SELECT * FROM client_Talent") as Record<string, string>[];
  const tabClass = new Map(all(db, "SELECT ID, ClassMask FROM client_TalentTab").map((t) => [num(t.ID), classOfMask(num(t.ClassMask))!]));
  const eraBySpell = new Map<number, Record<string, string>>();
  for (const t of era) if (num(t.SpellRank_0)) eraBySpell.set(num(t.SpellRank_0), t);

  const definition = new Map(all(db, "SELECT ID, SpellID FROM client_TraitDefinition").map((d) => [num(d.ID), num(d.SpellID)]));
  const entries = new Map(all(db, "SELECT ID, TraitDefinitionID, MaxRanks FROM client_TraitNodeEntry").map((e) => [num(e.ID), e]));
  const nodeEntries = new Map<number, number[]>();
  for (const r of all(db, "SELECT TraitNodeID, TraitNodeEntryID FROM client_TraitNodeXTraitNodeEntry ORDER BY _Index")) {
    const list = nodeEntries.get(num(r.TraitNodeID)) ?? [];
    list.push(num(r.TraitNodeEntryID));
    nodeEntries.set(num(r.TraitNodeID), list);
  }
  // (the points a node's group asks for: a group's condition of type spent-in-tree)
  const groupReq = new Map<number, number>();
  for (const r of all(
    db,
    `SELECT x.TraitNodeGroupID g, c.SpentAmountRequired r FROM client_TraitNodeGroupXTraitCond x JOIN client_TraitCond c ON c.ID = x.TraitCondID WHERE c.SpentAmountRequired > 0`,
  ))
    groupReq.set(num(r.g), Math.max(groupReq.get(num(r.g)) ?? 0, num(r.r)));
  const nodeReq = new Map<number, number>();
  for (const r of all(db, "SELECT TraitNodeGroupID g, TraitNodeID n FROM client_TraitNodeGroupXTraitNode"))
    if (groupReq.has(num(r.g))) nodeReq.set(num(r.n), Math.max(nodeReq.get(num(r.n)) ?? 0, groupReq.get(num(r.g))!));

  const insert = db.prepare("INSERT INTO talent VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'client')");
  const nodeTalent = new Map<number, number>();
  const classes = new Set<number>();
  let n = 0, hidden = 0, fresh = 0, moved = 0, multi = 0, offGrid = 0, reqOff = 0;
  const trees = all(db, "SELECT SkillLineID, TraitTreeID FROM client_SkillLineXTraitTree");
  if (trees.length !== 9) throw new Error(`SkillLineXTraitTree names ${trees.length} trees, not 9`);
  db.transaction(() => {
    for (const { TraitTreeID } of trees) {
      const tree = num(TraitTreeID);
      type N = { id: number; x: number; y: number; entry: number; spell: number; max: number; era?: Record<string, string> };
      const nodes: N[] = [];
      for (const nd of all(db, `SELECT ID, PosX, PosY FROM client_TraitNode WHERE TraitTreeID = ${tree}`)) {
        const list = nodeEntries.get(num(nd.ID));
        if (!list?.length) continue;
        if (list.length > 1) multi++;
        const entry = entries.get(list[0])!;
        const spell = definition.get(num(entry.TraitDefinitionID))!;
        if (num(nd.PosX) > FAR || num(nd.PosY) > FAR) {
          hidden++;
          continue;
        }
        nodes.push({ id: num(nd.ID), x: num(nd.PosX), y: num(nd.PosY), entry: list[0], spell, max: num(entry.MaxRanks), era: eraBySpell.get(spell) });
      }
      // (the class: the one Classic's talents here belong to)
      const votes = new Map<number, number>();
      for (const nd of nodes) if (nd.era) votes.set(tabClass.get(num(nd.era.TabID))!, (votes.get(tabClass.get(num(nd.era.TabID))!) ?? 0) + 1);
      if (!votes.size) throw new Error(`trait tree ${tree}: no talent of Classic's on it`);
      const [[cls, best], second] = [...votes].sort((a, b) => b[1] - a[1]);
      if (!cls || (second && second[1] * 4 > best)) throw new Error(`trait tree ${tree}: no clear class (${JSON.stringify([...votes])})`);
      if (classes.has(cls)) throw new Error(`trait tree ${tree}: class ${cls} has another tree`);
      classes.add(cls);
      // (the tabs: clusters of columns, left to right)
      const xs = [...new Set(nodes.map((nd) => nd.x))].sort((a, b) => a - b);
      const clusters: number[][] = [[xs[0]]];
      for (const x of xs.slice(1)) (x - clusters.at(-1)!.at(-1)! > TAB_GAP ? clusters.push([x]) : clusters.at(-1)!.push(x));
      const used = new Set<number>();
      const cells = new Set<string>();
      for (const cluster of clusters) {
        const mine = nodes.filter((nd) => nd.x >= cluster[0] && nd.x <= cluster.at(-1)!);
        const tv = new Map<number, number>();
        for (const nd of mine) if (nd.era) tv.set(num(nd.era.TabID), (tv.get(num(nd.era.TabID)) ?? 0) + 1);
        if (!tv.size) throw new Error(`trait tree ${tree}: the tab at x ${cluster[0]} has no talent of Classic's`);
        const [[tab, tabBest], tabSecond] = [...tv].sort((a, b) => b[1] - a[1]);
        if (!tab || (tabSecond && tabSecond[1] * 4 > tabBest) || used.has(tab) || tabClass.get(tab) !== cls)
          throw new Error(`trait tree ${tree}: tab at x ${cluster[0]} is not clearly one of the class's (${JSON.stringify([...tv])})`);
        used.add(tab);
        const matched = mine.filter((nd) => nd.era && num(nd.era.TabID) === tab);
        const x0 = median(matched.map((nd) => nd.x - CELL * num(nd.era!.ColumnIndex)));
        // (the top of the tab: from the points the game asks of the nodes below it, a row for every
        // five; else from Classic's tiers, which Forever shifted in the Holy tree of the Paladin)
        const asked = mine.filter((nd) => nodeReq.has(nd.id));
        const y0 = asked.length >= 3 ? median(asked.map((nd) => nd.y - (CELL / 5) * nodeReq.get(nd.id)!)) : median(matched.map((nd) => nd.y - CELL * num(nd.era!.TierID)));
        for (const nd of mine) {
          const col = Math.round((nd.x - x0) / CELL);
          const row = Math.round((nd.y - y0) / CELL);
          if (Math.abs(nd.x - x0 - col * CELL) > 100 || Math.abs(nd.y - y0 - row * CELL) > 100) offGrid++;
          if (col < 0 || row < 0) throw new Error(`trait tree ${tree}: node ${nd.id} falls at row ${row}, column ${col}`);
          const key = `${tab}/${row}/${col}`;
          if (cells.has(key)) throw new Error(`trait tree ${tree}: two nodes at row ${row}, column ${col} of tab ${tab}`);
          cells.add(key);
          const points = 5 * row;
          if (nodeReq.has(nd.id) && nodeReq.get(nd.id) !== points) reqOff++;
          const id = nd.era ? num(nd.era.ID) : nd.id;
          nodeTalent.set(nd.id, id);
          if (nd.era) {
            if (num(nd.era.TabID) !== tab) moved++;
          } else fresh++;
          insert.run(id, cls, tab, row, col, nd.max, nd.spell, points, FIRST_TALENT_LEVEL + points, nd.era ? num(nd.era.ID) : null, nd.era ? num(nd.era.TabID) : null, nd.id, nd.entry);
          n++;
        }
      }
    }
    // (an arrow from the talent needed first to the one it opens)
    // (type 0 is only a line drawn, and runs both ways; 2 and 3 are the requirements)
    const prereq = db.prepare("INSERT OR IGNORE INTO talent_prereq VALUES (?, ?, NULL, ?)");
    for (const e of all(db, "SELECT LeftTraitNodeID l, RightTraitNodeID r, Type t FROM client_TraitEdge WHERE Type IN (2, 3)")) {
      const needed = nodeTalent.get(num(e.l)), opens = nodeTalent.get(num(e.r));
      if (needed && opens) prereq.run(opens, needed, num(e.t));
    }
  })();
  if (reqOff || offGrid) throw new Error(`trait trees: ${reqOff} nodes ask other points than their row's five, ${offGrid} stand off the grid: the layout moved, read it again`);
  log(`talent: ${n} from ${trees.length} trait trees (${fresh} new to Forever, ${moved} moved to another tree, ${multi} nodes with several choices, ${hidden} left out for standing off the window, ${offGrid} off the grid, ${reqOff} asking other points than 5 a row)`);
}

// What a class learns: the client's SkillLineAbility with one class in its
// mask, its level, and the lesson a trainer teaches it with.
async function classSpells(db: Database, game: Game) {
  const learns = new Map<number, number[]>(); // a taught spell -> the lessons giving it
  const add = (lesson: number, taught: number, into: Map<number, number[]>) => (into.get(taught) ?? into.set(taught, []).get(taught)!).push(lesson);
  const known = new Set(all(db, "SELECT DISTINCT SpellID id FROM client_SpellEffect").map((r) => num(r.id)));
  for (const r of all(db, "SELECT SpellID id, EffectTriggerSpell taught FROM client_SpellEffect WHERE Effect = 36 AND EffectTriggerSpell > 0")) add(num(r.id), num(r.taught), learns);
  // (Forever's trainers are Classic's, their lessons Classic's own spells where this client has lost them)
  const classic = new Map<number, number[]>();
  if (game === "forever")
    for (const r of await wago("classic", "SpellEffect")) if (num(r.Effect) === 36 && num(r.EffectTriggerSpell) > 0 && !known.has(num(r.SpellID))) add(num(r.SpellID), num(r.EffectTriggerSpell), classic);
  const trainerRows = new Map<number, number>(); // a lesson -> the lowest level any trainer asks
  for (const r of all(db, "SELECT spell_id s, MIN(level) l FROM trainer_spell GROUP BY spell_id")) trainerRows.set(num(r.s), num(r.l));
  // (a lesson a quest gives, as its reward spell or the cast it ends with: the stances at 10 and 30)
  const questLessons = new Set(all(db, "SELECT DISTINCT ref_id FROM quest_reward WHERE kind IN ('spell', 'cast')").map((r) => num(r.ref_id)));
  const lesson = (spell: number, among: Set<number> | Map<number, number>): [number, string] | null => {
    for (const [from, label] of [[learns, "client"], [classic, "classic"]] as const) {
      const hit = from.get(spell)?.filter((l) => among.has(l));
      if (hit?.length) return [Math.min(...hit), label];
    }
    return null;
  };
  // (Season of Discovery's: the engravings' and the runes' skill lines, and what is learned from a rune)
  const runeLines = new Set(all(db, "SELECT ID FROM client_SkillLine WHERE DisplayName_lang IN ('Engraving', 'Runes')").map((r) => num(r.ID)));
  // (every rank of Classic's talents, Forever's too: its client keeps the table though the window shows the trait tree)
  const talentRanks = new Set<number>();
  for (const t of all(db, "SELECT * FROM client_Talent")) for (let i = 0; i < 9; i++) if (num(t[`SpellRank_${i}`])) talentRanks.add(num(t[`SpellRank_${i}`]));
  const talentSpells = new Set(all(db, "SELECT spell_id FROM talent").map((r) => num(r.spell_id)));
  const level = new Map(all(db, "SELECT spell_id s, level l FROM spell_level").map((r) => [num(r.s), num(r.l)]));
  const insert = db.prepare("INSERT OR IGNORE INTO class_spell VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'client')");
  const tally: Record<string, number> = {};
  db.transaction(() => {
    for (const r of all(db, "SELECT SkillLine, Spell, ClassMask, AcquireMethod FROM client_SkillLineAbility WHERE ClassMask > 0 ORDER BY ID")) {
      const cls = classOfMask(num(r.ClassMask));
      if (!cls) continue;
      const spell = num(r.Spell);
      const acquire = num(r.AcquireMethod);
      const taught = lesson(spell, trainerRows);
      const quest = taught ? null : lesson(spell, questLessons);
      const less = taught ?? quest;
      const kind = taught ? "trainer" : quest ? "quest" : talentRanks.has(spell) || talentSpells.has(spell) ? "talent" : acquire === 2 ? "start" : acquire === 3 || runeLines.has(num(r.SkillLine)) ? "rune" : "other";
      tally[kind] = (tally[kind] ?? 0) + 1;
      insert.run(cls, spell, num(r.SkillLine), acquire, kind, level.get(spell) ?? null, less?.[0] ?? null, less?.[1] ?? null, taught ? trainerRows.get(taught[0])! || null : null);
    }
  })();
  log(`class_spell: ${Object.values(tally).reduce((a, b) => a + b, 0)} (${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(", ")})`);
}

// Forever's client has lost some of Classic's spells (the old ids its trainers and talents still
// name: Faerie Fire (Feral) 16857, Tiger's Fury's later ranks). A class spell with no name of its
// own takes Classic's, in each language, source `classic` (the trades' lessons do the same,
// docs/sources.md): the name only, no level and no description, which Forever never had.
async function classicNames(db: Database) {
  const missing = new Set(
    all(db, `SELECT DISTINCT c.spell_id id FROM class_spell c WHERE NOT EXISTS (SELECT 1 FROM name n WHERE n.kind = 'spell' AND n.id = c.spell_id AND n.locale = 'enUS')`).map((r) => num(r.id)),
  );
  if (!missing.size) return;
  db.prepare("INSERT INTO source VALUES (?, ?, ?, ?)").run("classic", "the pinned Classic Era client's spell names", "https://wago.tools", "Blizzard's (Classic's name for an id Forever's client has lost)");
  const insert = db.prepare("INSERT OR IGNORE INTO name VALUES ('spell', ?, ?, ?, NULL, 'classic')");
  let n = 0;
  for (const locale of ["enUS", ...LOCALES]) {
    const rows = await wago("classic", "SpellName", locale);
    db.transaction(() => {
      for (const r of rows) if (missing.has(num(r.ID)) && r.Name_lang) n += insert.run(num(r.ID), locale, r.Name_lang).changes;
    })();
  }
  log(`spell names from the Classic client: ${n} (${missing.size} spells)`);
}

// Every rank of every talent is a class spell of its class (kind `talent`), whether
// SkillLineAbility gives it a class mask or not: most of them have none (Sweeping Strikes in
// Arms' line, Death Wish in Fury's, Omen of Clarity in Balance's: ClassMask 0), so the class
// book above, which wants a mask, missed them. The skill line and acquire method are the first
// SkillLineAbility row's; acquire -1 and skill_line_id 0 where the spell has no row at all.
function talentSpells(db: Database) {
  const before = (db.query("SELECT count(*) n FROM class_spell").get() as { n: number }).n;
  db.run(
    `INSERT OR IGNORE INTO class_spell
     SELECT t.class_id, s.spell_id, coalesce(a.SkillLine, 0), coalesce(a.AcquireMethod, -1), 'talent', l.level, NULL, NULL, NULL, 'client'
     FROM talent t
     JOIN (SELECT talent_id id, spell_id FROM talent_rank UNION SELECT id, spell_id FROM talent) s ON s.id = t.id
     LEFT JOIN client_SkillLineAbility a ON a.ID = (SELECT min(ID) FROM client_SkillLineAbility WHERE Spell = s.spell_id)
     LEFT JOIN spell_level l ON l.spell_id = s.spell_id`,
  );
  const after = (db.query("SELECT count(*) n FROM class_spell").get() as { n: number }).n;
  log(`class_spell: ${after - before} talent spells SkillLineAbility lacks`);
}

// SkillLineAbility gives some of a class's spells no ClassMask at all (Innervate, Omen of Clarity):
// a spell with none, in a skill line that holds one of the class's talents (Arms', Balance's:
// found by id, from the talents' own spells; not the Hunter's Beast Training, the pets', the
// mounts' or Mage's Comprehension, which hold none), is that class's, kind `other` (a
// trainer's lesson or a quest would have made it `trainer` or `quest` above), where this game's
// client names the spell. Season of Discovery's runes and engravings (acquire 3) stay out.
function unmaskedSpells(db: Database) {
  const n = db.run(
    `INSERT OR IGNORE INTO class_spell
     SELECT d.class_id, a.Spell, a.SkillLine, a.AcquireMethod, 'other', l.level, NULL, NULL, NULL, 'client'
     FROM client_SkillLineAbility a
     JOIN (SELECT DISTINCT c.class_id, c.skill_line_id sl FROM class_spell c WHERE c.kind = 'talent' AND c.skill_line_id > 0) d ON d.sl = a.SkillLine
     JOIN client_SpellName nm ON nm.ID = a.Spell
     LEFT JOIN spell_level l ON l.spell_id = a.Spell
     WHERE a.ClassMask = 0 AND a.AcquireMethod <> 3`,
  ).changes;
  log(`class_spell: ${n} spells SkillLineAbility gives no class mask, in a skill line of the class's talents`);
}

// Forever's TraitEdge has no rank and one edge points the wrong way (Intimidation needing Bestial
// Wrath, which stands two rows below it, while Bestial Wrath needs Intimidation). A requirement
// stands above or beside the talent it opens: one below is dropped. The rank is the required
// talent's last (Classic Era's 65 prerequisites all ask the full rank: checked by a test).
function foreverPrereqs(db: Database) {
  const dropped = db.run(
    `DELETE FROM talent_prereq WHERE EXISTS (
       SELECT 1 FROM talent a, talent b WHERE a.id = talent_prereq.talent_id AND b.id = talent_prereq.requires_id AND b.tab_id = a.tab_id AND b.row > a.row)`,
  ).changes;
  const ranked = db.run(`UPDATE talent_prereq SET rank = (SELECT max_rank FROM talent WHERE id = requires_id) WHERE rank IS NULL`).changes;
  log(`talent_prereq: ${dropped} edge pointing down dropped, ${ranked} ranks taken from the required talent's last`);
}

// Which race may be which class (CharBaseInfo), and the spells only some races of a class
// learn. A SkillLineAbility's race masks are 64 bits over two columns, a bit a race's
// `PlayableRaceBit` (not its id less one: Forever's 95 and 96 are bits 32 and 33); -1 is every
// race. A spell is limited to the races of the class its rows allow when every row that gives it
// to the class has a mask (one without gives it to all), the masks or-ed, and that is fewer
// than the class's races. One row a (class, spell, race).
function classRace(db: Database) {
  // (Classic Era's columns are RaceMask_0/1, Forever's RaceMasks_0/1)
  const cols = new Set(all(db, "PRAGMA table_info(client_SkillLineAbility)").map((c) => String(c.name)));
  const [c0, c1] = cols.has("RaceMasks_0") ? ["RaceMasks_0", "RaceMasks_1"] : ["RaceMask_0", "RaceMask_1"];
  const n = db.run("INSERT INTO class_race SELECT ClassID, RaceID, 'client' FROM client_CharBaseInfo GROUP BY ClassID, RaceID").changes;
  const bit = new Map(all(db, "SELECT ID, PlayableRaceBit b FROM client_ChrRaces WHERE PlayableRaceBit >= 0").map((r) => [num(r.ID), num(r.b)]));
  const races = new Map<number, number[]>();
  for (const r of all(db, "SELECT class_id, race_id FROM class_race")) races.set(num(r.class_id), [...(races.get(num(r.class_id)) ?? []), num(r.race_id)]);
  const masks = new Map<string, { mask: bigint; open: boolean }>();
  for (const r of all(db, `SELECT Spell, ClassMask, ${c0} a, ${c1} b FROM client_SkillLineAbility WHERE ClassMask > 0`)) {
    const mask = (BigInt.asUintN(32, BigInt(num(r.b))) << 32n) | BigInt.asUintN(32, BigInt(num(r.a)));
    for (let c = 1; c <= 11; c++) {
      if (!(num(r.ClassMask) & (1 << (c - 1)))) continue;
      const k = `${c}/${r.Spell}`;
      const e = masks.get(k) ?? { mask: 0n, open: false };
      if (mask) e.mask |= mask;
      else e.open = true;
      masks.set(k, e);
    }
  }
  const ins = db.prepare("INSERT INTO class_spell_race VALUES (?, ?, ?, 'client')");
  let m = 0;
  let spells = 0;
  db.transaction(() => {
    for (const r of all(db, "SELECT class_id, spell_id FROM class_spell")) {
      const e = masks.get(`${r.class_id}/${r.spell_id}`);
      const of = races.get(num(r.class_id)) ?? [];
      if (!e || !e.mask || e.open) continue;
      const allowed = of.filter((id) => bit.has(id) && (e.mask >> BigInt(bit.get(id)!)) & 1n);
      if (!allowed.length || allowed.length === of.length) continue;
      for (const id of allowed) (ins.run(num(r.class_id), num(r.spell_id), id), m++);
      spells++;
    }
  })();
  log(`class_race: ${n} · class_spell_race: ${m} rows for ${spells} spells`);
}

export async function classGuide(db: Database, game: Game) {
  spellLevels(db);
  if (game === "classic") eraTalents(db);
  else foreverTalents(db);
  await classSpells(db, game);
  talentSpells(db);
  unmaskedSpells(db);
  if (game === "forever") foreverPrereqs(db);
  classRace(db);
  if (game === "forever") await classicNames(db);
}
