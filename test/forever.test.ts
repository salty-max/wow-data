// The Forever database: Questie's Forever (Classic's world and Forever's
// own), the Classic database for what Questie lacks, each row its source
// (bun bin/build.ts forever first; skipped where it isn't built).
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { dbPath, openDb } from "../src/db";

const built = existsSync(dbPath("forever"));
describe.skipIf(!built)("forever.db", () => {
  const db = built ? openDb("forever") : null!;
  const one = (sql: string, ...args: (string | number)[]) => db.query(sql).get(...args) as Record<string, unknown>;
  const all = (sql: string, ...args: (string | number)[]) => db.query(sql).all(...args) as Record<string, unknown>[];
  const name = (kind: string, id: number, locale = "enUS") =>
    (one("SELECT name FROM name WHERE kind = ? AND id = ? AND locale = ?", kind, id, locale) ?? {}).name;

  test("Classic's creatures at the game's levels (Morganth 27, Murloc Oracle 17-18)", () => {
    expect(db.query("SELECT min_level, max_level FROM creature WHERE id = 397").get()).toEqual({ min_level: 27, max_level: 27 });
    expect(db.query("SELECT min_level, max_level FROM creature WHERE id = 517").get()).toEqual({ min_level: 17, max_level: 18 });
  });
  test("Classic's world kept: Hogger, The Troll Cave", () => {
    expect(name("creature", 448)).toBe("Hogger");
    expect(name("quest", 182)).toBe("The Troll Cave");
  });
  test("a quest of Forever's own: Foul Matriarch, on Zephras Isle", () => {
    expect(name("quest", 92470)).toBe("Foul Matriarch");
    const q = one("SELECT zone_id, level, prev_id, source FROM quest WHERE id = 92470");
    expect(q).toEqual({ zone_id: 16593, level: 5, prev_id: 92471, source: "questie" });
    expect(name("area", 16593)).toBe("Zephras Isle");
    expect(name("area", 16593, "frFR")).toBe("Île de Zéphras");
  });
  test("what it asks, and what it gives", () => {
    expect(all("SELECT kind, target_id, source FROM quest_objective WHERE quest_id = 92470 ORDER BY kind")).toEqual([
      { kind: "creature", target_id: 250937, source: "questie" },
      { kind: "item", target_id: 252665, source: "questie" },
    ]);
    expect(all("SELECT ref_id, count FROM quest_reward WHERE quest_id = 92470 AND kind = 'reputation' ORDER BY ref_id")).toEqual([
      { ref_id: 2778, count: 50 },
      { ref_id: 2779, count: 50 },
    ]);
  });
  test("a Classic quest's count, the Classic database's in Questie's row", () => {
    expect(all("SELECT kind, target_id, count, source FROM quest_objective WHERE quest_id = 182")).toEqual([
      { kind: "creature", target_id: 706, count: 14, source: "questie" },
    ]);
  });
  test("its giver, named and placed", () => {
    expect(all("SELECT DISTINCT role FROM quest_relation WHERE quest_id = 92470 AND entity_id = 251366 ORDER BY role")).toEqual([
      { role: "end" },
      { role: "start" },
    ]);
    expect(name("creature", 251366)).toBe("Aetheen of the Gales");
    expect(one("SELECT count(*) > 0 AS placed FROM spawn WHERE kind = 'creature' AND entity_id = 251366 AND area_id = 16593")).toEqual({
      placed: 1,
    });
  });
  test("a chain's first quest, Forever's chains too", () => {
    expect(one("SELECT chain_root IS NOT NULL AS chained FROM quest WHERE id = 92470")).toEqual({ chained: 1 });
  });
  test("Forever's specializations, named in every language", () => {
    expect(one("SELECT name, female FROM name WHERE kind = 'specialization' AND id = 1491 AND locale = 'frFR'")).toEqual({
      name: "Guerrier",
      female: "Guerrière",
    });
  });
  test("names: the client's first, then Questie's, then the frozen Wowhead ones", () => {
    expect(one("SELECT name, source FROM name WHERE kind = 'creature' AND id = 706 AND locale = 'frFR'")).toEqual({
      name: "Jeune troll Frostmane",
      source: "questie",
    });
    expect(name("creature", 706, "deDE")).toBe("Trollwelpe der Frostmane");
    // (Forever's own, which Questie doesn't translate)
    expect(one("SELECT name, source FROM name WHERE kind = 'quest' AND id = 92470 AND locale = 'frFR'")).toEqual({
      name: "Matriarche ignoble",
      source: "wowhead",
    });
    expect(name("quest", 182, "frFR")).toBe("La caverne des trolls");
    // (a rank Questie's traces don't give, Forever's own rare: the tooltips')
    expect(one("SELECT rank FROM creature WHERE id = 276189")).toEqual({ rank: 4 });
    // (Forever's renames, its client's own, over Questie's lagging French)
    expect(one("SELECT name, source FROM name WHERE kind = 'creature' AND id = 3571 AND locale = 'frFR'")).toEqual({
      name: "Sentinelle de Dolanaar",
      source: "wowhead",
    });
    expect(one("SELECT name, source FROM name WHERE kind = 'area' AND id = 1537 AND locale = 'frFR'")).toEqual({
      name: "Forgefer",
      source: "client",
    });
  });
  test("a book's pages in French, as the game writes them", () => {
    const page = one("SELECT text FROM readable_page WHERE kind = 'item' AND id = 745 AND locale = 'frFR' AND idx = 1");
    expect(String(page.text)).toStartWith("RAPPORT : Les kobolds");
  });
  test("a quest's prerequisites: Questie's alternatives, AllTheThings' where it has none", () => {
    // ("Call of Earth": one a side's)
    expect(all("SELECT prev_id FROM quest_prereq WHERE quest_id = 92467 ORDER BY prev_id").map((r) => r.prev_id)).toEqual([1516, 1519, 92466]);
    // (Westfall's new chain, which Questie doesn't link)
    expect(one("SELECT source FROM quest_prereq WHERE quest_id = 92745 AND prev_id = 92744")).toEqual({ source: "allthethings" });
  });

  test("every source accounted for", () => {
    const sources = all("SELECT name FROM source ORDER BY name").map((r) => r.name);
    // (allthethings: Forever's own quests' rewards and prerequisites, frozen)
    expect(sources).toEqual(["allthethings", "classicdb", "client", "questie", "wowhead"]);
    for (const table of ["creature", "quest", "quest_objective", "quest_relation", "quest_reward", "quest_prereq", "spawn", "loot", "name"]) {
      const used = all(`SELECT DISTINCT source FROM ${table}`).map((r) => r.source as string);
      for (const s of used) expect(sources).toContain(s);
    }
  });
  test("no name is Wowhead's English in brackets (the client shows the English)", () => {
    expect(one("SELECT count(*) AS n FROM name WHERE source = 'wowhead' AND name LIKE '[%]'")).toEqual({ n: 0 });
  });
  test("the client's other words in every language: the interface's strings, an item's flavour line", () => {
    expect(
      one("SELECT n.name FROM client_GlobalStrings g JOIN name n ON n.kind = 'global_string' AND n.id = g.ID AND n.locale = 'deDE' WHERE g.BaseTag = 'PVP_RANK_12_0'"),
    ).toEqual({ name: "Zornbringer" });
    expect(one("SELECT count(*) > 1000 AS ok FROM name WHERE kind = 'item_description' AND locale = 'frFR'")).toEqual({ ok: 1 });
  });
  test("Wowhead's pages fill Forever's gaps: a quest of its latest additions, texts, a creature's facts, lines", () => {
    expect(one("SELECT level, zone_id, source FROM quest WHERE id = 95786")).toEqual({ level: 40, zone_id: 33, source: "wowhead" });
    expect(name("quest", 95786)).toBe("An Acquaintance in Southshore");
    expect(String(one("SELECT text FROM quest_text WHERE quest_id = 95786 AND locale = 'enUS' AND field = 'details'").text)).toStartWith("$N, I have a friend in the Hillsbrad Foothills");
    // (Wowhead's own tip after a quest's text is no part of it)
    expect(one("SELECT text FROM quest_text WHERE quest_id = 1191 AND locale = 'enUS' AND field = 'details'").text).toBe("Let's go!");
    expect(one("SELECT type_id, rank, display_ids FROM creature WHERE id = 268690")).toEqual({ type_id: 4, rank: 0, display_ids: "145131" });
    expect(all("SELECT kind, text FROM npc_line WHERE npc_id = 232929 AND locale = 'enUS'")).toContainEqual({ kind: "say", text: "Here they come!" });
  });
});
