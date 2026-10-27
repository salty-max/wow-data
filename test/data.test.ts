import { describe, expect, test } from "bun:test";
import { gamePage } from "../src/build";
import { family, newer, newest } from "../src/builds";
import { csv } from "../src/csv";
import { PINS, wagoQuery } from "../src/pins";

describe("builds", () => {
  test("a version is newer by its numbers, not its letters", () => {
    expect(newer("1.60.1.70374", "1.60.1.70291")).toBe(true);
    expect(newer("1.60.10.1", "1.60.9.99999")).toBe(true);
    expect(newer("1.60.1.70291", "1.60.1.70291")).toBe(false);
  });
  test("the newest of the pin's own game, never another major version", () => {
    expect(newest(["5.5.0.62071", "1.60.1.70374", "1.60.1.70338"], "1.60.1.70291")).toBe("1.60.1.70374");
    expect(newest(["5.5.0.62071"], "1.60.1.70291")).toBe("1.60.1.70291");
    expect(family("1.60.1.70291")).toBe("1.60");
  });
});

describe("books", () => {
  test("Wowhead's markup turned back into the game's, in every language", () => {
    expect(gamePage("Seid gegrüßt, &lt;Name&gt; der &lt;Klasse&gt;.<br />Hallo")).toBe("Seid gegrüßt, $N der $C.\nHallo");
    expect(gamePage("Salut, &lt;nom&gt; le &lt;classe&gt;.")).toBe("Salut, $N le $C.");
    expect(gamePage("dass &lt;ein Bruder/eine Schwester&gt; kommt")).toBe("dass $gein Bruder:eine Schwester; kommt");
    expect(gamePage("an &lt;der Überbringer/die Überbringerin&gt;")).toBe("an $gder Überbringer:die Überbringerin;");
  });
  test("the game's own asides kept, never taken for markup", () => {
    expect(gamePage("&lt;unleserlicher Text&gt;")).toBe("<unleserlicher Text>");
    expect(gamePage("&lt;texte illisible&gt;")).toBe("<texte illisible>");
    expect(gamePage("<p>&lt;Die Seiten sind mit alten Elfenrunen bedeckt.&gt;</p>")).toBe("<Die Seiten sind mit alten Elfenrunen bedeckt.>");
  });
});

describe("csv", () => {
  test("quoted cells, doubled quotes, commas and CRLF", () => {
    const rows = csv('ID,Name_lang\r\n1,"Goblin ""Boom"" Box"\r\n2,"a, b"\r\n');
    expect(rows).toEqual([
      { ID: "1", Name_lang: 'Goblin "Boom" Box' },
      { ID: "2", Name_lang: "a, b" },
    ]);
  });
});

describe("pins", () => {
  test("both games and the databases are pinned", () => {
    expect(Object.keys(PINS.builds).sort()).toEqual(["classic", "forever"]);
    expect(Object.keys(PINS.repos).sort()).toEqual(["classicdb", "questie"]);
    for (const name of ["questie", "classicdb"]) {
      expect(PINS.repos[name].commit).toMatch(/^[0-9a-f]{40}$/);
    }
    expect(PINS.builds.classic.product).toBe("wow_classic_era");
    expect(PINS.builds.forever.product).toBe("wowf");
    expect(wagoQuery({ product: "wow_classic_era", build: "1.15.9.70003" })).toBe("product=wow_classic_era&build=1.15.9.70003");
    for (const game of ["classic", "forever"] as const) {
      expect(PINS.builds[game].build).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
      expect(wagoQuery(PINS.builds[game])).toBe(`product=${PINS.builds[game].product}&build=${PINS.builds[game].build}`);
    }
  });
});
