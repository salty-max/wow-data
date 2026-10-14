import { describe, expect, test } from "bun:test";
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
    expect(wagoQuery(PINS.builds.classic)).toBe("product=wow_classic_era&build=1.15.9.70003");
  });
});
