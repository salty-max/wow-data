// A floor under the class guide for every class and tree of both games (src/coverage.ts,
// docs/class-coverage.md): a pin bump or a build change that empties a table for a class that
// should have rows fails here instead of going out silently.
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { card } from "../src/card";
import { classCoverage, treeCoverage } from "../src/coverage";
import { dbPath, openDb } from "../src/db";

const CLASSES = [1, 2, 3, 4, 5, 7, 8, 9, 11]; // Warrior, Paladin, Hunter, Rogue, Priest, Shaman, Mage, Warlock, Druid

for (const game of ["classic", "forever"] as const) {
  const built = existsSync(dbPath(game));
  describe.skipIf(!built)(`class coverage (${game}.db)`, () => {
    const db = built ? openDb(game) : null!;
    const classes = built ? classCoverage(db) : [];
    const forever = game === "forever";

    test("all nine classes, three trees each", () => {
      expect(classes.map((c) => c.class_id)).toEqual(CLASSES);
      for (const c of classes) expect(Number(c.talents.trees)).toBe(3);
      expect(treeCoverage(db).length).toBe(27);
    });
    test("every class has trainer lessons, start spells, races and talents", () => {
      for (const c of classes) {
        expect(Number(c.spells.trainer)).toBeGreaterThanOrEqual(90);
        expect(Number(c.spells.start)).toBeGreaterThanOrEqual(1);
        expect(c.races).toBeGreaterThanOrEqual(2);
        expect(Number(c.talents.total)).toBeGreaterThanOrEqual(44);
        expect(Number(c.spells.talent)).toBeGreaterThanOrEqual(Number(c.talents.total));
      }
    });
    test("nearly every class spell has a level, a name and a spell_info row (the gaps are told in docs/class-coverage.md)", () => {
      for (const c of classes) {
        const total = Number(c.spells.total);
        expect(Number(c.spells.named) / total).toBeGreaterThan(0.97);
        expect(Number(c.spells.with_info) / total).toBeGreaterThan(forever ? 0.8 : 0.99);
        expect(Number(c.spells.with_level) / total).toBeGreaterThan(0.45);
        expect(Number(c.spells.with_icon) / Number(c.spells.with_info)).toBeGreaterThan(0.97);
      }
    });
    test("every talent is named and has its spell's facts", () => {
      for (const c of classes) {
        expect(Number(c.talents.named)).toBe(Number(c.talents.total));
        expect(Number(c.talents.with_info)).toBe(Number(c.talents.total));
        expect(Number(c.talents.prereqs_no_rank)).toBe(0);
        if (!forever) expect(Number(c.talents.rank_spells)).toBeGreaterThanOrEqual(Number(c.talents.total) * 2);
      }
    });
    test("Forever's new talents and moved tabs are counted", () => {
      const sum = (k: string) => classes.reduce((n, c) => n + Number(c.talents[k]), 0);
      expect(sum("new")).toBe(forever ? 128 : 0);
      expect(sum("moved")).toBe(forever ? 11 : 0);
    });
    test("a requirement never stands below the talent it opens, and none runs both ways", () => {
      expect(db.query("SELECT count(*) n FROM talent_prereq p JOIN talent a ON a.id = p.talent_id JOIN talent b ON b.id = p.requires_id WHERE b.tab_id = a.tab_id AND b.row > a.row").get()).toEqual({ n: 0 });
      expect(db.query("SELECT count(*) n FROM talent_prereq a JOIN talent_prereq b ON a.talent_id = b.requires_id AND a.requires_id = b.talent_id").get()).toEqual({ n: 0 });
    });
    test("a prerequisite asks the required talent's last rank, as every one of Classic's does", () => {
      expect(db.query("SELECT count(*) n FROM talent_prereq p JOIN talent r ON r.id = p.requires_id WHERE p.rank <> r.max_rank").get()).toEqual({ n: 0 });
    });
    test("a talent's every rank is a class spell: Sweeping Strikes, Death Wish and Concussion Blow (Warrior), Omen of Clarity (Druid, Classic: Forever's client has no such spell)", () => {
      const has = (cls: number, name: string) =>
        db.query("SELECT count(*) n FROM class_spell c JOIN name n ON n.kind = 'spell' AND n.id = c.spell_id AND n.locale = 'enUS' WHERE c.class_id = ? AND n.name = ? AND c.kind = 'talent'").get(cls, name) as { n: number };
      for (const [cls, name] of [[1, "Sweeping Strikes"], [1, "Death Wish"], [1, "Concussion Blow"], [11, "Omen of Clarity"]] as const) if (!(forever && name === "Omen of Clarity")) expect(has(cls, name).n).toBeGreaterThan(0);
    });
    test("a card answers for every class, its talents and every tree", () => {
      for (const c of classes) {
        for (const kind of ["class", "talents"] as const) {
          const lines = card(db, kind, c.name);
          expect(lines.length).toBeGreaterThan(3);
          expect(lines[0]).not.toContain("no such");
        }
      }
      for (const t of treeCoverage(db)) expect(card(db, "talents", String(t.tree))[0]).not.toContain("no such");
    });
    test("the class-race table: a Warrior may be Human and Orc, a Paladin may not be an Orc (Forever's Pandaren and others aside)", () => {
      const may = (cls: number, race: number) => (db.query("SELECT count(*) n FROM class_race WHERE class_id = ? AND race_id = ?").get(cls, race) as { n: number }).n;
      expect(may(1, 1)).toBe(1);
      expect(may(1, 2)).toBe(1);
      expect(may(2, 2)).toBe(0);
    });
  });
}
