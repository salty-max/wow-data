// A data change in words, for Ravenpost's activity and notifications
// (bin/tell.ts): what a day's generated files hold that they didn't, and
// what in wow-data moved them. Prints { "title", "body" } as JSON.
//   bun ../wow-data/bin/describe-data.ts <repo> PATHSPEC...   in an addon's folder,
//     after its generators (addon-data.yml): the files changed against HEAD,
//     a JSON file's entries counted (new, changed, gone), the rest named;
//     wow-data's commits since the one the addon's last data commit names
//     ("wow-data: <commit>" in its message)
//   bun bin/describe-data.ts --pins     in wow-data, after bin/latest.ts --write
//   bun bin/describe-data.ts --failed REPO [WORDS]   a job that stopped
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../src/pins";

const git = (args: string[], cwd = process.cwd()) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : "";
};

export const ADDON_NAMES: Record<string, string> = {
  hearthtale: "Hearthtale",
  "lorekeepers-codex": "The Codex",
  yonder: "Yonder",
  "second-wind": "Second Wind",
  keyring: "Keyring",
};
const LANGUAGES: Record<string, string> = {
  enUS: "English", enGB: "English", deDE: "German", frFR: "French", esES: "Spanish", esMX: "Latin American Spanish",
  itIT: "Italian", koKR: "Korean", ptBR: "Portuguese", ruRU: "Russian", zhCN: "Chinese", zhTW: "Taiwanese Chinese",
};
// (the generated files' names, in words; anything else by its own name)
const NAMES: Record<string, string> = {
  creatures: "creature names", types: "creature types", glossary: "names from the game", classic: "Classic's names",
  places: "place names", subzones: "subzone names", words: "interface words", expeditions: "expedition spots",
  flora: "herbs and fish", "rare-zones": "rares' zones", zones: "zones", peoples: "peoples", books: "books",
};
const words = (name: string) => NAMES[name] ?? name.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

/** What a file is, in words: "German creature names", "Forever's zones". */
export function labelOf(file: string): { label: string; derived?: boolean } {
  const parts = file.split("/");
  const base = path.basename(file).replace(/\.[^.]+$/, "");
  if (parts[0] === "i18n" && LANGUAGES[parts[1]]) {
    const what = parts.length > 3 ? words(parts[2]) : words(base);
    return { label: `${LANGUAGES[parts[1]]} ${what}` };
  }
  if (/^Text_[a-z]{2}[A-Z]{2}$/.test(base)) return { label: "the language files", derived: true };
  const game = base.match(/^(.*?)[-_](classic|forever)$/i);
  if (game) {
    const forever = game[2].toLowerCase() === "forever";
    return parts[0] === "addon"
      ? { label: `the ${forever ? "Forever" : "Classic"} data`, derived: true }
      : { label: `${forever ? "Forever's" : "Classic's"} ${words(game[1])}` };
  }
  if (parts[0] === "addon") return { label: `the addon's ${words(base)}`, derived: true };
  return { label: words(base) };
}

type Count = { added: number; changed: number; removed: number };
/** Entries new, changed and gone between two JSON documents (one level down where the top holds a few big parts). */
export function countEntries(before: unknown, after: unknown): Count | null {
  const entries = (v: unknown): Map<string, string> | null => {
    if (Array.isArray(v)) return new Map(v.map((x, i) => [String((x as { id?: unknown })?.id ?? i), JSON.stringify(x)]));
    if (v && typeof v === "object") return new Map(Object.entries(v).map(([k, x]) => [k, JSON.stringify(x)]));
    return null;
  };
  const a = entries(before ?? {}), b = entries(after ?? {});
  if (!a || !b) return null;
  // (a document of a few parts, each a big table: the counts are the tables')
  const keys = new Set([...a.keys(), ...b.keys()]);
  const big = (k: string) => [a.get(k), b.get(k)].some((v) => (v?.startsWith("{") || v?.startsWith("[")) && (entries(JSON.parse(v))?.size ?? 0) > 3);
  if (!Array.isArray(after) && keys.size <= 3 && [...keys].every(big)) {
    const parts = [...keys].map((k) => countEntries(JSON.parse(a.get(k) ?? "null"), JSON.parse(b.get(k) ?? "null")));
    if (parts.every(Boolean))
      return (parts as Count[]).reduce<Count>((t, c) => ({ added: t.added + c.added, changed: t.changed + c.changed, removed: t.removed + c.removed }), { added: 0, changed: 0, removed: 0 });
  }
  const c: Count = { added: 0, changed: 0, removed: 0 };
  for (const k of keys) {
    if (!a.has(k)) c.added++;
    else if (!b.has(k)) c.removed++;
    else if (a.get(k) !== b.get(k)) c.changed++;
  }
  return c;
}
const countWords = (c: Count) =>
  [c.added && `${c.added.toLocaleString("en-GB")} new`, c.changed && `${c.changed.toLocaleString("en-GB")} changed`, c.removed && `${c.removed.toLocaleString("en-GB")} gone`]
    .filter(Boolean)
    .join(", ");
