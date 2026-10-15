import { describe, expect, test } from "bun:test";
import { gameQuestText } from "../src/gametext";
import { compactPage } from "../src/wowheadPages";

describe("Wowhead's pages, as the build takes them", () => {
  test("a quest's text the game's own: tokens, asides, lines; Wowhead's tip cut", () => {
    expect(gameQuestText("Satisfaction, <name>.<br><br>Go to <a href=\"/x\">Okothos</a>, <lad/lass> &amp; return.<br> See if you've already completed this by typing:<pre>x</pre>")).toBe(
      "Satisfaction, $N.$B$BGo to Okothos, $glad:lass; & return.",
    );
    expect(gameQuestText("Well, &lt;name&gt;... <Angela points to her head.> Think.")).toBe("Well, $N... <Angela points to her head.> Think.");
  });

  test("a quest's info box: level, zone or sort, who starts and ends it", () => {
    const q = compactPage("quest", "enUS", {
      title: "The Art of the Armorsmith",
      details: "Satisfaction, <name>.",
      info: { category: -121, level: 40, reqlevel: 40, side: 2, reqclass: 1 },
      box: "[ul][li]Level: 40[/li][li][icon name=quest-start]Start: [url=/forever/npc=11177/okothos-ironrager]Okothos[/url][/icon][/li][li][icon name=quest-end]End: [url=/forever/object=1617/x]X[/url][/icon][/li][li]Added in patch [acronym=\\",
    });
    expect(q).toEqual({ title: "The Art of the Armorsmith", details: "Satisfaction, $N.", level: 40, min: 40, sort: 121, side: 2, classes: 1, start: [["creature", 11177]], end: [["object", 1617]] });
    // (another language: its texts only)
    expect(compactPage("quest", "deDE", { title: "T", objectives: "O", info: { level: 40 } })).toEqual({ title: "T", objectives: "O" });
  });

  test("Wowhead's own codes left out: an uncategorized creature, a quest object's category, a scaling level", () => {
    expect(compactPage("npc", "enUS", { info: { type: 0, classification: 1, name: "X" }, model: 5, quotes: [{ kind: "s1", text: "For the Horde!" }] })).toEqual({
      name: "X",
      rank: 1,
      model: 5,
      lines: [["yell", "For the Horde!"]],
    });
    expect(compactPage("object", "enUS", { info: { type: -3, name: "Peacebloom" } })).toEqual({ name: "Peacebloom", type: 3 });
    expect(compactPage("object", "enUS", { info: { type: -2, name: "Crate" } })).toEqual({ name: "Crate" });
    expect(compactPage("quest", "enUS", { title: "T", info: { level: -1 } })).toEqual({ title: "T" });
    expect(compactPage("quest", "enUS", { missing: "404" })).toBeNull();
  });
});
