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