const and = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const subject = (s: string) => s.replace(/^\w+(\([^)]*\))?!?:\s*/, "");

/** The files a pathspec holds that changed against HEAD (new ones too). */
function changedFiles(specs: string[]): string[] {
  const out: string[] = [];
  for (const line of git(["status", "--porcelain", "--untracked-files=all", "--", ...specs]).split("\n")) {
    if (!line.trim()) continue;
    const p = line.slice(3).split(" -> ").pop()!.replace(/^"|"$/g, "");
    out.push(p);
  }
  return out.sort();
}

export function describeAddon(repo: string, specs: string[]): { title: string; body: string } {
  const files = changedFiles(specs);
  const name = ADDON_NAMES[repo] ?? repo;
  const told: string[] = [];
  const derived = new Set<string>();
  for (const f of files) {
    const { label, derived: isDerived } = labelOf(f);
    if (isDerived) {
      derived.add(label);
      continue;
    }
    let what = label.charAt(0).toUpperCase() + label.slice(1);
    if (f.endsWith(".json") && existsSync(f)) {
      try {
        const before = git(["show", `HEAD:${f}`]);
        const c = countEntries(before ? JSON.parse(before) : {}, JSON.parse(readFileSync(f, "utf8")));
        if (c && (c.added || c.changed || c.removed)) what += `: ${countWords(c)}`;
      } catch {}
    } else if (!existsSync(f)) what += ": gone";
    told.push(what);
  }
  const lines = [told.length ? `${told.join(". ")}.` : ""];
  if (derived.size) lines.push(`Rebuilt: ${and([...derived])}.`);
  // (why: wow-data's commits since the one the last data commit names)
  const last = git(["log", "-1", "--format=%B", "--grep=^wow-data: "]).match(/wow-data: ([0-9a-f]{7,40})/)?.[1];
  if (last) {
    const why = git(["log", "--format=%s", `${last}..HEAD`, "--", "pins.json", "schema.sql", "src", "data"], ROOT)
      .split("\n")
      .filter(Boolean)
      .map(subject);
    if (why.length) lines.push(`From wow-data: ${and([...new Set(why)].slice(0, 4))}${why.length > 4 ? ", and more" : ""}.`);
  }
  return { title: `${name}'s game data updated`, body: lines.filter(Boolean).join("\n") };
}

export function describePins(): { title: string; body: string } {
  const before = JSON.parse(git(["show", "HEAD:pins.json"], ROOT) || "{}");
  const after = JSON.parse(readFileSync(path.join(ROOT, "pins.json"), "utf8"));
  const moved = Object.entries(after.builds ?? {})
    .map(([game, b]) => [game, (before.builds?.[game] as { build?: string } | undefined)?.build, (b as { build: string }).build] as const)
    .filter(([, a, b]) => a !== b)
    .map(([game, a, b]) => `${game === "forever" ? "Forever" : game === "classic" ? "Classic Era" : game}: ${a ?? "none"} to ${b}`);
  return { title: "The game's builds moved", body: moved.length ? `${moved.join(". ")}.` : "" };
}

if (import.meta.main) {
  const [first, ...rest] = process.argv.slice(2);
  if (first === "--pins") console.log(JSON.stringify(describePins()));
  else if (first === "--failed")
    console.log(JSON.stringify({ title: `${ADDON_NAMES[rest[0]] ?? rest[0]}'s data job failed`, body: rest.slice(1).join(" ") || "It stopped on an error. The run says where." }));
  else if (first) console.log(JSON.stringify(describeAddon(first, rest.length ? rest : ["."])));
  else {
    console.error("usage: describe-data.ts <repo> PATHSPEC... | --pins");
    process.exit(2);
  }
}
