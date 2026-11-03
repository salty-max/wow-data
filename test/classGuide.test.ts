// The class guide's tables (src/classGuide.ts, docs/class-guide.md) against
// facts from the game, in each database that is built (bun bin/build.ts
// first; skipped where it isn't): the levels spells are learned at, the
// talent trees as the window shows them, what a class learns and from whom.
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { card } from "../src/card";
import { classOfMask } from "../src/classGuide";
import { dbPath, openDb } from "../src/db";

test("a single-class mask is the class's id (Warrior 1, Hunter 4, Druid 1024 -> 11), a shared one none", () => {
  expect([1, 2, 4, 8, 16, 64, 128, 256, 1024].map(classOfMask)).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 11]);
  expect([0, 3, 1025].map(classOfMask)).toEqual([null, null, null]);
});

for (const game of ["classic", "forever"] as const) {
  const built = existsSync(dbPath(game));
  describe.skipIf(!built)(`class guide (${game}.db)`, () => {
    const db = built ? openDb(game) : null!;
    const one = (sql: string, ...args: (string | number)[]) => db.query(sql).get(...args) as Record<string, unknown>;
    const all = (sql: string, ...args: (string | number)[]) => db.query(sql).all(...args) as Record<string, unknown>[];
    const forever = game === "forever";

    test("a spell level is a level: none at 0", () => {
      expect(one("SELECT count(*) n FROM spell_level WHERE level <= 0")).toEqual({ n: 0 });
    });
    test("a spell's level is SpellLevel: Heroic Strike's second rank at 8, Rend's first at 4", () => {
      expect(one("SELECT level, base_level FROM spell_level WHERE spell_id = 284")).toEqual({ level: 8, base_level: 8 });
      expect(one("SELECT level FROM spell_level WHERE spell_id = 772")).toEqual({ level: 4 });
    });
    test("nine classes, three trees each (Druid's Feral Combat, Restoration, Balance), talents in unique cells", () => {
      expect(all("SELECT class_id, count(DISTINCT tab_id) n FROM talent GROUP BY class_id").map((r) => r.n)).toEqual(Array(9).fill(3));
      expect(all("SELECT DISTINCT class_id FROM talent ORDER BY class_id").map((r) => r.class_id)).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 11]);
      expect(all("SELECT DISTINCT tab_id FROM talent WHERE class_id = 11 ORDER BY tab_id").map((r) => r.tab_id)).toEqual([281, 282, 283]);
      expect(one("SELECT count(*) n FROM (SELECT tab_id, row, col FROM talent GROUP BY 1, 2, 3 HAVING count(*) > 1)")).toEqual({ n: 0 });
    });
    test("a talent is taken at 10 plus five a row: its level and the points the tree asks", () => {
      expect(one("SELECT count(*) n FROM talent WHERE req_points <> 5 * row OR min_level <> 10 + req_points")).toEqual({ n: 0 });
      // (the capstones of the Warrior's trees, row 6: 31 points in the tree, level 40)
      expect(all("SELECT id, tab_id, col, max_rank, spell_id, min_level FROM talent WHERE class_id = 1 AND row = 6 ORDER BY tab_id")).toEqual([
        { id: 135, tab_id: 161, col: 1, max_rank: 1, spell_id: 12294, min_level: 40 }, // Mortal Strike
        { id: 148, tab_id: 163, col: 1, max_rank: 1, spell_id: 23922, min_level: 40 }, // Shield Slam
        { id: 167, tab_id: 164, col: 1, max_rank: 1, spell_id: 23881, min_level: 40 }, // Bloodthirst
      ]);
    });
    test("Feral Combat: Leader of the Pack (17007) at row 6, level 40 on Era, moved up to row 4, level 30 in Forever; Feral Charge on row 2", () => {
      expect(one("SELECT tab_id, row, col, max_rank, min_level FROM talent WHERE spell_id = 17007")).toEqual(
        forever ? { tab_id: 281, row: 4, col: 1, max_rank: 1, min_level: 30 } : { tab_id: 281, row: 6, col: 1, max_rank: 1, min_level: 40 },
      );
      expect(one("SELECT tab_id, row, col FROM talent WHERE spell_id = ?", forever ? 1238122 : 16979)).toEqual({ tab_id: 281, row: 2, col: forever ? 2 : 1 });
    });
    test("what a class learns: Warrior's Battle Shout at 1, Rend 4, Bloodrage 10, taught by trainers; the stances by quest", () => {
      expect(one("SELECT level, kind FROM class_spell WHERE class_id = 1 AND spell_id = 6673")).toEqual({ level: 1, kind: "trainer" });
      expect(one("SELECT level, kind FROM class_spell WHERE class_id = 1 AND spell_id = 772")).toEqual({ level: 4, kind: "trainer" });
      expect(one("SELECT level, kind FROM class_spell WHERE class_id = 1 AND spell_id = 2687")).toEqual({ level: 10, kind: "trainer" });
      expect(one("SELECT level, kind FROM class_spell WHERE class_id = 1 AND spell_id = 71")).toEqual({ level: 10, kind: "quest" });
      expect(one("SELECT level, kind FROM class_spell WHERE class_id = 1 AND spell_id = 2458")).toEqual({ level: 30, kind: "quest" });
      // (a trainer teaches the lesson, never the spell: Heroic Strike's second rank is taught by 1606)
      expect(one("SELECT lesson_spell_id l FROM class_spell WHERE class_id = 1 AND spell_id = 284")).toEqual({ l: 1606 });
      expect(one("SELECT count(DISTINCT npc_id) > 20 AS many FROM trainer_spell WHERE spell_id = 1606")).toEqual({ many: 1 });
    });
    test("Season of Discovery's engravings are runes, not what a class learns", () => {
      expect(one("SELECT kind FROM class_spell WHERE class_id = 1 AND spell_id = 403470")).toEqual({ kind: "rune" });
    });
    test("every class has trainers' lessons for most of what it learns by level", () => {
      for (const c of [1, 2, 3, 4, 5, 7, 8, 9, 11]) expect((one("SELECT count(*) n FROM class_spell WHERE class_id = ? AND kind = 'trainer'", c).n as number) > 60).toBe(true);
    });
    test("the cards: Warrior's talents and what the class learns", () => {
      const talents = card(db, "talents", "Warrior", { full: true }).join("\n");
      expect(talents).toContain("Arms (161)");
      expect(talents).toContain("L40+ c1 Mortal Strike 1 (12294)");
      expect(card(db, "talents", "Feral Combat", { full: true }).join("\n")).toContain(forever ? "L30+ c1 Leader of the Pack 1 (17007)" : "L40+ c1 Leader of the Pack 1 (17007)");
      const learned = card(db, "class", "Warrior", { full: true }).join("\n");
      expect(learned).toContain("L10 ");
      expect(learned).toContain("Defensive Stance (71; quest ");
      expect(learned).toContain("taught by ");
    });

    if (forever) {
      test("Forever's trait trees: one live tree for each of nine classes, 125 talents new to it, the old ones off the window left out", () => {
        expect(one("SELECT count(DISTINCT node_id) n FROM talent")).toEqual({ n: 465 });
        expect(one("SELECT count(*) n FROM talent WHERE era_talent_id IS NULL")).toEqual({ n: 125 });
        // (Lightning Reflexes' old node stood at x 102800: one remains, and Improved Serpent Sting, at y 39300, none)
        expect(one("SELECT count(*) n FROM talent WHERE spell_id = 19168")).toEqual({ n: 1 });
        expect(one("SELECT count(*) n FROM talent WHERE spell_id = 19464")).toEqual({ n: 0 });
        expect(one("SELECT count(*) n FROM talent WHERE spell_id = 14889")).toEqual({ n: 1 });
      });
      test("a talent Classic had keeps its id; a new one takes its node's: Spearing Strike at row 3, column 0 of Arms; Improved Slam moved from Fury to Arms", () => {
        expect(one("SELECT id, tab_id, row, col, min_level, era_talent_id, node_id FROM talent WHERE spell_id = 1310222")).toEqual({ id: 105949, tab_id: 161, row: 3, col: 0, min_level: 25, era_talent_id: null, node_id: 105949 });
        expect(one("SELECT id, tab_id, era_tab_id, row, col FROM talent WHERE spell_id = 12862")).toEqual({ id: 168, tab_id: 161, era_tab_id: 164, row: 5, col: 0 });
        expect(one("SELECT count(*) n FROM talent WHERE tab_id <> era_tab_id")).toEqual({ n: 11 });
      });
      test("a trait talent has its rank on the node: no rank spells, prerequisites from the edges (Mortal Strike needs Sweeping Strikes)", () => {
        expect(one("SELECT count(*) n FROM talent_rank")).toEqual({ n: 0 });
        expect(one("SELECT count(*) n FROM talent_prereq WHERE talent_id = 135 AND requires_id = 133")).toEqual({ n: 1 });
        // (a line drawn both ways, type 0, is no requirement: Nature's Splendor and Nature's Majesty; the one pair left runs both ways in the client's type 2)
        expect(one("SELECT count(*) n FROM talent_prereq WHERE edge_type NOT IN (2, 3)")).toEqual({ n: 0 });
        expect(one("SELECT count(*) n FROM talent_prereq a JOIN talent_prereq b ON a.talent_id = b.requires_id AND a.requires_id = b.talent_id")).toEqual({ n: 2 });
        expect(one("SELECT count(*) n FROM talent_prereq")).toEqual({ n: 73 });
      });
      test("levels differ from Classic's: Berserker Rage at 30 here (32 in the trainers' rows), and a base level of 0 beside a spell level", () => {
        expect(one("SELECT level, trainer_level, lesson_source FROM class_spell WHERE class_id = 1 AND spell_id = 18499")).toEqual({ level: 30, trainer_level: 32, lesson_source: "classic" });
        expect(one("SELECT level, base_level FROM spell_level WHERE spell_id = 429765")).toEqual({ level: 1, base_level: 0 });
      });
    } else {
      test("Classic Era's Talent table whole: 432 talents, 1357 rank spells, ranks counted by their spells", () => {
        expect(one("SELECT count(*) n FROM talent")).toEqual({ n: 432 });
        expect(one("SELECT count(*) n FROM talent_rank")).toEqual({ n: 1357 });
        expect(one("SELECT count(*) n FROM talent t WHERE max_rank <> (SELECT count(*) FROM talent_rank r WHERE r.talent_id = t.id)")).toEqual({ n: 0 });
        expect(all("SELECT rank, spell_id FROM talent_rank WHERE talent_id = 135")).toEqual([{ rank: 1, spell_id: 12294 }]);
        // (Mortal Strike needs Sweeping Strikes, 133)
        expect(one("SELECT requires_id, rank FROM talent_prereq WHERE talent_id = 135")).toEqual({ requires_id: 133, rank: 1 });
      });
    }
  });
}

