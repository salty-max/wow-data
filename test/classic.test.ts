// The Classic database against facts known from the game (bun bin/build.ts
// classic first; skipped where it isn't built).
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { dbPath, openDb } from "../src/db";

const built = existsSync(dbPath("classic"));
describe.skipIf(!built)("classic.db", () => {
  const db = built ? openDb("classic") : null!;
  const one = (sql: string, ...args: (string | number)[]) => db.query(sql).get(...args) as Record<string, unknown>;
  const all = (sql: string, ...args: (string | number)[]) => db.query(sql).all(...args) as Record<string, unknown>[];
  const name = (kind: string, id: number, locale = "enUS") =>
    (one("SELECT name FROM name WHERE kind = ? AND id = ? AND locale = ?", kind, id, locale) ?? {}).name;

  test("Hogger: creature 448, an elite of level 11", () => {
    expect(name("creature", 448)).toBe("Hogger");
    expect(one("SELECT min_level, rank FROM creature WHERE id = 448")).toEqual({ min_level: 11, rank: 1 });
  });
  test("The Troll Cave: 14 of creature 706, from and back to Grelin Whitebeard", () => {
    expect(name("quest", 182)).toBe("The Troll Cave");
    expect(all("SELECT kind, target_id, count FROM quest_objective WHERE quest_id = 182")).toEqual([
      { kind: "creature", target_id: 706, count: 14 },
    ]);
    expect(all("SELECT role, kind, entity_id FROM quest_relation WHERE quest_id = 182 ORDER BY role DESC")).toEqual([
      { role: "start", kind: "creature", entity_id: 786 },
      { role: "end", kind: "creature", entity_id: 786 },
    ]);
    expect(name("creature", 786)).toBe("Grelin Whitebeard");
  });
  test("a chain's first quest: The Stolen Journal's is The Troll Cave", () => {
    expect(one("SELECT chain_root FROM quest WHERE id = 218")).toEqual({ chain_root: 182 });
  });
  test("names in every language, the client's own", () => {
    expect(name("area", 132, "frFR")).toBe("Vallée des Frigères");
    expect(name("area", 132, "deDE")).toBe("Das Coldridgetal");
    expect(name("item", 2589, "frFR")).toBe("Etoffe de lin");
    expect(one("SELECT name, female FROM name WHERE kind = 'class' AND id = 1 AND locale = 'frFR'")).toEqual({
      name: "Guerrier",
      female: "Guerrière",
    });
  });
  test("a book's pages: The Invasion of Draenor, ten", () => {
    expect(one("SELECT count(*) AS n FROM readable_page WHERE kind = 'object' AND id = 175747 AND locale = 'enUS'")).toEqual({
      n: 10,
    });
  });
  test("what npcs say, in English and six other languages", () => {
    const locales = all("SELECT DISTINCT locale FROM speech ORDER BY locale").map((r) => r.locale);
    expect(locales).toEqual(["deDE", "enUS", "esES", "esMX", "frFR", "ptBR", "ruRU"]);
  });
  test("every link an id: no entity table names a thing", () => {
    for (const table of ["creature", "object", "item", "quest"]) {
      const cols = all(`PRAGMA table_info(${table})`).map((c) => c.name);
      expect(cols).not.toContain("name");
    }
  });
  test("every row its source", () => {
    for (const table of ["creature", "spawn", "object", "item", "quest", "loot", "name", "path"]) {
      expect(one(`SELECT count(*) AS n FROM ${table} WHERE source IS NULL OR source = ''`)).toEqual({ n: 0 });
    }
  });
});
