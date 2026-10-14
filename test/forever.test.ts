// The Forever database: Classic's world kept, Forever's own added from
// AllTheThings and QuestieDB's traces, each row its source (bun
// bin/build.ts forever first; skipped where it isn't built).
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

  test("Classic's world kept: Hogger, The Troll Cave", () => {
    expect(name("creature", 448)).toBe("Hogger");
    expect(name("quest", 182)).toBe("The Troll Cave");
  });
  test("a quest of Forever's own: Foul Matriarch, on Zephras Isle", () => {
    expect(name("quest", 92470)).toBe("Foul Matriarch");
    const q = one("SELECT zone_id, level, prev_id, source FROM quest WHERE id = 92470");
    expect(q).toEqual({ zone_id: 16593, level: 5, prev_id: 92471, source: "questiedb" });
    expect(name("area", 16593)).toBe("Zephras Isle");
    expect(name("area", 16593, "frFR")).toBe("Île de Zéphras");
  });
  test("what it asks, as each source lists it", () => {
    expect(all("SELECT kind, target_id, count, text FROM quest_objective WHERE quest_id = 92470 AND source = 'allthethings' ORDER BY kind")).toEqual([
      { kind: "creature", target_id: 250937, count: 8, text: "0/8 Ursera Scavenger slain" },
      { kind: "item", target_id: 252665, count: 1, text: "0/1 Head of Urs'anah" },
    ]);
    expect(one("SELECT count(*) AS n FROM quest_objective WHERE quest_id = 92470 AND source = 'questiedb'")).toEqual({ n: 2 });
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
  test("every source accounted for", () => {
    const sources = all("SELECT name FROM source ORDER BY name").map((r) => r.name);
    expect(sources).toEqual(["allthethings", "classicdb", "client", "pfquest", "questiedb"]);
    for (const table of ["creature", "quest", "quest_objective", "quest_relation", "spawn", "loot", "name"]) {
      const used = all(`SELECT DISTINCT source FROM ${table}`).map((r) => r.source as string);
      for (const s of used) expect(sources).toContain(s);
    }
  });
});
