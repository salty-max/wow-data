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
  test("a creature's levels as the game shows them, not Questie's (Riverpaw Overseer 19-20, Morganth 27, Infernal 50-60)", () => {
    const levels = (id: number) => one("SELECT min_level, max_level FROM creature WHERE id = ?", id);
    expect(levels(125)).toEqual({ min_level: 19, max_level: 20 });
    expect(levels(397)).toEqual({ min_level: 27, max_level: 27 });
    expect(levels(89)).toEqual({ min_level: 50, max_level: 60 });
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
  test("Classic's own names: Ironforge stays Ironforge in French", () => {
    expect(name("area", 1537, "frFR")).toBe("Ironforge");
    expect(name("quest", 182, "frFR")).toBe("La caverne des trolls");
    // (Classic Era's own French, kept English, over Questie's later one)
    expect(name("quest", 7782, "frFR")).toBe("Le seigneur de Blackrock");
    // (Dun Morogh's spawns, zone 1: Questie's table keyed by 1 alone reads as a list)
    expect(one("SELECT DISTINCT area_id FROM spawn WHERE kind = 'creature' AND entity_id = 1132 AND source = 'questie'")).toEqual({ area_id: 1 });
    expect(one("SELECT count(*) AS n FROM spawn WHERE area_id = 0")).toEqual({ n: 0 });
    expect(one("SELECT count(*) AS n FROM name WHERE kind = 'creature_subname' AND locale = 'frFR' AND name LIKE '%(%)'")).toEqual({
      n: 0,
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
  test("what Hearthtale's audit reads: trainers, quests' flags and money, items' classes, what a spell teaches", () => {
    // (Llane Beshere, Northshire's warrior trainer)
    expect(one("SELECT trainer_type, trainer_class FROM creature WHERE id = 911")).toEqual({ trainer_type: 0, trainer_class: 1 });
    // (Stonetalon Standstill: done by going there, no objective counts it)
    expect(one("SELECT special_flags & 2 AS event FROM quest WHERE id = 25")).toEqual({ event: 2 });
    expect(one("SELECT count > 0 AS paid FROM quest_reward WHERE quest_id = 7 AND kind = 'money'")).toEqual({ paid: 1 });
    // (Breastplate of Might, a warrior's; plans any class may learn: no limit)
    expect(one("SELECT allowable_class FROM item WHERE id = 16865")).toEqual({ allowable_class: 1 });
    expect(one("SELECT allowable_class FROM item WHERE id = 12720")).toEqual({ allowable_class: null });
    // (The Unsent Letter: the letter it gave you, to deliver, which Questie leaves out)
    expect(one("SELECT target_id, source FROM quest_objective WHERE quest_id = 373 AND kind = 'item'")).toEqual({
      target_id: 2874,
      source: "classicdb",
    });
    // (a warlock's lesson teaching Summon Imp)
    expect(one("SELECT EffectTriggerSpell FROM client_SpellEffect WHERE SpellID = 1366 AND Effect = 36")).toEqual({
      EffectTriggerSpell: 688,
    });
  });
  test("what Yonder reads: who may stand at a spawn, bosses, graveyards, seasons, server flags", () => {
    // (the dump's alternates: guid 804 is one of two creatures)
    expect(all("SELECT entity_id FROM spawn_entry WHERE kind = 'creature' AND spawn_id = 804 ORDER BY entity_id")).toEqual([
      { entity_id: 684 },
      { entity_id: 772 },
    ]);
    expect(one("SELECT credit_type, credit_id FROM encounter WHERE credit_id = 11502")).toEqual({ credit_type: 0, credit_id: 11502 });
    expect(one("SELECT count(*) AS n FROM graveyard")).toEqual({ n: 122 });
    // (Winter Squid bites only in its season)
    expect(one("SELECT n.name FROM loot l JOIN name n ON n.kind = 'game_event' AND n.id = l.event_id WHERE l.item_id = 13755")).toEqual({
      name: "Winter Season Fishing",
    });
    // (the server's own: Katie Hunter sells, Alterac Valley's miners are the Stormpike's)
    expect(one("SELECT faction_id, npc_flags FROM creature WHERE id = 384")).toEqual({ faction_id: 12, npc_flags: 135 });
    expect(one("SELECT faction_id FROM creature WHERE id = 13099")).toEqual({ faction_id: 1214 });
    expect(one("SELECT movement_type, wander_distance FROM spawn WHERE kind = 'creature' AND spawn_id = 1")).toBeTruthy();
  });
  test("every row its source", () => {
    for (const table of ["creature", "spawn", "object", "item", "quest", "loot", "name", "path", "spawn_entry", "encounter", "graveyard", "game_event"]) {
      expect(one(`SELECT count(*) AS n FROM ${table} WHERE source IS NULL OR source = ''`)).toEqual({ n: 0 });
    }
  });
});
