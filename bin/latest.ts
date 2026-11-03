// Have the game's builds moved past the pins (pins.json)? For
// .github/workflows/pins.yml, and by hand:
//   bun bin/latest.ts                  says what is newer
//   bun bin/latest.ts --write          and moves the builds' pins
//   bun bin/latest.ts --next FILE      writes the moved pins there instead
//   ... --summary FILE                 writes what it found, in Markdown
//   bun bin/latest.ts --json           the same as data (builds, databases, ui), for the control
//                                      centre; the Markdown stays what launch night reads
// A pinned build moves to the newest of its product with the same major
// version (wago.tools filed Forever's beta, 1.60, under the same product as
// Mists of Pandaria's, 5.5, until Forever's own, wowf, pinned since 23
// October 2026). A game's builds under another product are told, never
// followed: changing a product is a person's call. The community databases'
// newer commits are told too, never followed (their data changes what the
// addons say: a person reads it).
import { readFileSync, writeFileSync } from "node:fs";
import { fetchRetry } from "../src/fetch";
import { buildLines, buildRows, type Head, type Latest, type RepoRow, repoLine, repoRow } from "../src/latest";
import { PINS_FILE as PINS } from "../src/pins";
import { UI_PINS_FILE as UI } from "../src/ui";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const JSON_OUT = args.includes("--json");
const summaryAt = args.indexOf("--summary");
const SUMMARY = summaryAt >= 0 ? args[summaryAt + 1] : undefined;
const nextAt = args.indexOf("--next");
const NEXT = nextAt >= 0 ? args[nextAt + 1] : undefined;

type Pin = { product: string; build: string };
type Pins = { builds: Record<string, Pin>; repos: Record<string, { repo: string; commit: string; branch?: string; build?: string }> };
const pins: Pins = JSON.parse(readFileSync(PINS, "utf8"));
const uiPins: Pins["repos"] = JSON.parse(readFileSync(UI, "utf8")).repos;

const res = await fetchRetry("https://wago.tools/api/builds");
if (!res.ok) throw new Error(`wago.tools builds: ${res.status}`);
const builds: Record<string, { version: string }[]> = await res.json();

const rows = buildRows(pins.builds, builds);
const moved = rows.some((r) => r.moved);
if (WRITE || NEXT) for (const r of rows) pins.builds[r.game].build = r.latest;
const lines = buildLines(rows);

// the community databases: newer commits on their default branch
const token = process.env.GITHUB_TOKEN;
const repoRows: RepoRow[] = [];
for (const [name, r] of Object.entries({ ...pins.repos, ...uiPins })) {
  const res = await fetchRetry(`https://api.github.com/repos/${r.repo}/commits?per_page=1${r.branch ? `&sha=${r.branch}` : ""}`, {
    headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  let head: Head;
  if (!res.ok) head = { status: res.status };
  else {
    const [c] = (await res.json()) as { sha: string; commit: { message: string; committer: { date: string } } }[];
    head = c && { sha: c.sha, message: c.commit.message, date: c.commit.committer.date };
  }
  repoRows.push(repoRow(name, r, head, pins.builds[name.replace(/^ui-/, "")]?.build));
}
const repoLines = repoRows.filter((r) => r.kind === "database").map(repoLine);
const uiLines = repoRows.filter((r) => r.kind === "ui").map(repoLine);

if (moved && (WRITE || NEXT)) writeFileSync(NEXT ?? PINS, JSON.stringify(pins, null, 2) + "\n");
const text = [
  "### The game's builds",
  "",
  ...lines,
  "",
  "### The community databases",
  "",
  "The world (quests, creatures, objects) comes from these, not from the client's tables.",
  "",
  ...repoLines,
  "",
  "### The game's UI source (what ui.ts reads)",
  "",
  "Blizzard's frames and the texture pictures, from Gethe's mirrors. It says what the source has, never what the live client does.",
  "",
  ...uiLines,
  "",
].join("\n");
const data: Latest = { at: new Date().toISOString(), builds: rows, databases: repoRows.filter((r) => r.kind === "database"), ui: repoRows.filter((r) => r.kind === "ui"), moved };
console.log(JSON_OUT ? JSON.stringify(data, null, 2) : text);
if (SUMMARY) writeFileSync(SUMMARY, text);
// (for the workflow: whether a pin moved)
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `moved=${moved}\n`, { flag: "a" });
