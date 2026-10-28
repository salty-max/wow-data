// Blizzard's UI source (Gethe/wow-ui-source: the XML and Lua of the game's own
// frames) and its textures, at the commits ui-pins.json names (ui-classic,
// ui-forever, ui-textures-*), and the client's own list of its interface files
// (wago.tools' ManifestInterfaceData at the pinned build). Read through
// bin/ui.ts. The source says what Blizzard's files define, never what the live
// client does with them (a frame built in Lua with a computed name, a hotfix).
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { CACHE, cached } from "./cache";
import { type Game, ROOT } from "./pins";
import { wagoFile } from "./wago";

const c12 = (s: string) => s.slice(0, 12);

// The UI source's pins live in ui-pins.json, not pins.json or src/pins.ts: no
// database is made of them, so moving one (or this file) is no new database.
export type UiPin = { repo: string; commit: string; branch: string; build: string };
export const UI_PINS_FILE = path.join(ROOT, "ui-pins.json");
export const REPOS: Record<string, UiPin> = JSON.parse(readFileSync(UI_PINS_FILE, "utf8")).repos;

// a file of a pinned UI repository (its local path), downloaded once
const repoFile = (name: string, file: string) => {
  const r = REPOS[name]!;
  return cached(`https://raw.githubusercontent.com/${r.repo}/${r.commit}/${file.split("/").map(encodeURIComponent).join("/")}`, `github/${r.repo}/${c12(r.commit)}/${file}`);
};
async function repoTree(name: string): Promise<string[]> {
  const r = REPOS[name]!;
  const token = process.env.GITHUB_TOKEN;
  const file = await cached(`https://api.github.com/repos/${r.repo}/git/trees/${r.commit}?recursive=1`, `github/${r.repo}/${c12(r.commit)}.tree.json`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
  return (JSON.parse(readFileSync(file, "utf8")).tree as { path: string; type: string }[]).filter((t) => t.type === "blob").map((t) => t.path);
}

export type Node = {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
  line: number;
  end: number; // the line of its closing tag
  file: string; // relative to the source's root
  full?: string; // its name with $parent resolved
  parent?: Node;
};

export const sourcePin = (game: Game) => REPOS[`ui-${game}`]!;

// the pinned source's folder (the tarball downloaded and unpacked once)
export async function uiSourceDir(game: Game): Promise<string> {
  const r = sourcePin(game);
  const dir = path.join(CACHE, "github", r.repo, c12(r.commit));
  if (!existsSync(path.join(dir, "Interface"))) {
    const tgz = await cached(`https://codeload.github.com/${r.repo}/tar.gz/${r.commit}`, `github/${r.repo}/${c12(r.commit)}.tar.gz`);
    // (unpacked beside and renamed in, so a tar cut short leaves nothing the next run trusts)
    const part = `${dir}.part`;
    rmSync(part, { recursive: true, force: true });
    mkdirSync(part, { recursive: true });
    const t = Bun.spawnSync(["tar", "-xzf", tgz, "-C", part, "--strip-components=1"]);
    if (t.exitCode !== 0) throw new Error(`tar ${tgz}: ${t.stderr.toString()}`);
    rmSync(dir, { recursive: true, force: true });
    renameSync(part, dir);
  }
  return dir;
}

function walk(dir: string, out: string[] = [], base = dir): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out, base);
    else if (/\.(xml|lua|toc)$/i.test(e)) out.push(path.relative(base, p));
  }
  return out;
}

// a small XML reader: tags, attributes, children, lines (no entities, no text)
export function parseXml(text: string, file: string): Node[] {
  const roots: Node[] = [];
  const stack: Node[] = [];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let line = 1;
  let last = 0;
  let m: RegExpExecArray | null;
  const lineAt = (i: number) => {
    for (let k = last; k < i; k++) if (text.charCodeAt(k) === 10) line++;
    last = i;
    return line;
  };
  while ((m = re.exec(text))) {
    if (!m[2]) continue; // comment, declaration
    const at = lineAt(m.index);
    if (m[1]) {
      const n = stack.pop();
      if (n) n.end = at;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[3]!.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]!] = a[2] ?? a[3] ?? "";
    const n: Node = { tag: m[2], attrs, children: [], line: at, end: at, file };
    const p = stack[stack.length - 1];
    if (p) {
      n.parent = p;
      p.children.push(n);
    } else roots.push(n);
    if (!m[4]) stack.push(n);
  }
  return roots;
}

export type Index = {
  game: Game;
  dir: string;
  byName: Map<string, Node[]>; // lowercase full name
  files: string[];
  xmlFiles: string[];
};
const indexes = new Map<Game, Index>();

