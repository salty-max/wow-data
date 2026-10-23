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

  test("a TBC Anniversary item the TBC packages name: in every language, the TBC client's (source tbc)", () => {
    expect(one("SELECT name, source FROM name WHERE kind = 'item' AND id = 21990 AND locale = 'frFR'")).toEqual({ name: "Bandage en tisse-néant", source: "tbc" });
    expect(one("SELECT count(*) AS n FROM name WHERE kind = 'item' AND id = 21990")).toEqual({ n: 11 });
  });
  test("every spawn's zone the game's: Questie's own ids made AreaTable's (Pusillin in Dire Maul, Anvilrage Overseer in Blackrock Depths)", () => {
    expect(db.query("SELECT count(*) n FROM spawn WHERE area_id IS NOT NULL AND area_id NOT IN (SELECT ID FROM client_AreaTable)").get()).toEqual({ n: 0 });
    expect(db.query("SELECT DISTINCT area_id FROM spawn WHERE source = 'questie' AND kind = 'creature' AND entity_id = 14354").get()).toEqual({ area_id: 2557 });
    expect(db.query("SELECT DISTINCT area_id FROM spawn WHERE source = 'questie' AND kind = 'creature' AND entity_id = 8889").get()).toEqual({ area_id: 1584 });
    // (a spot on a whole continent's map keeps that map: Mistress Natalia Mar'alith's on Kalimdor's)
    expect(db.query("SELECT area_id, ui_map_id FROM spawn WHERE source = 'questie' AND kind = 'creature' AND entity_id = 15215").get()).toEqual({ area_id: null, ui_map_id: 1414 });
  });
  test("a creature's friendly sides, Questie's: Kendor Kabonka the Alliance's, Eunice Burch the Horde's", () => {
    expect(db.query("SELECT friendly FROM creature WHERE id = 340").get()).toEqual({ friendly: "A" });
    expect(db.query("SELECT friendly FROM creature WHERE id = 4552").get()).toEqual({ friendly: "H" });
  });
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
    // (an object's spawn of entity 0: one of its entries, the server's pick)
    expect(all("SELECT entity_id FROM spawn_entry WHERE kind = 'object' AND spawn_id = 11427 ORDER BY entity_id")).toEqual([
      { entity_id: 126049 },
      { entity_id: 128293 },
    ]);
    expect(
      one(`SELECT count(*) AS n FROM spawn s WHERE s.entity_id = 0 AND NOT EXISTS (SELECT 1 FROM spawn_entry e WHERE e.kind = s.kind AND e.spawn_id = s.spawn_id)
           AND NOT EXISTS (SELECT 1 FROM spawn_group_spawn g JOIN spawn_group gr ON gr.id = g.group_id AND gr.kind = s.kind WHERE g.spawn_id = s.spawn_id)`),
    ).toEqual({ n: 0 });
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
  test("an npc's gossip, its window's text: a broadcast text in English and the dump's translations, npc_text's in English alone", () => {
    expect(one("SELECT text, broadcast_id IS NOT NULL AS broadcast FROM gossip WHERE npc_id = 6740 AND locale = 'enUS'")).toEqual({
      text: "Welcome to my Inn, weary traveler. What can I do for you?",
      broadcast: 1,
    });
    expect(name("creature", 6740, "frFR")).toBe("Aubergiste Allison");
    expect(one("SELECT text FROM gossip WHERE npc_id = 6740 AND locale = 'frFR'")).toEqual({
      text: "Bienvenue dans mon auberge, $gvoyageur épuisé:voyageuse épuisée;. Que puis-je faire pour vous\u00a0?",
    });
    expect(all("SELECT locale FROM gossip WHERE npc_id = 240 ORDER BY locale")).toEqual([{ locale: "enUS" }]);
    expect(one("SELECT text FROM gossip WHERE npc_id = 240")).toEqual({
      text: "Ach, it's hard enough keeping order around here without all these new troubles popping up!  I hope you have good news, $n...",
    });
    // (every creature with a menu has its text)
    expect(one("SELECT count(DISTINCT npc_id) AS n FROM gossip WHERE locale = 'enUS'")).toEqual({ n: 1845 });
  });
  test("a tale over several windows: each choice and the page it opens, in every language the dump has", () => {
    // Zamael Lunthistle (8436), caged in the Searing Gorge: his first menu, "I wish to hear your tale.", two pages
    const menu = one("SELECT DISTINCT menu_id FROM gossip WHERE npc_id = 8436").menu_id as number;
    const choice = one("SELECT text, next_menu_id FROM gossip_option WHERE menu_id = ? AND locale = 'enUS' AND next_menu_id IS NOT NULL", menu) as { text: string; next_menu_id: number };
    expect(choice.text).toBe("I wish to hear your tale.");
    expect(one("SELECT text FROM gossip_page WHERE menu_id = ? AND locale = 'enUS'", choice.next_menu_id).text as string).toStartWith("As a young night elf in Darkshore");
    expect(all("SELECT DISTINCT locale FROM gossip_page WHERE menu_id = ? ORDER BY locale", choice.next_menu_id).map((r) => r.locale)).toContain("frFR");
    // (a first menu's text is the same in gossip and gossip_page; a vendor's choice opens no page)
    expect(one("SELECT text FROM gossip_page WHERE menu_id = ? AND locale = 'enUS'", menu).text).toBe(one("SELECT text FROM gossip WHERE npc_id = 8436 AND locale = 'enUS'").text);
    expect(one("SELECT count(*) AS n FROM gossip_option WHERE next_menu_id IS NULL")).not.toEqual({ n: 0 });
  });
  test("every row its source", () => {
    for (const table of ["creature", "spawn", "object", "item", "quest", "loot", "name", "path", "spawn_entry", "encounter", "graveyard", "game_event", "gossip", "gossip_option", "gossip_page"]) {
      expect(one(`SELECT count(*) AS n FROM ${table} WHERE source IS NULL OR source = ''`)).toEqual({ n: 0 });
    }
  });
  test("Finds gathering requirements use this client and keep Forever additions out", () => {
    expect(one("SELECT skill_line_id,min_skill,source FROM gathering_node WHERE object_id=1731")).toEqual({ skill_line_id: 186, min_skill: 0, source: "client" });
    expect(one("SELECT count(*) AS n FROM gathering_node WHERE object_id IN (562111,566779,656332,656333)")).toEqual({ n: 0 });
    expect(one("SELECT SpellID FROM client_SpellReagents WHERE SpellID=2657 AND Reagent_0=2770")).toEqual({ SpellID: 2657 });
  });

  // ── the trades' recipes (the cookbook's ground) ──
  test("a recipe item teaches its recipe by the client's learn effect: Recipe: Mithril Head Trout, Mithril Headed Trout, at Cooking 175", () => {
    // (the names differ: only the effect can tell)
    expect(all("SELECT spell_id, skill_line_id, kind, skill_value FROM recipe_source WHERE ref_id = 17062")).toEqual([
      { spell_id: 20916, skill_line_id: 185, kind: "item", skill_value: 175 },
    ]);
  });
  test("a trainer's lesson teaches the cook's own: Cook Ghilm's Spiced Wolf Meat (2559 to 2539) at 10, its yellow 50 and grey 90", () => {
    expect(one("SELECT taught_spell_id, source FROM teaching WHERE spell_id = 2559")).toEqual({ taught_spell_id: 2539, source: "client" });
    expect(one("SELECT kind, skill_value FROM recipe_source WHERE spell_id = 2539 AND ref_id = 1355")).toEqual({ kind: "trainer", skill_value: 10 });
    expect(one("SELECT TrivialSkillLineRankLow AS yellow, TrivialSkillLineRankHigh AS grey FROM client_SkillLineAbility WHERE Spell = 2539")).toEqual({ yellow: 50, grey: 90 });
  });
  test("learned with the skill: Charred Wolf Meat, Roasted Boar Meat, Herb Baked Egg", () => {
    const skill = all("SELECT spell_id FROM recipe_source WHERE kind = 'skill' AND skill_line_id = 185").map((r) => r.spell_id);
    for (const spell of [2538, 2540, 8604]) expect(skill).toContain(spell);
  });
  test("a quest's: Sharing the Knowledge teaches Smoked Desert Dumplings", () => {
    expect(all("SELECT kind, ref_id FROM recipe_source WHERE spell_id = 24801")).toEqual([{ kind: "quest", ref_id: 8313 }]);
  });
  test("a limited stock: Jabbey holds one Recipe: Undermine Clam Chowder, one more every three hours", () => {
    expect(one("SELECT max_count, restock_s FROM vendor WHERE npc_id = 8139 AND item_id = 16767")).toEqual({ max_count: 1, restock_s: 10800 });
  });
  test("no recipe item teaches two recipes, and no class spell is a recipe", () => {
    expect(one("SELECT count(*) AS n FROM (SELECT ref_id FROM recipe_source WHERE kind = 'item' GROUP BY ref_id HAVING count(DISTINCT spell_id) > 1)").n).toBe(0);
    // (Fireball, a mage's, taught by trainers: no trade's)
    expect(one("SELECT count(*) AS n FROM recipe_source WHERE spell_id = 133").n).toBe(0);
  });

  // ── reputation (the reputation road) ───────────────────────────────────────
  test("a quest's standing before it's offered: The Root of All Evil at Exalted, Avast Ye Scallywag at Friendly with the Bloodsail and Hated with Booty Bay", () => {
    expect(one("SELECT min_value, max_value FROM quest_standing WHERE quest_id = 8481 AND faction_id = 576")).toEqual({ min_value: 42000, max_value: null });
    expect(all("SELECT faction_id, min_value, max_value FROM quest_standing WHERE quest_id = 1036 ORDER BY faction_id")).toEqual([
      { faction_id: 21, min_value: null, max_value: -6000 },
      { faction_id: 87, min_value: 3000, max_value: null },
    ]);
    // (the Naxxramas attunement's cheaper copy: from Neutral, no longer at Revered)
    expect(one("SELECT min_value, max_value FROM quest_standing WHERE quest_id = 9121 AND faction_id = 529")).toEqual({ min_value: 0, max_value: 21000 });
  });
  test("the reputation a kill gives: a Deadwood Warrior the Timbermaw's until Honored, High Chief Winterfall until Exalted", () => {
    expect(one("SELECT value, max_standing FROM kill_reputation WHERE creature_id = 7153 AND faction_id = 576")).toEqual({ value: 5, max_standing: 5 });
    expect(one("SELECT value, max_standing FROM kill_reputation WHERE creature_id = 10738 AND faction_id = 576")).toEqual({ value: 25, max_standing: 7 });
  });
  test("kill reputation by hand (data/kill-reputation.json): the Syndicate raise Ravenholdt to Friendly, the Bloodsail stop at Friendly", () => {
    expect(one("SELECT value, max_standing, source FROM kill_reputation WHERE creature_id = 2246 AND faction_id = 349")).toEqual({ value: 5, max_standing: 3, source: "guides" });
    expect(one("SELECT count(*) AS n FROM kill_reputation WHERE faction_id = 349 AND value > 0").n).toBe(21);
    expect(one("SELECT count(*) AS n FROM kill_reputation WHERE faction_id = 87 AND value > 0 AND max_standing <> 3").n).toBe(0);
  });
  test("an item's standing: the client's first, the Classic database's where Era's client has none (Lokhtos's plans)", () => {
    expect(one("SELECT count(*) AS n FROM item_reputation WHERE source = 'client'").n).toBeGreaterThan(300);
    expect(one("SELECT faction_id, standing, source FROM item_reputation WHERE item_id = 17018")).toEqual({ faction_id: 59, standing: 4, source: "classicdb" });
  });
  test("the repeatable turn-ins: Beads for Salfa takes five Winterfall Spirit Beads, Additional Runecloth twenty", () => {
    expect(one("SELECT faction_id, value, item_id, item_count FROM reputation_turnin WHERE quest_id = 8469")).toEqual({ faction_id: 576, value: 50, item_id: 21383, item_count: 5 });
    expect(one("SELECT item_id, item_count FROM reputation_turnin WHERE quest_id = 7796")).toEqual({ item_id: 14047, item_count: 20 });
    // (a one-time donation is no turn-in)
    expect(one("SELECT count(*) AS n FROM reputation_turnin WHERE quest_id = 7795").n).toBe(0);
  });
});
