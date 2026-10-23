// The cache and the downloads: nothing half written or wrong is ever kept,
// a rate limit is waited out, an absent table is told from a failure, and a
// language short of names stops the build.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { nameFloor } from "../src/build";
import { absent, cachedIn, HttpError } from "../src/cache";
import { fetchRetry } from "../src/fetch";

const dir = mkdtempSync(path.join(tmpdir(), "wow-data-cache-"));

const hits: Record<string, number> = {};
let server: ReturnType<typeof Bun.serve>;
let base = "";
beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const p = new URL(req.url).pathname;
      hits[p] = (hits[p] ?? 0) + 1;
      if (p === "/table.csv") return new Response("ID,Name_lang\n1,Elwynn Forest\n");
      if (p === "/empty.csv") return new Response("");
      if (p === "/page.csv") return new Response("<!DOCTYPE html><title>Just a moment...</title>");
      if (p === "/absent.csv") return new Response("no such table", { status: 400 });
      if (p === "/missing.csv") return new Response("", { status: 404 });
      if (p === "/forbidden.csv") return new Response("", { status: 403 });
      if (p === "/limited.csv")
        return hits[p] < 2 ? new Response("", { status: 429, headers: { "retry-after": "0" } }) : new Response("ID\n1\n");
      if (p === "/flaky.csv") return hits[p] < 3 ? new Response("", { status: 520 }) : new Response("ID\n2\n");
      if (p === "/down.csv") return new Response("", { status: 503 });
      if (p === "/notes.txt") return new Response("");
      return new Response("", { status: 404 });
    },
  });
  base = `http://localhost:${server.port}`;
});
afterAll(() => {
  server.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

const quick = (url: string, init?: RequestInit) => fetchRetry(url, init, [0, 0, 0]);
const get = (name: string, rel = `t/${name}`) => cachedIn(dir, `${base}/${name}`, rel, undefined, quick);

describe("the cache", () => {
  test("keeps a good file, downloaded once, nothing left beside it", async () => {
    const file = await get("table.csv");
    expect(readFileSync(file, "utf8")).toContain("Elwynn Forest");
    expect(existsSync(`${file}.part`)).toBe(false);
    await get("table.csv");
    expect(hits["/table.csv"]).toBe(1);
  });
  test("refuses an empty table and a web page, and keeps neither", async () => {
    await expect(get("empty.csv")).rejects.toThrow("an empty body");
    await expect(get("page.csv")).rejects.toThrow("a web page");
    expect(existsSync(path.join(dir, "t", "empty.csv"))).toBe(false);
    expect(existsSync(path.join(dir, "t", "page.csv"))).toBe(false);
  });
  test("an empty file of another kind is a file", async () => {
    expect(readFileSync(await get("notes.txt"), "utf8")).toBe("");
  });
  test("a 400 or 404 is an absence, a 403 or a 5xx a failure", async () => {
    for (const name of ["absent.csv", "missing.csv"]) {
      const e = await get(name).catch((e) => e);
      expect(e).toBeInstanceOf(HttpError);
      expect(absent(e)).toBe(true);
    }
    for (const name of ["forbidden.csv", "down.csv"]) {
      const e = await get(name).catch((e) => e);
      expect(e).toBeInstanceOf(HttpError);
      expect(absent(e)).toBe(false);
    }
    expect(absent(new Error("ECONNRESET"))).toBe(false);
  });
});

describe("the downloads", () => {
  test("wait out a rate limit and a stumbling server", async () => {
    expect(readFileSync(await get("limited.csv"), "utf8")).toBe("ID\n1\n");
    expect(readFileSync(await get("flaky.csv"), "utf8")).toBe("ID\n2\n");
  });
  test("give up after three more tries", async () => {
    hits["/down.csv"] = 0;
    expect((await quick(`${base}/down.csv`)).status).toBe(503);
    expect(hits["/down.csv"]).toBe(4);
  });
});

describe("the names' floor", () => {
  const all = (n: number) => Object.fromEntries(["deDE", "esES", "esMX", "frFR", "itIT", "koKR", "ptBR", "ruRU", "zhCN", "zhTW"].map((l) => [l, n]));
  test("passes every language near English", () => {
    expect(() => nameFloor("area", "classic", { enUS: 1000, ...all(999) })).not.toThrow();
    expect(() => nameFloor("area", "classic", {})).not.toThrow();
  });
  test("stops a language short or missing", () => {
    expect(() => nameFloor("area", "classic", { enUS: 1000, ...all(1000), frFR: 900 })).toThrow("frFR 900");
    const { koKR: _, ...noKorean } = all(1000);
    expect(() => nameFloor("item", "forever", { enUS: 1000, ...noKorean })).toThrow("koKR missing");
  });
});