export async function uiIndex(game: Game): Promise<Index> {
  const have = indexes.get(game);
  if (have) return have;
  const dir = await uiSourceDir(game);
  const files = walk(path.join(dir, "Interface")).map((f) => path.join("Interface", f));
  const byName = new Map<string, Node[]>();
  const xmlFiles = files.filter((f) => f.toLowerCase().endsWith(".xml"));
  for (const f of xmlFiles) {
    const roots = parseXml(readFileSync(path.join(dir, f), "utf8"), f);
    const visit = (n: Node, named: string | undefined, inTemplate: boolean) => {
      let here = named;
      let tpl = inTemplate;
      const name = n.attrs.name;
      if (name) {
        n.full = name.includes("$parent") ? name.replace("$parent", named ?? "") : name;
        if (n.attrs.virtual === "true") tpl = true;
        // (a template's children are named for the frame that inherits it: their
        // names are relative, indexed below under each instance, never bare)
        here = n.attrs.virtual === "true" ? "" : n.full;
        if (!(inTemplate && name.includes("$parent"))) {
          const k = n.full.toLowerCase();
          (byName.get(k) ?? byName.set(k, []).get(k)!).push(n);
        }
      }
      for (const c of n.children) visit(c, here, tpl);
    };
    for (const r of roots) visit(r, undefined, false);
  }
  // a frame that inherits a template has the template's "$parent…" children
  // under its own name (ButtonFrameTemplate's $parentInset is MailFrameInset),
  // and those inherit in turn (InsetFrameTemplate's $parentBg: MailFrameInsetBg)
  const add = (inst: string, from: Node, seen: Set<Node>) => {
    for (const t of (from.attrs.inherits ?? "").split(",").map((x) => x.trim()).filter(Boolean))
      for (const tn of byName.get(t.toLowerCase()) ?? []) {
        if (seen.has(tn)) continue;
        seen.add(tn);
        const walkT = (x: Node) => {
          for (const c of x.children) {
            if (c.attrs.name?.startsWith("$parent") && c.full) {
              const at = inst + c.full;
              const k = at.toLowerCase();
              const list = byName.get(k) ?? byName.set(k, []).get(k)!;
              if (!list.includes(c)) list.push(c);
              if (c.attrs.inherits) add(at, c, new Set());
            }
            walkT(c);
          }
        };
        walkT(tn);
        add(inst, tn, seen);
      }
  };
  for (const list of [...byName.values()])
    for (const n of [...list]) if (n.attrs.inherits && n.attrs.virtual !== "true" && n.full) add(n.full, n, new Set());
  const idx = { game, dir, byName, files, xmlFiles };
  indexes.set(game, idx);
  return idx;
}

// the frames a dotted path (Name.Key.Key) points at: the named frame, then
// each parentKey inside it (and inside the templates it inherits)
export function resolve(idx: Index, dotted: string): { found: Node[]; missingAt?: string } {
  const [head, ...keys] = dotted.split(".");
  let level = (idx.byName.get(head!.toLowerCase()) ?? []);
  if (!level.length) return { found: [], missingAt: head };
  for (const key of keys) {
    const next: Node[] = [];
    for (const n of level) next.push(...keyed(idx, n, key, new Set()));
    if (!next.length) return { found: [], missingAt: key };
    level = next;
  }
  return { found: level };
}
function keyed(idx: Index, n: Node, key: string, seen: Set<Node>): Node[] {
  if (seen.has(n)) return [];
  seen.add(n);
  const out: Node[] = [];
  // (only through the containers: any other widget is its own object, with its own keys)
  const dig = (x: Node) => {
    for (const c of x.children) {
      if (c.attrs.parentKey === key) out.push(c);
      else if (c.tag === "Frames" || c.tag === "Layers" || c.tag === "Layer") dig(c);
    }
  };
  dig(n);
  for (const t of (n.attrs.inherits ?? "").split(",").map((s) => s.trim()).filter(Boolean))
    for (const tn of idx.byName.get(t.toLowerCase()) ?? []) out.push(...keyed(idx, tn, key, seen));
  return out;
}

// every line of the source's Lua and XML naming text (case-sensitive)
export async function grepSource(game: Game, text: string): Promise<{ file: string; line: number; text: string }[]> {
  const idx = await uiIndex(game);
  const hits: { file: string; line: number; text: string }[] = [];
  for (const f of idx.files) {
    const body = readFileSync(path.join(idx.dir, f), "utf8");
    if (!body.includes(text)) continue;
    body.split("\n").forEach((l, i) => {
      if (l.includes(text)) hits.push({ file: f, line: i + 1, text: l.trim() });
    });
  }
  return hits;
}

// ---- textures ----

const norm = (p: string) => p.replace(/\//g, "\\").replace(/\.(blp|tga|png)$/i, "").replace(/^\\+/, "").toLowerCase();

// the client's own interface files at the pinned build (lowercase "interface\dir\name", no extension)
const manifests = new Map<Game, Set<string>>();
export async function clientTextures(game: Game): Promise<Set<string>> {
  const have = manifests.get(game);
  if (have) return have;
  const rows = readFileSync(await wagoFile(game, "ManifestInterfaceData"), "utf8").split("\n").slice(1);
  const set = new Set<string>();
  for (const row of rows) {
    const m = row.match(/^\d+,(.*?),(.*)$/);
    if (m) set.add(norm(m[1]! + m[2]!));
  }
  manifests.set(game, set);
  return set;
}
export const textureKey = (p: string) => norm(/^interface\\/i.test(norm(p)) ? p : `Interface\\${p}`);

export type Picture = { repo: string; path: string; file: string; width: number; height: number };
// the mirrors' own pictures by lowercase path without extension (a mirror's
// tree: Gethe keeps the part after Interface\ with its own folder case, and the
// live branch's list is cut short by GitHub, so a picture missing from it is
// not proof the mirror lacks it)
const trees = new Map<string, Map<string, string>>();
async function mirror(name: string): Promise<Map<string, string>> {
  const have = trees.get(name);
  if (have) return have;
  const m = new Map<string, string>();
  for (const p of await repoTree(name)) if (/\.png$/i.test(p)) m.set(p.replace(/\.png$/i, "").toLowerCase(), p);
  trees.set(name, m);
  return m;
}
// the picture of a texture in the pinned mirrors (classic's 2020 art first, then live's 2022)
export async function picture(texture: string): Promise<Picture | undefined> {
  const rel = textureKey(texture).replace(/^interface\\/, "").replace(/\\/g, "/");
  for (const name of ["ui-textures-classic", "ui-textures-live"]) {
    const p = (await mirror(name)).get(rel);
    if (!p) continue;
    const file = await repoFile(name, p);
    const b = readFileSync(file);
    return { repo: name, path: p, file, width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  return undefined;
}