// The spell tables (src/spellInfo.ts, src/spellText.ts, docs/spell-info.md) against what Classic says.
import { duration, resolve as resolveText, type Facts } from "../src/spellText";

describe("spell text", () => {
  const eff = (points: number, over = {}) => ({ points, die: 1, period: 0, radius: 0, chain: 0, misc: 0, amplitude: 0, perResource: 0, perLevel: 0, ...over });
  const facts = (f: Partial<Facts>): Facts => ({ effects: [], duration: null, procChance: 0, procCharges: 0, maxTargets: 0, stacks: 0, range: 0, ...f });
  const words = { desc: () => null, name: () => null };
  const run = (t: string, f: Facts) => resolveText(t, 1, (s) => (s === 1 ? f : null), words);

  test("durations read as the game writes them", () => {
    expect([1500, 30000, 90000, 120000, 3600000, -1].map(duration)).toEqual(["1.5 sec", "30 sec", "1.5 min", "2 min", "1 hour", "until cancelled"]);
  });
  test("$s, $d, ${} and a plural resolve; a die gives a range", () => {
    const f = facts({ effects: [eff(11), eff(5, { die: 7 }), eff(100)], duration: 15000 });
    expect(run("hits for $s1 for $d", f)).toEqual({ text: "hits for 11 for 15 sec", complete: true });
    expect(run("$s2 damage, ${$m3/10} rage", f)).toEqual({ text: "5 to 11 damage, 10 rage", complete: true });
    expect(run("$s1 $lpoint:points;, $s3 $lpoint:points;", f).text).toBe("11 points, 100 points");
  });
  test("points that grow with the player's level are not put in as a fixed number", () => {
    expect(run("$s1 damage", facts({ effects: [eff(12, { perLevel: 0.4 })] })).complete).toBe(false);
  });
  test("a token the tables cannot say stays as written and the row is not complete", () => {
    const f = facts({ effects: [eff(11)] });
    for (const t of ["$?s123[a][b]", "$ghe:she;", "${$<ticks>*$m1}", "$s9", "$t1"]) {
      const r = run(t, f);
      expect(r.complete).toBe(false);
      expect(r.text).toContain("$");
    }
  });
  test("another spell's text is put in, and a missing one is not", () => {
    const w = { desc: (s: number) => (s === 2 ? "slows by $s1%" : null), name: () => null };
    const look = (s: number) => (s === 2 ? facts({ effects: [eff(40)] }) : null);
    expect(resolveText("It $@spelldesc2.", 1, look, w)).toEqual({ text: "It slows by 40%.", complete: true });
    expect(resolveText("It $@spelldesc3.", 1, look, w).complete).toBe(false);
  });
});

