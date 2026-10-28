// Blizzard's UI source, one call: what the game's own frames and textures say.
//   bun wow-data/bin/ui.ts frame <Name[.parentKey…]> [--game classic|forever] [--xml]
//   bun wow-data/bin/ui.ts find <text> [--game …] [--all]
//   bun wow-data/bin/ui.ts texture <Interface\Path\Name> [--game …]
//   bun wow-data/bin/ui.ts pins                       what each game's source is, and how sure
// Both games when --game is left out. The source (Gethe/wow-ui-source at the
// commits in ui-pins.json) says what Blizzard's files define: it does not say what
// the live client does (a frame built in Lua with a computed name, a hotfix, a
// build newer than the commit). A frame path not found here is a guess, and the
// code or doc that uses it says so.
import { readFileSync } from "node:fs";
import path from "node:path";
import { type Game, CLASSIC, FOREVER } from "../src/pins";
import { clientTextures, grepSource, type Node, picture, REPOS, resolve, textureKey, uiIndex } from "../src/ui";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const val = (n: string) => argv[argv.indexOf(n) + 1];
const only = flag("--game") ? (val("--game") as Game) : undefined;
const games: Game[] = only ? [only] : ["classic", "forever"];
if (only && only !== "classic" && only !== "forever") fail("--game is classic or forever");
const [cmd, ...rest] = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--game");

function fail(msg: string): never {
  console.error(msg);
  process.exit(2);
}
const label = (g: Game) => {
  const r = REPOS[`ui-${g}`]!;
  const client = (g === "classic" ? CLASSIC : FOREVER).build;
  return `${g} (source ${r.branch}@${r.commit.slice(0, 7)} = build ${r.build}${r.build === client ? ", the pinned client" : `, client pinned ${client}`})`;
};
const attrs = (n: Node, skip: string[] = []) =>
  Object.entries(n.attrs)
    .filter(([k]) => !skip.includes(k))
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
const kids = (n: Node): Node[] => n.children.flatMap((c) => (["Frames", "Layers", "Layer", "Scripts"].includes(c.tag) && c.tag !== "Scripts" ? kids(c) : [c]));

function card(g: Game, n: Node, dir: string) {
  const a = n.attrs;
  console.log(`  ${n.tag} ${a.name ?? a.parentKey ?? "(anonymous)"}  ${n.file}:${n.line}-${n.end}`);
  const flags = ["virtual", "inherits", "parent", "parentKey", "hidden", "toplevel", "movable", "enableMouse", "frameStrata", "id", "text", "file", "atlas"]
    .filter((k) => a[k] !== undefined)
    .map((k) => `${k}="${a[k]}"`);
  if (flags.length) console.log(`    ${flags.join(" ")}`);
  for (const c of n.children) {
    if (c.tag === "Size") console.log(`    size: ${c.attrs.x && c.attrs.y ? `${c.attrs.x}x${c.attrs.y}` : c.children.map((d) => `${d.tag} ${attrs(d)}`).join(", ") || attrs(c)}`);
    if (c.tag === "Anchors")
      for (const an of c.children) {
        const off = an.children.find((d) => d.tag === "Offset");
        const o = off ? ` offset ${off.attrs.x},${off.attrs.y}` : an.attrs.x !== undefined || an.attrs.y !== undefined ? ` offset ${an.attrs.x ?? 0},${an.attrs.y ?? 0}` : "";
        console.log(`    anchor: ${an.attrs.point}${an.attrs.relativeTo ? ` to ${an.attrs.relativeTo}` : an.attrs.relativeKey ? ` to ${an.attrs.relativeKey}` : ""}${an.attrs.relativePoint ? ` ${an.attrs.relativePoint}` : ""}${o}`);
      }
    if (c.tag === "Scripts") console.log(`    scripts: ${c.children.map((d) => d.tag + (d.attrs.function ? `=${d.attrs.function}` : "")).join(", ")}`);
  }
  const sub = kids(n).filter((c) => !["Size", "Anchors", "Scripts"].includes(c.tag) && (c.attrs.name || c.attrs.parentKey));
  if (sub.length) {
    console.log(`    inside: ${sub.slice(0, 40).map((c) => `${c.tag} ${c.attrs.parentKey ?? c.attrs.name}`).join(", ")}${sub.length > 40 ? ` … (+${sub.length - 40})` : ""}`);
  }
  // who nests it
  let p = n.parent;
  const up: string[] = [];
  while (p) {
    if (p.attrs.name || p.attrs.parentKey) up.push(p.attrs.name ?? `[${p.attrs.parentKey}]`);
    p = p.parent;
  }
  if (up.length) console.log(`    inside frame: ${up.join(" < ")}`);
  if (a.parent) console.log(`    parent: ${a.parent}`);
  if (flag("--xml")) {
    const body = readFileSync(path.join(dir, n.file), "utf8").split("\n").slice(n.line - 1, n.end);
    console.log(body.slice(0, 120).map((l, i) => `    ${String(n.line + i).padStart(5)}| ${l}`).join("\n"));
  }
}

