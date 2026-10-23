// QuestieDB (pins.json's questie): the game's world as Questie keeps it, for
// both games, and its translations. Its own engine merges it (raw base,
// every correction layer, derived passes: bin/questie-export.lua run in a
// checkout at the pin); nothing of its layering is interpreted here.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CACHE, cached } from "./cache";
import { type Game, REPOS, ROOT } from "./pins";

export type QuestieRecord = Record<string, unknown>;
export type QuestieData = {
  quests: Record<string, QuestieRecord>;
  npcs: Record<string, QuestieRecord>;
  objects: Record<string, QuestieRecord>;
  items: Record<string, QuestieRecord>;
  // locale -> { quests: id -> [title, objectivesText], npcs: id -> [name, title], objects/items: id -> name }
  l10n: Record<string, Record<string, Record<string, unknown>>>;
};
export const QUESTIE_LOCALES = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "ruRU", "zhCN", "zhTW"];

// Real Lua 5.1 (Questie's tables are too big for LuaJIT): $LUA51, Questie's
// bundled binary on Linux x64, else built from lua.org's source into the cache.
const LUA = { version: "5.1.5", sha256: "2640fc56a795f29d28ef15e13c34a47e223960b0240e8cb0a82d9b0738695333" };
async function lua51(checkout: string): Promise<string> {
  if (process.env.LUA51) return process.env.LUA51;
  const bundled = path.join(checkout, "tools", "lua-binary", "linux-x64", "lua");
  if (process.platform === "linux" && process.arch === "x64" && existsSync(bundled)) return bundled;
  const dir = path.join(CACHE, "tools", `lua-${LUA.version}`);
  const binary = path.join(dir, "src", "lua");
  if (existsSync(binary)) return binary;
  const archive = await cached(`https://www.lua.org/ftp/lua-${LUA.version}.tar.gz`, `tools/lua-${LUA.version}.tar.gz`);
  const sum = createHash("sha256").update(readFileSync(archive)).digest("hex");
  if (sum !== LUA.sha256) throw new Error(`lua-${LUA.version}.tar.gz: checksum ${sum}, not lua.org's`);
  for (const [cmd, args, cwd] of [
    ["tar", ["-xzf", archive], path.join(CACHE, "tools")],
    ["make", ["generic", "-s"], dir],
  ] as const) {
    const run = spawnSync(cmd, [...args], { cwd, stdio: "inherit" });
    if (run.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
  }
  return binary;
}

// QuestieDB at its pin, whole (its engine needs every file): GitHub's archive, once
async function checkout(): Promise<string> {
  const r = REPOS.questie;
  const dir = path.join(CACHE, "github", r.repo, `${r.commit.slice(0, 12)}-full`);
  if (existsSync(path.join(dir, "generator", "flavor.lua"))) return dir;
  const archive = await cached(`https://codeload.github.com/${r.repo}/tar.gz/${r.commit}`, `github/${r.repo}/${r.commit.slice(0, 12)}.tar.gz`);
  // (unpacked beside it and moved in whole: an unpacking cut short is never the checkout)
  const part = `${dir}.part`;
  rmSync(part, { recursive: true, force: true });
  mkdirSync(part, { recursive: true });
  const run = spawnSync("tar", ["-xzf", archive, "-C", part, "--strip-components", "1"], { stdio: "inherit" });
  if (run.status !== 0) throw new Error("QuestieDB's archive didn't unpack");
  rmSync(dir, { recursive: true, force: true });
  renameSync(part, dir);
  return dir;
}

// a game's data from Questie (cached as JSON by the pin and by the exporter:
// an edit to questie-export.lua exports anew)
export async function questie(game: Game): Promise<QuestieData> {
  const r = REPOS.questie;
  const exporter = path.join(ROOT, "bin", "questie-export.lua");
  const version = createHash("sha256").update(readFileSync(exporter)).digest("hex").slice(0, 8);
  const out = path.join(CACHE, "questie", `${game}-${r.commit.slice(0, 12)}-${version}.json`);
  if (!existsSync(out)) {
    const dir = await checkout();
    const lua = await lua51(dir);
    const flavor = game === "classic" ? "Vanilla" : "Forever";
    const run = spawnSync(lua, [exporter, flavor, QUESTIE_LOCALES.join(",")], {
      cwd: dir,
      maxBuffer: 1 << 30,
    });
    if (run.status !== 0) throw new Error(`questie-export.lua ${flavor}: ${run.stderr}`);
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(`${out}.part`, run.stdout);
    renameSync(`${out}.part`, out);
  }
  return JSON.parse(readFileSync(out, "utf8"));
}

// Questie's own zone ids (an instance's wing, a continent's map: 10026 for
// Dire Maul's Warpwood Quarter, 10073 for Kalimdor's) and the game's UiMap
// each stands for: its support/Zones/uiMapIdToAreaId.lua, private id -> UiMap.
export async function questieZoneMaps(): Promise<Map<number, number>> {
  const file = path.join(await checkout(), "support", "Zones", "uiMapIdToAreaId.lua");
  const out = new Map<number, number>();
  for (const m of readFileSync(file, "utf8").matchAll(/\[\s*(\d+)\s*\]\s*=\s*(\d+)\s*,/g)) {
    const ui = Number(m[1]), area = Number(m[2]);
    if (!out.has(area)) out.set(area, ui);
  }
  return out;
}

// What Season of Discovery has that Classic Era hasn't (Questie's SoD base)
// and what Forever's players met (its Forever traces, gathered in the game),
// by kind, each by its ids: bin/questie-season.lua, a moment's run, never cached.
type ByKind = Record<"creature" | "object" | "quest" | "item", number[]>;
export async function questieSeason(): Promise<{ sod: ByKind; traced: ByKind }> {
  const dir = await checkout();
  const run = spawnSync(await lua51(dir), [path.join(ROOT, "bin", "questie-season.lua")], { cwd: dir, maxBuffer: 1 << 26 });
  if (run.status !== 0) throw new Error(`questie-season.lua: ${run.stderr}`);
  return JSON.parse(run.stdout.toString());
}