for (const game of ["classic", "forever"] as const) {
  const built = existsSync(dbPath(game));
  describe.skipIf(!built)(`spell info (${game}.db)`, () => {
    const db = built ? openDb(game) : null!;
    const one = (id: number) => db.query("SELECT * FROM spell_info WHERE spell_id = ?").get(id) as Record<string, any>;

    test("Heroic Strike (rank 1) costs 15 rage, is instant, off the global cooldown, at 5 yards, any stance", () => {
      expect(one(78)).toMatchObject({ power_type: 1, cost: 15, cast_ms: 0, gcd_ms: null, cooldown_ms: null, range_max: 5, school_mask: 1, passive: 0, stance_mask: null });
    });
    test("Berserker Rage: Berserker Stance only (form 19), 30 s, global cooldown 1.5 s, free", () => {
      expect(one(18499)).toMatchObject({ cooldown_ms: 30000, gcd_ms: 1500, stance_mask: 1 << 18, cost: 0 });
      expect(db.query("SELECT Name_lang n FROM client_SpellShapeshiftForm WHERE ID = 19").get()).toEqual({ n: "Berserker Stance" });
    });
    test("Whirlwind is Berserker, Charge is Battle, Taunt is Defensive; Cat Form's Claw needs form 1", () => {
      expect([1680, 100, 355, 1082].map((s) => one(s).stance_mask)).toEqual([1 << 18, 1 << 16, 1 << 17, 1]);
    });
    test("Death Wish: 10 rage, 3 minutes; Sweeping Strikes 30 rage, 30 s", () => {
      expect(one(12328)).toMatchObject({ cost: 10, cooldown_ms: 180000 });
      expect(one(12292)).toMatchObject({ cost: 30, cooldown_ms: 30000 });
    });
    test("Claw is 45 energy, 1 s global cooldown; Ferocious Bite 35", () => {
      expect(one(1082)).toMatchObject({ power_type: 3, cost: 45, gcd_ms: 1000 });
      expect(one(22568)).toMatchObject({ power_type: 3, cost: 35 });
    });
    test("the icon path is the client's own, without its extension", () => {
      expect(String(one(78).icon_path).toLowerCase()).toBe("interface\\icons\\ability_rogue_ambush");
      expect(one(78).icon_file_id).toBe(132282);
      expect(db.query("SELECT count(*) n FROM spell_info WHERE icon_path LIKE '%.blp'").get()).toEqual({ n: 0 });
    });
    test("no negative cost, and rage is in points not tenths (none above 100)", () => {
      expect(db.query("SELECT count(*) n FROM spell_info WHERE cost < 0").get()).toEqual({ n: 0 });
      expect(db.query("SELECT count(*) n FROM spell_info WHERE power_type = 1 AND cost > 100").get()).toEqual({ n: 0 });
    });
    test("a cooldown is the larger of the spell's own and its category's (Retaliation: 30 minutes on Classic, 15 on Forever)", () => {
      expect(one(20230).cooldown_ms).toBe(game === "classic" ? 1800000 : 900000);
    });
    test("descriptions: Heroic Strike's $s1 is 11, Battle Shout's $d is 2 min; every row has a verdict", () => {
      const t = (id: number) => (db.query("SELECT text, complete FROM spell_text WHERE spell_id = ? AND kind = 'description'").get(id) as Record<string, any>) ?? {};
      expect(t(78)).toEqual({ text: "A strong attack that increases melee damage by 11 and causes a high amount of threat.", complete: 1 });
      expect(t(6673).text).toContain(game === "classic" ? "Lasts 2 min." : "Lasts 3 min.");
      expect(db.query("SELECT count(*) n FROM spell_text WHERE complete = 1 AND text LIKE '%$%'").get()).toEqual({ n: 0 });
    });
    test("Classic Era's points: a die adds one, none does not (Fire Ward absorbs 165, Heroic Strike adds 11)", () => {
      if (game === "classic") expect((db.query("SELECT text FROM spell_text WHERE spell_id = 543 AND kind = 'description'").get() as Record<string, string>).text).toContain("Absorbs 165");
    });
    test("Faerie Fire (Feral) 16857 is named in English on both games", () => {
      expect(db.query("SELECT name FROM name WHERE kind = 'spell' AND id = 16857 AND locale = 'enUS'").get()).toEqual({ name: "Faerie Fire (Feral)" });
    });
  });
}
