import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../src/pins";
import { gameText, type PlayerFact, pick, players, resolveMarks } from "../src/players";

// A database with the schema, a creature type's names and what other sources had.
function world() {
  const db = new Database(":memory:");
  db.exec(readFileSync(path.join(ROOT, "schema.sql"), "utf8"));
  db.run("INSERT INTO name VALUES ('creature_type', 1, 'enUS', 'Beast', NULL, 'client'), ('creature_type', 1, 'deDE', 'Wildtier', NULL, 'client')");
  db.run("INSERT INTO quest (id, source) VALUES (33, 'questie')");
  db.run("INSERT INTO quest_text VALUES (33, 'enUS', 'objectives', 'Bring 8 pieces of Tough Wolf Meat.', 'questie')");
  db.run("INSERT INTO quest_relation VALUES (33, 'start', 'creature', 196, 'questie')");
  db.run("INSERT INTO creature (id, min_level, max_level, source) VALUES (299, 1, 2, 'questie')");
  return db;
}
const fact = (locale: string, kind: string, entity: string, field: string, value: string, build = "70003", seen = 1): PlayerFact => [
  locale,
  kind,
  entity,
  field,
  value,
  build,
  seen,
];

describe("players' facts", () => {
  test("a class or race word marked: the token where it varies or names nothing, the word inside a name", () => {
    const names: Record<string, string[]> = { "enUS|Hunter": ["Hunter's Hill"], "enUS|Night Elf": [] };
    const known = (locale: string, word: string) => names[`${locale}|${word}`] ?? [];
    const one = (v: string, seen = 1) => fact("enUS", "quest", "9", "details", v, "1", seen);
    // one player: the word inside a known name stays, the address is the token
    expect(resolveMarks([one("Greetings, $C{Hunter}. Go to $C{Hunter}'s Hill.")], known)[0][4]).toBe("Greetings, $C. Go to Hunter's Hill.");
    // two players of other classes: what differs was the token; the same values merged, their counts together
    const two = resolveMarks([one("Well met, $c{hunter}.", 2), one("Well met, $c{mage}.", 3)], known);
    expect(two.map((f) => [f[4], f[6]])).toEqual([["Well met, $c.", 5]]);
    // a race word the database names nothing with: the token; a creature's name never one
    expect(resolveMarks([one("The $R{Night Elf} sentinels watch.")], known)[0][4]).toBe("The $R sentinels watch.");
    expect(resolveMarks([fact("enUS", "npc", "7", "name", "$R{Night Elf} Sentinel")], known)[0][4]).toBe("Night Elf Sentinel");
    // an unmarked twin (a player of another class saw the same words): literal, one fact
    const twin = resolveMarks([one("Seek the $c{warlock} trainer.", 1), one("Seek the warlock trainer.", 4)], known);
    expect(twin.map((f) => [f[4], f[6]])).toEqual([["Seek the warlock trainer.", 5]]);
    // no marks: as it was
    expect(resolveMarks([one("Plain $N text.")], known)[0][4]).toBe("Plain $N text.");
  });

  test("the value most players saw, then the newest build's", () => {
    expect(pick([fact("enUS", "quest", "1", "details", "a", "1", 1), fact("enUS", "quest", "1", "details", "b", "1", 3)])[4]).toBe("b");
    expect(pick([fact("enUS", "quest", "1", "details", "a", "70003", 2), fact("enUS", "quest", "1", "details", "b", "70290", 2)])[4]).toBe("b");
    expect(gameText("Hey $N.\n\nBring meat.")).toBe("Hey $N.$B$BBring meat.");
  });

  test("they fill gaps only: another source's facts stay its", () => {
    const db = world();
    players(db, [
      fact("enUS", "quest", "33", "objectives", "Bring 8 Tough Wolf Meat."),
      fact("enUS", "quest", "33", "details", "Hey $N.\nBring meat."),
      fact("enUS", "quest", "33", "giver", "npc:197"),
      fact("enUS", "quest", "33", "ender", "npc:197"),
      fact("enUS", "npc", "299", "level", "[2,5]"),
    ]);
    const texts = db.query("SELECT field, text, source FROM quest_text WHERE quest_id = 33 ORDER BY field").all();
    expect(texts).toEqual([
      { field: "details", text: "Hey $N.$BBring meat.", source: "players" },
      { field: "objectives", text: "Bring 8 pieces of Tough Wolf Meat.", source: "questie" },
    ]);
    const roles = db.query("SELECT role, entity_id, source FROM quest_relation WHERE quest_id = 33 ORDER BY role").all();
    expect(roles).toEqual([
      { role: "end", entity_id: 197, source: "players" },
      { role: "start", entity_id: 196, source: "questie" },
    ]);
    expect(db.query("SELECT min_level, max_level FROM creature WHERE id = 299").get()).toEqual({ min_level: 1, max_level: 2 });
  });

  test("a creature no source knows, as players met it, in their language", () => {
    const db = world();
    const told = players(db, [
      fact("deDE", "npc", "250001", "name", "Sturmkrähe"),
      fact("deDE", "npc", "250001", "level", "[12,12]"),
      fact("enUS", "npc", "250001", "level", "[11,12]"),
      fact("deDE", "npc", "250001", "type", "Wildtier"),
      fact("deDE", "npc", "250001", "rank", "rareelite"),
      fact("deDE", "npc", "250001", "where", "[1411,46.1,25]"),
      fact("deDE", "say", "250001", "yell", "Ihr stört meine Ruhe, $N!"),
      fact("deDE", "gossip", "250001", "text", "Was wollt Ihr?\nGeht."),
      fact("deDE", "loot", "npc:250001", "item", "2589"),
      fact("deDE", "loot", "npc:250001", "item", "750"),
      fact("deDE", "loot", "object:180001", "item", "3355"),
    ]);
    expect(db.query("SELECT min_level, max_level, type_id, rank, loot_id, source FROM creature WHERE id = 250001").get()).toEqual({
      min_level: 11,
      max_level: 12,
      type_id: 1,
      rank: 2,
      loot_id: 250001,
      source: "players",
    });
    expect(db.query("SELECT name FROM name WHERE kind = 'creature' AND id = 250001 AND locale = 'deDE'").get()).toEqual({ name: "Sturmkrähe" });
    expect(db.query("SELECT ui_map_id, observer_x, observer_y, seen FROM creature_sighting WHERE npc_id = 250001").get())
      .toEqual({ ui_map_id: 1411, observer_x: 46.1, observer_y: 25, seen: 1 });
    expect(db.query("SELECT * FROM spawn WHERE entity_id = 250001").all()).toEqual([]);
    expect(db.query("SELECT kind, text FROM npc_line WHERE npc_id = 250001 ORDER BY kind").all()).toEqual([
      { kind: "gossip", text: "Was wollt Ihr?$BGeht." },
      { kind: "yell", text: "Ihr stört meine Ruhe, $N!" },
    ]);
    expect(db.query("SELECT kind, source_id, item_id FROM loot ORDER BY kind, item_id").all()).toEqual([
      { kind: "creature", source_id: 250001, item_id: 750 },
      { kind: "creature", source_id: 250001, item_id: 2589 },
      { kind: "object", source_id: 180001, item_id: 3355 },
    ]);
    expect(told.creatures).toBe(1);
  });

  test("observer positions remain sightings, including multiple places and creatures with known spawns", () => {
    const db = world();
    db.run("INSERT INTO spawn (kind, entity_id, ui_map_id, ux, uy, source) VALUES ('creature', 299, 1426, 40, 50, 'questie')");
    const facts = [
      fact("enUS", "npc", "299", "where", "[1426,47.2,52]"),
      fact("enUS", "npc", "299", "where", "[1426,48,53]"),
      fact("enUS", "npc", "299", "where", "[1426]"),
      fact("enUS", "npc", "299", "where", "[1426,101,52]"),
      fact("enUS", "npc", "299", "where", "[1426,47.2,null]"),
      fact("enUS", "npc", "299", "where", "broken"),
    ];
    expect(players(db, facts)).toEqual({ sightings: 2 });
    expect(players(db, facts)).toEqual({});
    expect(db.query("SELECT ui_map_id, ux, uy, source FROM spawn WHERE entity_id = 299").all())
      .toEqual([{ ui_map_id: 1426, ux: 40, uy: 50, source: "questie" }]);
    expect(db.query("SELECT count(*) AS n FROM creature_sighting WHERE npc_id = 299").get()).toEqual({ n: 2 });
    db.close();
  });

  test("a creature's type and family by their ids, as the addons keep them now", () => {
    const db = world();
    players(db, [fact("frFR", "npc", "250002", "typeId", "1"), fact("frFR", "npc", "250002", "familyId", "1")]);
    expect(db.query("SELECT type_id, family_id FROM creature WHERE id = 250002").get()).toEqual({ type_id: 1, family_id: 1 });
  });

  test("a source's loot is never added to", () => {
    const db = world();
    db.run("UPDATE creature SET loot_id = 299 WHERE id = 299");
    db.run("INSERT INTO loot (kind, source_id, item_id, chance, source) VALUES ('creature', 299, 750, 80, 'classicdb')");
    players(db, [fact("enUS", "loot", "npc:299", "item", "2589")]);
    expect(db.query("SELECT item_id FROM loot WHERE source_id = 299").all()).toEqual([{ item_id: 750 }]);
  });
});
