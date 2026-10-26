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
  test("every spawn's zone the game's: Questie's own ids made AreaTable's (Pusillin in Dire Maul, Anvilrage Overseer in Blackrock Depths)", () => {
    expect(db.query("SELECT count(*) n FROM spawn WHERE area_id IS NOT NULL AND area_id NOT IN (SELECT ID FROM client_AreaTable)").get()).toEqual({ n: 0 });
    expect(db.query("SELECT DISTINCT area_id FROM spawn WHERE source = 'questie' AND kind = 'creature' AND entity_id = 14354").get()).toEqual({ area_id: 2557 });
    expect(db.query("SELECT DISTINCT area_id FROM spawn WHERE source = 'questie' AND kind = 'creature' AND entity_id = 8889").get()).toEqual({ area_id: 1584 });
    // (a spot on a whole continent's map keeps that map: Mistress Natalia Mar'alith's on Kalimdor's)
    expect(db.query("SELECT area_id, ui_map_id FROM spawn WHERE source = 'questie' AND kind = 'creature' AND entity_id = 15215").get()).toEqual({ area_id: null, ui_map_id: 1414 });
  });
  test("a creature's friendly sides, Questie's: Forever's new vendors with no faction template (Aza'bek, Horde; Kalsey Sanden, Alliance)", () => {
    expect(one("SELECT faction_id, friendly FROM creature WHERE id = 248198")).toEqual({ faction_id: null, friendly: "H" });
    expect(one("SELECT faction_id, friendly FROM creature WHERE id = 256731")).toEqual({ faction_id: null, friendly: "A" });
  });
  test("Classic's world kept: Hogger, The Troll Cave", () => {
    expect(name("creature", 448)).toBe("Hogger");
    expect(name("quest", 182)).toBe("The Troll Cave");
  });
  test("Finds gaps: Forever requirements, explicit skinning and source-only mining yields", () => {
    expect(one("SELECT min_skill,source FROM gathering_node WHERE object_id=1731 AND skill_line_id=186")).toEqual({ min_skill: 1, source: "client" });
    expect(one("SELECT min_skill,source,introduced_build FROM gathering_node WHERE object_id=562111")).toEqual({ min_skill: 1, source: "wowhead", introduced_build: "1.60.1.69893" });
    expect(all("SELECT item_id,chance FROM loot WHERE kind='object' AND source_id=562111 AND source='wowhead' ORDER BY item_id")).toEqual([{ item_id: 2770, chance: null }, { item_id: 2835, chance: null }]);
    expect(all("SELECT source_id FROM loot WHERE kind='skinning' AND item_id=249427 AND source='wowhead' ORDER BY source_id")).toEqual([{ source_id: 3474 }, { source_id: 5832 }, { source_id: 270693 }]);
    expect(one("SELECT source_id FROM loot WHERE kind='skinning' AND item_id=249428 AND source='wowhead'")).toEqual({ source_id: 271334 });
    expect(one("SELECT min_skill FROM gathering_node WHERE object_id=566779")).toEqual({ min_skill: 300 });
    expect(one("SELECT count(*) AS n FROM loot WHERE kind='object' AND source_id=566779 AND source='wowhead'")).toEqual({ n: 0 });
    expect(one("SELECT source FROM loot WHERE kind='object' AND source_id=1733 AND item_id=249391")).toEqual({ source: "questie" });
    expect(one("SELECT source FROM loot WHERE kind='object' AND source_id=1610 AND item_id=249391")).toEqual({ source: "wowhead" });
    expect(one("SELECT source FROM loot WHERE kind='object' AND source_id=2040 AND item_id=249425")).toEqual({ source: "wowhead" });
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
    // (english: the English a client shows where its language has no name)
    // (esES: esMX's name where it has none, esES's)
    // (guides: data/kill-reputation.json, the kills by hand)
    // (players: present once a database has imported archived observations)
    expect(sources.filter((source) => source !== "players")).toEqual(["allthethings", "classicdb", "client", "client-map", "english", "esES", "guides", "owner-report", "questie", "wowhead"]);
    for (const table of ["creature", "creature_sighting", "landmark", "quest", "quest_objective", "quest_relation", "quest_reward", "quest_prereq", "spawn", "loot", "name", "kill_reputation"]) {
      const used = all(`SELECT DISTINCT source FROM ${table}`).map((r) => r.source as string);
      for (const s of used) expect(sources).toContain(s);
    }
    expect(all("SELECT entity_id FROM spawn WHERE source IN ('players', 'owner-report', 'client-map')")).toEqual([]);
  });
  test("every language names what its client shows: Forever's own creatures translated, else the English", () => {
    const named = (locale: string) => one("SELECT name FROM name WHERE kind = 'creature' AND id = 269075 AND locale = ?", locale)?.name;
    expect(named("esES")).toBe("Leopardo de la nieve merodeador");
    expect(named("frFR")).toBe(one("SELECT name FROM name WHERE kind = 'creature' AND id = 269075 AND locale = 'frFR'")?.name);
    expect(named("itIT")).toBe("Snow Leopard Prowler");
    expect(one("SELECT source FROM name WHERE kind = 'creature' AND id = 269075 AND locale = 'itIT'")?.source).toBe("english");
  });
  test("esMX takes esES's name where it has none, marked esES; a real esMX name stays", () => {
    // (the High Order's magister: the esMX client names neither him nor Ayessa)
    expect(one("SELECT name, source FROM name WHERE kind = 'creature' AND id = 252475 AND locale = 'esMX'")).toEqual({ name: "Elaadrin Vendaval del Atardecer", source: "esES" });
    expect(one("SELECT name, source FROM name WHERE kind = 'creature' AND id = 251968 AND locale = 'esMX'")).toEqual({ name: "Ayessa Cantoalba", source: "esES" });
    // (Questie's own esMX stays: Hemet's)
    expect(one("SELECT name, source FROM name WHERE kind = 'creature' AND id = 715 AND locale = 'esMX'")).toEqual({ name: "Hemet Nesingwary", source: "questie" });
    // (a placeholder is no name to lend: Sulhasa's esES is "[UNUSED] Sulhasa")
    expect(one("SELECT count(*) AS n FROM name WHERE locale = 'esMX' AND source = 'esES' AND (name LIKE '[%' OR name LIKE '%UNUSED%' OR name LIKE '%<PH>%')")).toEqual({ n: 0 });
    // (no esMX name the English, where esES has a real one)
    expect(one("SELECT count(*) AS n FROM name m JOIN name e ON e.kind = m.kind AND e.id = m.id AND e.locale = 'esES' AND e.source <> 'english' AND e.name NOT LIKE '[%' AND e.name NOT LIKE '%UNUSED%' AND e.name NOT LIKE '%<PH>%' WHERE m.locale = 'esMX' AND m.source = 'english'")).toEqual({ n: 0 });
  });
  test("no name is Wowhead's English in brackets (the client shows the English)", () => {
    expect(one("SELECT count(*) AS n FROM name WHERE source = 'wowhead' AND name LIKE '[%]'")).toEqual({ n: 0 });
    // (a quest's text untranslated on Wowhead: none in its language's)
    expect(one("SELECT count(*) AS n FROM quest_text WHERE source = 'wowhead' AND locale <> 'enUS' AND text LIKE '[%]'")).toEqual({ n: 0 });
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
    expect(all("SELECT kind, text, source FROM npc_line WHERE npc_id = 205153 AND locale = 'enUS'")).toContainEqual({ kind: "say", text: "Please, listen to me. I have an offer to make.", source: "wowhead" });
    // (Blizzard's placeholders Wowhead lists, <UNUSED>, left out)
    expect(one("SELECT count(*) AS n FROM quest WHERE id IN (807, 820, 856, 8458) AND source = 'wowhead'").n).toBe(0);
  });

  // ── the trades' recipes (the cookbook's ground) ──
  test("Forever's recipe items name their recipe (its learn effect, trigger 6): Recipe: Westfall Stew at Cooking 75, and nothing else", () => {
    expect(all("SELECT spell_id, kind, skill_value FROM recipe_source WHERE ref_id = 728")).toEqual([{ spell_id: 2543, kind: "item", skill_value: 75 }]);
    // (every recipe's shared "Learning" spell once taught them all an elixir)
    expect(one("SELECT count(*) AS n FROM (SELECT ref_id FROM recipe_source WHERE kind = 'item' GROUP BY ref_id HAVING count(DISTINCT spell_id) > 1)").n).toBe(0);
  });
  test("its trainers' lessons, the Classic database's, through the Classic client: Cook Ghilm's Spiced Wolf Meat", () => {
    expect(one("SELECT taught_spell_id, source FROM teaching WHERE spell_id = 2559")).toEqual({ taught_spell_id: 2539, source: "classic" });
    expect(one("SELECT kind, skill_value FROM recipe_source WHERE spell_id = 2539 AND ref_id = 1355")).toEqual({ kind: "trainer", skill_value: 10 });
  });
  test("a recipe of Forever's own: Recipe: Peace Tea at Cooking 25, its yellow 30 and grey 45", () => {
    expect(all("SELECT kind, ref_id, skill_value FROM recipe_source WHERE spell_id = 1249957")).toEqual([{ kind: "item", ref_id: 249879, skill_value: 25 }]);
    expect(one("SELECT TrivialSkillLineRankLow AS yellow, TrivialSkillLineRankHigh AS grey FROM client_SkillLineAbility WHERE Spell = 1249957")).toEqual({ yellow: 30, grey: 45 });
  });
  test("Wowhead's sources for what no database sells or drops: Cookie drops the Blueprint: Cookie's Feast, a test realm's vendor left out", () => {
    expect(all("SELECT kind, source_id, chance, source FROM loot WHERE item_id = 273102")).toEqual([{ kind: "creature", source_id: 645, chance: null, source: "wowhead" }]);
    expect(one("SELECT count(*) AS n FROM vendor WHERE item_id = 273102").n).toBe(0);
    expect(all("SELECT npc_id FROM vendor WHERE item_id = 274415 AND source = 'wowhead'")).toEqual([{ npc_id: 256629 }]);
  });
  test("every loot row leads to its creature or object: none of Season of Discovery's that no source has (Waylaid Supplies' Artifact Storage), Forever's own kept (the Dalaran Tome, Balnazzar)", () => {
    for (const kind of ["creature", "object"]) {
      // (Questie's and Wowhead's by its id, the Classic database's and the players' by its template)
      expect(one(`SELECT count(*) AS n FROM loot WHERE kind = ? AND source IN ('questie', 'wowhead') AND source_id NOT IN (SELECT id FROM ${kind})`, kind)).toEqual({ n: 0 });
      expect(one(`SELECT count(*) AS n FROM loot WHERE kind = ? AND source IN ('classicdb', 'players') AND source_id NOT IN (SELECT loot_id FROM ${kind} WHERE loot_id IS NOT NULL)`, kind)).toEqual({ n: 0 });
    }
    expect(one("SELECT count(*) AS n FROM loot WHERE kind = 'object' AND source_id = 404352")).toEqual({ n: 0 });
    expect(all("SELECT kind, source_id, source FROM loot WHERE item_id = 275996")).toEqual([{ kind: "object", source_id: 656681, source: "questie" }]);
    expect(one("SELECT type, source FROM object WHERE id = 656681")).toEqual({ type: 3, source: "wowhead" });
    expect(name("object", 656681)).toBe("Dalaran Tome");
    expect(one("SELECT rank, source FROM creature WHERE id = 244766")).toEqual({ rank: 1, source: "wowhead" });
    expect(name("creature", 244766)).toBe("Balnazzar");
  });
  test("Season of Discovery's where Forever shows it (its players met it, it holds Forever's own, Wowhead saw Forever change it), none of the rest", () => {
    // (Questie's traces: SoD's librarian, his books turned in, a world book)
    expect(one("SELECT source FROM creature WHERE id = 211022")).toEqual({ source: "questie" });
    expect(one("SELECT count(*) AS n FROM spawn WHERE kind = 'creature' AND entity_id = 211022").n).toBeGreaterThan(0);
    expect(name("quest", 78124)).toBe("Nar'thalas Almanac");
    expect(name("object", 386691)).toBe("Library Book");
    // (Wowhead's Forever change alone: Spike Lakeman become Sam Otridge; A Strange
    // Artifact at level 30, started at its Strange Orb; Dragonslayer's Helm, and Alonso who gives it)
    expect(name("creature", 228173)).toBe("Sam Otridge");
    expect(one("SELECT level FROM quest WHERE id = 78088")).toEqual({ level: 30 });
    expect(all("SELECT kind, entity_id FROM quest_relation WHERE quest_id = 78088 AND role = 'start'")).toEqual([{ kind: "object", entity_id: 409289 }]);
    expect(name("object", 409289)).toBe("Strange Orb");
    expect(all("SELECT role FROM quest_relation WHERE quest_id = 78132 AND kind = 'creature' AND entity_id = 210995 ORDER BY role")).toEqual([{ role: "end" }, { role: "start" }]);
    // (it gives a quest only Forever has: Wendel Mathers, The Cook in the Cage;
    // what such a quest asks for still drops: its cage key from Colonel Kurzen;
    // a kept quest's objective, Stalk With The Earthmother's Blasting Supplies)
    expect(all("SELECT kind, entity_id FROM quest_relation WHERE quest_id = 97047 AND role = 'start'")).toEqual([{ kind: "creature", entity_id: 218230 }]);
    expect(name("creature", 218230)).toBe("Wendel Mathers");
    expect(all("SELECT source_id FROM loot WHERE kind = 'creature' AND item_id = 216616 ORDER BY source_id")).toContainEqual({ source_id: 813 });
    expect(name("object", 403041)).toBe("Blasting Supplies");
    // (none of the rest, nor what named it: Polymorphed Apprentice, a Vengeful
    // Ancient of the Nightmare, Star Lotus, Starsilver Vein, a Duskwood Mission,
    // Metzen's (only its reward renamed DEPRECATED), Ataeric's (Wowhead unconfirmed);
    // but their names, every language's, left_out: a journal may hold their ids)
    for (const [kind, ids] of [["creature", "202093, 221263"], ["object", "439762, 439778"], ["quest", "81730, 79492, 79096"]]) {
      const n = ids.split(",").length;
      expect(one(`SELECT count(*) AS n FROM ${kind} WHERE id IN (${ids})`)).toEqual({ n: 0 });
      expect(one(`SELECT count(*) AS n FROM left_out WHERE kind = '${kind}' AND reason = 'season_of_discovery' AND id IN (${ids})`)).toEqual({ n });
      expect(one(`SELECT count(*) AS n FROM name WHERE kind = '${kind}' AND locale = 'enUS' AND id IN (${ids})`)).toEqual({ n });
    }
    expect(name("creature", 202093)).toBe("Polymorphed Apprentice");
    expect(one("SELECT count(DISTINCT locale) AS n FROM name WHERE kind = 'creature' AND id = 202093").n).toBeGreaterThan(1);
    // (what is left out is in no table of the game's, and has its English name)
    for (const kind of ["creature", "object", "quest"])
      expect(one(`SELECT count(*) AS n FROM left_out l WHERE l.kind = '${kind}' AND (l.id IN (SELECT id FROM ${kind}) OR NOT EXISTS (SELECT 1 FROM name WHERE kind = l.kind AND id = l.id AND locale = 'enUS'))`)).toEqual({ n: 0 });
    expect(one("SELECT count(*) AS n FROM spawn WHERE (kind = 'creature' AND entity_id IN (202093, 221263)) OR (kind = 'object' AND entity_id IN (439762, 439778))")).toEqual({ n: 0 });
    expect(one("SELECT count(*) AS n FROM gathering_node WHERE object_id IN (439762, 439778)")).toEqual({ n: 0 });
    expect(one("SELECT count(*) AS n FROM quest_text WHERE quest_id = 81730")).toEqual({ n: 0 });
    expect(one("SELECT start_quest_id FROM item WHERE id = 219962")).toEqual({ start_quest_id: null });
    // (a SoD item stays, its drops, vendors and recipe only where Forever's players
    // looted it: Waylaid Supplies dropped nowhere, a Comprehension Charm sold
    // nowhere, Darkclaw Bisque and Smoked Redgill learned nowhere; the Harvest
    // Golem's Scroll: KWYJIBO kept)
    expect(one("SELECT source FROM item WHERE id = 210771")).toEqual({ source: "client" });
    expect(one("SELECT count(*) AS n FROM loot WHERE item_id = 210771")).toEqual({ n: 0 });
    expect(one("SELECT count(*) AS n FROM vendor WHERE item_id = 211779")).toEqual({ n: 0 });
    expect(one("SELECT count(*) AS n FROM recipe_source WHERE spell_id IN (470359, 470370)")).toEqual({ n: 0 });
    expect(all("SELECT source FROM loot WHERE kind = 'creature' AND source_id = 36 AND item_id = 211780")).toEqual([{ source: "questie" }]);
    // (nor what an unseen SoD item holds: the Otherworldly Treasure's scrolls)
    expect(one("SELECT count(*) AS n FROM loot WHERE kind = 'item' AND source_id = 220446")).toEqual({ n: 0 });
    // (every item a quest asks for still somewhere, where it was before)
    expect(one("SELECT count(*) AS n FROM quest_objective o WHERE o.kind = 'item' AND o.quest_id IN (97047, 95384, 78091, 78092, 76156) AND NOT EXISTS (SELECT 1 FROM loot WHERE item_id = o.target_id) AND NOT EXISTS (SELECT 1 FROM vendor WHERE item_id = o.target_id) AND o.target_id <> 216617")).toEqual({ n: 0 });
    // (every quest's giver, ender and target a creature or an object the tables have)
    expect(one("SELECT count(*) AS n FROM quest_relation WHERE (kind = 'creature' AND entity_id NOT IN (SELECT id FROM creature)) OR (kind = 'object' AND entity_id NOT IN (SELECT id FROM object))")).toEqual({ n: 0 });
    expect(one("SELECT count(*) AS n FROM quest_objective WHERE (kind = 'creature' AND target_id NOT IN (SELECT id FROM creature)) OR (kind = 'object' AND target_id NOT IN (SELECT id FROM object))")).toEqual({ n: 0 });
  });
  test("what only Wowhead's pages name in English, every language names as its client shows: Harrigen <The Undermarket>, the Dalaran Tome", () => {
    expect(name("creature_subname", 228230)).toBe("The Undermarket");
    expect(one("SELECT name, source FROM name WHERE kind = 'creature' AND id = 228230 AND locale = 'deDE'")).toEqual({ name: "Harrigen", source: "english" });
    expect(one("SELECT name, source FROM name WHERE kind = 'creature_subname' AND id = 228230 AND locale = 'frFR'")).toEqual({ name: "The Undermarket", source: "english" });
    expect(one("SELECT name, source FROM name WHERE kind = 'object' AND id = 656681 AND locale = 'koKR'")).toEqual({ name: "Dalaran Tome", source: "english" });
    // (a title Wowhead's pages give one of Questie's creatures, which Questie lacks: Rix Xizzix <Lost and Found>)
    expect(name("creature_subname", 214954)).toBe("Lost and Found");
  });
});
