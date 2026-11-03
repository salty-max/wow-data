// What bin/latest.ts finds, as data: the game's builds against the pins, the
// community databases and the UI source against their pinned commits. The
// Markdown it prints and the JSON it gives (`--json`) are both made from
// these rows, so they cannot disagree.
import { family, newer, newest } from "./builds";

export type Pin = { product: string; build: string };
export type RepoPin = { repo: string; commit: string; branch?: string; build?: string };

export type BuildRow = {
  game: string;
  product: string;
  pinned: string;
  latest: string;
  moved: boolean;
  /** The same game's builds under another product: told, never followed. */
  alsoUnder: { product: string; build: string }[];
};

/** Each pinned game's newest build of its product (same major version), and its builds under another product. */
export function buildRows(pins: Record<string, Pin>, builds: Record<string, { version: string }[]>): BuildRow[] {
  return Object.entries(pins).map(([game, pin]) => {
    const latest = newest((builds[pin.product] ?? []).map((b) => b.version), pin.build);
    const alsoUnder: BuildRow["alsoUnder"] = [];
    for (const [product, list] of Object.entries(builds)) {
      if (product === pin.product) continue;
      const there = list.map((b) => b.version).filter((v) => family(v) === family(pin.build) && newer(v, pin.build));
      if (there.length) alsoUnder.push({ product, build: there.reduce((a, v) => (newer(v, a) ? v : a)) });
    }
    return { game, product: pin.product, pinned: pin.build, latest, moved: latest !== pin.build, alsoUnder };
  });
}

export function buildLines(rows: BuildRow[]): string[] {
  return rows.flatMap((r) => [
    r.moved ? `- ${r.game}: ${r.product} ${r.pinned} → **${r.latest}**` : `- ${r.game}: ${r.product} ${r.pinned}, the latest`,
    ...r.alsoUnder.map((a) => `  - also under ${a.product}: ${a.build} (not followed: a product changes by hand, in pins.json)`),
  ]);
}

/** A repository's head commit as the GitHub API gives it, or the status it answered instead. */
export type Head = { sha: string; message: string; date: string } | { status: number } | undefined;

export type RepoRow = {
  name: string;
  repo: string;
  branch?: string;
  /** The pinned commit, and (for the UI source) the build the source carries. */
  commit: string;
  build?: string;
  kind: "database" | "ui";
  /** Not asked: the API's status. Check it first: such a row says nothing of `moved`. */
  error?: number;
  moved?: boolean;
  /** The newest commit, where one came back. */
  head?: { sha: string; date: string; build?: string };
  /** UI source only: the client's pinned build, and where the source's build stands against it. */
  client?: string;
  against?: "behind" | "ahead";
};

const tip = (v: string) => Number(v.split(".").pop());

export function repoRow(name: string, r: RepoPin, head: Head, clientBuild?: string): RepoRow {
  const kind = name.startsWith("ui-") ? "ui" : "database";
  const row: RepoRow = { name, repo: r.repo, branch: r.branch, commit: r.commit, build: r.build, kind };
  if (head && "status" in head) return { ...row, error: head.status };
  row.moved = false;
  if (head) {
    row.moved = !head.sha.startsWith(r.commit.slice(0, 12));
    row.head = { sha: head.sha, date: head.date.slice(0, 10), ...(kind === "ui" && { build: head.message.match(/\((\d+)\)/)?.[1] }) };
  }
  if (kind === "ui" && clientBuild && r.build && tip(clientBuild) !== tip(r.build)) {
    row.client = clientBuild;
    row.against = tip(r.build) < tip(clientBuild) ? "behind" : "ahead";
  }
  return row;
}

export function repoLine(r: RepoRow): string {
  if (r.error !== undefined) return `- ${r.name} (${r.repo}): could not ask (${r.error})`;
  if (r.kind === "database")
    return r.moved && r.head
      ? `- ${r.name} (${r.repo}): newer commits, ${r.head.sha.slice(0, 12)} of ${r.head.date} (pinned ${r.commit.slice(0, 12)}; not followed: bump it by hand and read the audit)`
      : `- ${r.name} (${r.repo}): the pinned commit is the latest`;
  let line =
    r.moved && r.head
      ? `- ${r.name} (${r.repo}@${r.branch}): newer commit ${r.head.sha.slice(0, 12)} of ${r.head.date}${r.head.build ? ` (build ${r.head.build})` : ""}, pinned ${r.commit.slice(0, 12)} (build ${r.build}; not followed: bump it by hand)`
      : `- ${r.name} (${r.repo}@${r.branch}): the pinned commit is the latest (build ${r.build})`;
  if (r.client) line += `; **client pinned ${r.client}, this source carries ${r.build}: ${r.against === "behind" ? "behind the client" : "ahead of the client"}**`;
  return line;
}

export type Latest = { at: string; builds: BuildRow[]; databases: RepoRow[]; ui: RepoRow[]; moved: boolean };
