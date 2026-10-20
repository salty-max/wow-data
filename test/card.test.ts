// The cards (src/card.ts, bin/card.ts) against facts from the game, in each
// database that is built (bun bin/build.ts first; skipped where it isn't):
// what a riddle's vetting asks of them, and 40 lines at most.
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { card, type Kind, MAX_LINES } from "../src/card";
import { dbPath, openDb } from "../src/db";

for (const game of ["classic", "forever"] as const) {
  const built = existsSync(dbPath(game));
  describe.skipIf(!built)(`cards (${game}.db)`, () => {
    const db = built ? openDb(game) : null!;
    const text = (kind: Kind, key: string, full = false) => card(db, kind, key, { full }).join("\n");

    test("npc 10582: Freewind Post's dog, Sire in every language (Reproducteur in French), Thunder Bluff's", () => {
      const c = text("npc", "10582");
      expect(c).toStartWith("npc 10582 Dog <Sire>");
      expect(c).toContain("frFR Reproducteur");
      expect(c).toContain("faction Thunder Bluff (template 104): member of the Horde, attacks the Alliance");
      expect(c).toContain("Thousand Needles 45.2,50.4 (Freewind Post)");
      expect(c).toContain("walks a path");
    });
    test("object 2082: Uther's tomb, its plaque's text, High Priest Thel'danis beside it (62, attacks the Horde)", () => {
      const c = text("object", "2082");
      expect(c).toContain("type    Text (9)");
      expect(c).toContain('"Here lies Uther the Lightbringer / First Paladin - Founder of the Order of the Silver Hand');
      expect(c).toContain("Western Plaguelands 52.1,83.3 (Sorrow Hill)");
      expect(c).toMatch(/near {4}High Priest Thel'danis \(1854\) 62, attacks the Horde, 1 yd/);
    });
    test('place "Pool of Tears" (by name): its quests 1424 and 1475, through the artifacts and tablets in it', () => {
      const c = text("place", "Pool of Tears");
      expect(c).toStartWith("place 74 Pool of Tears");
      expect(c).toContain("in      Swamp of Sorrows (8)");
      expect(c).toContain("1424 Pool of Tears (43): Atal'ai Artifact from Atal'ai Artifact");
      expect(c).toContain("1475 Into The Temple of Atal'Hakkar (50): Atal'ai Tablet from Atal'ai Tablet");
      // (a world drop, a gem or cloth from any mob, isn't a quest working there;
      // the pool's three look-alike artifacts share their spots)
      expect(c).toContain("quests  6 · +");
      expect(c).not.toContain("Citrine");
      expect(c).not.toContain("Mageweave");
      expect(c).toMatch(/objects Atal'ai Artifact \(30854,30855,30856\) ×6\d · Atal'ai Tablet \(37099\) ×15/);
    });
    test("who attacks whom: a guard a member of its side, each race's own standing, a pooled neighbour named", () => {
      expect(text("npc", "68")).toContain("faction Stormwind (template 11): member of the Alliance, attacks the Horde and the monsters");
      expect(text("npc", "3296")).toContain("reputation: Alliance hated, Horde friendly (Undead neutral)");
      expect(text("npc", "5243")).toContain("drops   Fetish of Hakkar (6181) for 1445 · Flask of Big Mojo (8152) for 8785 · +");
      const near = text("object", "1981");
      expect(near).toContain("near    Bloodsail Sea Dog (1565)");
      expect(near).not.toContain("(0)");
    });
    test("a subzone's place card and an npc card agree: the dog stands in Freewind Post", () => {
      expect(text("place", "Freewind Post", true)).toMatch(/Dog 10\b/);
    });
    test("item 6175 and quest 1475: asked by their quests, found in the pool's look-alike objects", () => {
      expect(text("item", "6175")).toContain("asked   1424 Pool of Tears (43) ×10");
      expect(text("item", "6175")).toContain("in      1: Atal'ai Artifact (30854,30855,30856) quest 100%, Swamp of Sorrows");
      const q = text("quest", "1475");
      expect(q).toContain("from    Brohann Caskbelly (5384), Stormwind City");
      expect(q).toContain("asks    10 × Atal'ai Tablet (6288) ← Atal'ai Tablet (37099) quest 100%, Swamp of Sorrows");
      expect(q).toContain("after   1469 Rhapsody's Tale (43)");
    });
    test("npc 6740: an innkeeper's gossip, its languages, what she sells", () => {
      const c = text("npc", "Innkeeper Allison");
      expect(c).toContain('gossip  "Welcome to my Inn, weary traveler. What can I do for you?" · deDE,enUS,esES,esMX,frFR,ptBR,ruRU');
      expect(c).toMatch(/sells {3}15: Refreshing Spring Water/);
    });
    test("a missing language flagged, the English a client shows marked", () => {
      expect(text("quest", "1475")).toContain("MISSING itIT");
      if (game === "forever") expect(text("npc", "240482")).toContain("frFR,itIT,ruRU,zhCN,zhTW Berdun Cliffbrew (English)");
    });
    test.skipIf(game !== "forever")("an item inside another (Questie's containers), not a creature", () => {
      expect(text("item", "270001")).toContain("in item 1: inside Captain Sander's Locker (270257)");
    });
    test("every card 40 lines at most, a zone's and a herb's too; --full lifts the cap", () => {
      for (const [kind, key] of [
        ["npc", "6"],
        ["npc", "448"],
        ["object", "1618"],
        ["item", "2589"],
        ["place", "400"],
        ["place", "Stormwind City"],
        ["quest", "33"],
      ] as [Kind, string][])
        expect(card(db, kind, key).length).toBeLessThanOrEqual(MAX_LINES);
      expect(card(db, "place", "400", { full: true }).length).toBeGreaterThan(MAX_LINES);
    });
    test("a name several things bear: the one with the most spawns, the others told", () => {
      // (Gri'lek of Zul'Gurub, the boss and his spawned form)
      const c = card(db, "npc", "gri'lek");
      expect(c[0]).toStartWith("npc 15081 Gri'lek");
      expect(c[1]).toBe("also    1 more named so: 15082");
      expect(card(db, "npc", "No Such Creature Anywhere")).toEqual(['npc "No Such Creature Anywhere": no such creature (an id, or its exact name)']);
    });
  });
}