if (cmd === "frame" && rest[0]) {
  const target = rest[0];
  for (const g of games) {
    console.log(`${target} in ${label(g)}`);
    const idx = await uiIndex(g);
    const { found, missingAt } = resolve(idx, target);
    if (found.length) {
      for (const n of found.slice(0, 6)) card(g, n, idx.dir);
      if (found.length > 6) console.log(`  … (+${found.length - 6} more)`);
    } else {
      console.log(`  NOT in the XML (nothing named or keyed "${missingAt}" along the path).`);
      const near = [...idx.byName.keys()].filter((k) => k.includes(target.split(".")[0]!.toLowerCase())).slice(0, 8);
      if (near.length) console.log(`  similar names: ${near.join(", ")}`);
      const head = target.split(".")[0]!;
      const lua = (await grepSource(g, head)).filter((h) => h.file.endsWith(".lua")).slice(0, 5);
      for (const h of lua) console.log(`  lua: ${h.file}:${h.line}  ${h.text.slice(0, 110)}`);
      if (!lua.length) console.log("  and no Lua line names it: a guess unless something shows otherwise.");
      else console.log("  (a frame made in Lua may exist anyway: read those lines)");
    }
  }
} else if (cmd === "find" && rest[0]) {
  const limit = flag("--all") ? Infinity : 12;
  for (const g of games) {
    const hits = await grepSource(g, rest[0]);
    const files = new Set(hits.map((h) => h.file));
    console.log(`${label(g)}: ${hits.length} line${hits.length === 1 ? "" : "s"} in ${files.size} file${files.size === 1 ? "" : "s"}`);
    for (const h of hits.slice(0, limit)) console.log(`  ${h.file}:${h.line}  ${h.text.slice(0, 120)}`);
    if (hits.length > limit) console.log(`  … (+${hits.length - limit}, --all)`);
  }
} else if (cmd === "texture" && rest[0]) {
  const key = textureKey(rest[0]);
  for (const g of games) {
    const set = await clientTextures(g);
    const has = set.has(key);
    console.log(`${rest[0]} in ${g} (client ${(g === "classic" ? CLASSIC : FOREVER).build}): ${has ? "EXISTS in the client's interface files" : "NOT in the client's interface files"}`);
    if (!has) {
      const dir = key.slice(0, key.lastIndexOf("\\") + 1);
      const leaf = key.slice(dir.length);
      const near = [...set].filter((k) => k.startsWith(dir) && !k.slice(dir.length).includes("\\") && k.slice(dir.length, dir.length + 6) === leaf.slice(0, 6)).slice(0, 8);
      if (near.length) console.log(`  same folder, same start: ${near.join(", ")}`);
    }
  }
  const pic = await picture(rest[0]);
  if (pic) console.log(`picture: ${pic.file}  (${pic.width}x${pic.height}, ${pic.repo} = ${REPOS[pic.repo]!.branch}@${REPOS[pic.repo]!.commit.slice(0, 7)}, art of ${REPOS[pic.repo]!.build}: look at it, it may differ from the client's)`);
  else console.log("picture: none in the pinned mirrors (classic's 2020 art, live's 2022 list is cut short by GitHub)");
} else if (cmd === "pins") {
  for (const g of ["classic", "forever"] as Game[]) console.log(label(g));
  for (const n of ["ui-textures-classic", "ui-textures-live"]) console.log(`${n}: ${REPOS[n]!.repo}@${REPOS[n]!.branch} ${REPOS[n]!.commit.slice(0, 7)} (art of ${REPOS[n]!.build})`);
} else {
  fail("usage: ui.ts frame <Name[.parentKey…]> [--xml] | find <text> [--all] | texture <Interface\\path> | pins   [--game classic|forever]");
}
