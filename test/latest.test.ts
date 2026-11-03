// What bin/latest.ts finds, as rows and as the Markdown launch night reads
// (src/latest.ts). Made-up builds and commits, nothing fetched.
import { describe, expect, test } from "bun:test";
import { buildLines, buildRows, repoLine, repoRow } from "../src/latest";

const pins = { classic: { product: "wow_classic_era", build: "1.15.9.70576" }, forever: { product: "wowf", build: "1.60.1.70707" } };
const wago = {
  wow_classic_era: [{ version: "1.15.8.1" }, { version: "1.15.9.70576" }],
  wowf: [{ version: "1.60.1.70707" }, { version: "1.60.1.70753" }],
  wow_classic: [{ version: "1.60.1.70800" }, { version: "5.5.0.1" }],
};

describe("the game's builds against the pins", () => {
  const rows = buildRows(pins, wago);
  test("Classic is the latest, Forever moved, each game's own product", () => {
    expect(rows.map((r) => [r.game, r.moved, r.latest])).toEqual([["classic", false, "1.15.9.70576"], ["forever", true, "1.60.1.70753"]]);
  });
  test("the same game under another product is told, a different game's is not", () => {
    expect(rows[1].alsoUnder).toEqual([{ product: "wow_classic", build: "1.60.1.70800" }]);
    expect(rows[0].alsoUnder).toEqual([]);
  });
  test("a product with no builds answered leaves the pin as the latest", () => {
    expect(buildRows({ x: { product: "gone", build: "2.0.0.1" } }, wago)[0]).toMatchObject({ latest: "2.0.0.1", moved: false });
  });
  test("the Markdown is the lines launch night's parser reads", () => {
    expect(buildLines(rows)).toEqual([
      "- classic: wow_classic_era 1.15.9.70576, the latest",
      "- forever: wowf 1.60.1.70707 → **1.60.1.70753**",
      "  - also under wow_classic: 1.60.1.70800 (not followed: a product changes by hand, in pins.json)",
    ]);
  });
});

describe("the community databases and the UI source", () => {
  const db = { repo: "Questie/QuestieDB", commit: "579312817376aaaaaaaa" };
  const ui = { repo: "Gethe/wow-ui-source", branch: "forever", commit: "ca8368f2f238bbbb", build: "1.60.1.70532" };
  const head = { sha: "c5de61ab7c62ffff", message: "update (70707)", date: "2026-11-03T08:00:00Z" };

  test("a database with newer commits is told, never followed", () => {
    const r = repoRow("questie", db, head);
    expect(r).toMatchObject({ kind: "database", moved: true, head: { date: "2026-11-03" } });
    expect(r.head?.build).toBeUndefined();
    expect(repoLine(r)).toBe("- questie (Questie/QuestieDB): newer commits, c5de61ab7c62 of 2026-11-03 (pinned 579312817376; not followed: bump it by hand and read the audit)");
  });
  test("the pinned commit as the head is the latest", () => {
    const r = repoRow("questie", db, { ...head, sha: "579312817376aaaaaaaa" });
    expect(r.moved).toBe(false);
    expect(repoLine(r)).toBe("- questie (Questie/QuestieDB): the pinned commit is the latest");
  });
  test("an API that refuses is a row with its status, not a crash", () => {
    const r = repoRow("questie", db, { status: 403 });
    expect(r.error).toBe(403);
    expect(r.moved).toBeUndefined();
    expect(repoLine(r)).toBe("- questie (Questie/QuestieDB): could not ask (403)");
  });
  test("an empty repository has no head and counts as unmoved", () => {
    const r = repoRow("questie", db, undefined);
    expect(r.moved).toBe(false);
    expect(r.head).toBeUndefined();
  });
  test("a UI source behind the client says so, in rows and in words", () => {
    const r = repoRow("ui-forever", ui, { ...head, message: "x (70707)" }, "1.60.1.70707");
    expect(r).toMatchObject({ kind: "ui", client: "1.60.1.70707", against: "behind" });
    expect(repoLine(r)).toBe("- ui-forever (Gethe/wow-ui-source@forever): newer commit c5de61ab7c62 of 2026-11-03 (build 70707), pinned ca8368f2f238 (build 1.60.1.70532; not followed: bump it by hand); **client pinned 1.60.1.70707, this source carries 1.60.1.70532: behind the client**");
  });
  test("a UI source on the client's build, or without a client, says nothing of it", () => {
    expect(repoRow("ui-forever", ui, head, "1.60.1.70532").client).toBeUndefined();
    expect(repoRow("ui-textures-live", { ...ui, build: "9.2.7.45114" }, head, undefined).against).toBeUndefined();
    expect(repoRow("ui-forever", ui, head, "1.60.1.99999").against).toBe("behind");
    expect(repoRow("ui-forever", { ...ui, build: "1.60.1.99999" }, head, "1.60.1.70707").against).toBe("ahead");
  });
});
