// Reading players' facts as strangers' data: what a line adds (the lines a
// diff of data/players adds), what is wrong with it (shape, bounds, links,
// the game's escape codes, markup, a line that gives orders), what it is
// against the database (known, fills, new, differs, far), and what a daily
// job does with it (review, below). One place for the job (bin/players-review.ts)
// and for a person's reading (addon-kit/data-prs.ts facts), so they never differ.
import type { Database } from "bun:sqlite";

export type Line = [kind: string, entity: string, field: string, value: string, build: string | null, who: string[]];
export type Verdict = "known" | "fills" | "new" | "differs" | "far" | "flag";
export type Judged = { game: string; locale: string; line: Line; verdict: Verdict; why: string; more?: boolean };

const KINDS = new Set(["npc", "quest", "loot", "say", "gossip"]);
const RANKS = new Set(["normal", "trivial", "minus", "elite", "rareelite", "worldboss", "rare"]);
const QUEST_TEXTS = new Set(["details", "objectives", "request", "reward"]);
const FAR = 15; // (percent of a zone's map: a sighting is where the player stood, not the creature)

/** The facts a diff of data/players adds, file by file; a line whose key a removed line shares is one more player of a known fact. */
export function addedFacts(diff: string): { game: string; locale: string; line: unknown; raw: string; more: boolean }[] {
  const out: { game: string; locale: string; line: unknown; raw: string; more: boolean }[] = [];
  let file: { game: string; locale: string } | undefined;
  let removed = new Set<string>();
  const added: { game: string; locale: string; line: unknown; raw: string }[] = [];
  const flush = () => {
    for (const a of added) out.push({ ...a, more: Array.isArray(a.line) && removed.has(key(a.line as unknown[])) });
    added.length = 0;
    removed = new Set();
  };
  for (const text of diff.split("\n")) {
    const head = text.match(/^\+\+\+ b\/data\/players\/([^/]+)\/([a-z]{2}[A-Z]{2})\.json$/);
    if (text.startsWith("diff --git")) {
      flush();
      file = undefined;
    }
    if (head) file = { game: head[1], locale: head[2] };
    if (!file || text.startsWith("+++") || text.startsWith("---")) continue;
    const body = text.slice(1).replace(/,$/, "");
    if (!body.startsWith("[")) continue;
    let line: unknown;
    try {
      line = JSON.parse(body);
    } catch {
      line = undefined;
    }
    if (text.startsWith("-") && Array.isArray(line)) removed.add(key(line));
    else if (text.startsWith("+")) added.push({ ...file, line, raw: body });
  }
  flush();
  return out;
}
const key = (l: unknown[]) => l.slice(0, 4).map(String).join("\u0000");

/** What a shape or a text alone says is wrong, else nothing. */
export function shapeProblem(line: unknown): string | undefined {
  if (!Array.isArray(line) || line.length !== 6) return "not a fact's shape (6 fields)";
  const [kind, entity, field, value, build, who] = line;
  if (typeof kind !== "string" || !KINDS.has(kind)) return `kind ${JSON.stringify(kind)} the build doesn't know`;
  if (typeof entity !== "string" || !(kind === "loot" ? /^(npc|object):\d{1,8}$/ : /^\d{1,8}$/).test(entity)) return `entity ${JSON.stringify(entity)}`;
  if (typeof field !== "string" || !/^[a-zA-Z]{1,20}$/.test(field)) return `field ${JSON.stringify(field)}`;
  if (typeof value !== "string") return "value not a string";
  if (build !== null && (typeof build !== "string" || !/^\d{4,6}$/.test(build))) return `build ${JSON.stringify(build)}`;
  if (!Array.isArray(who) || who.length < 1 || who.length > 20 || !who.every((w) => typeof w === "string" && /^[0-9a-f]{8}$/.test(w)))
    return "who: not 1 to 20 hashes";
  if (field === "name" && value.length > 100) return `${value.length} characters for a name`;
  return textProblem(value) ?? orderProblem(value);
}

// Hidden characters: control characters but the line feed and the carriage
// return (the build turns those into $B, gameText), the invisible format
// characters (zero-width, direction, soft hyphen, tag characters, variation
// selectors), the line and paragraph separators, the Hangul fillers.
const HIDDEN = /[\p{Cc}\p{Cf}\u2028\u2029\ufe00-\ufe0f\u115f\u1160\u3164\uffa0]/u;
const NOT_HIDDEN = /[\n\r]/g;
const LINK = /https?:|ftp:|\bwww\.[a-z0-9]|discord\.(?:gg|com)|discordapp|(?:^|[^.\s])[a-z0-9]\.(?:com|net|org|gg|io|tv|xyz|ru|gl|ly|link|info|biz)\b/i;
// Real tags only. The game's inline emotes (<He takes a few breaths...>, <cough>,
// <Name>) are its own text and pass; a tag name from HTML closing its bracket,
// a closing tag, a tag with an attribute, a comment or a declaration are markup.
const TAGS = "script|iframe|img|a|b|i|u|p|em|strong|div|span|style|svg|html|body|head|title|link|meta|object|embed|applet|form|input|button|textarea|select|option|br|hr|h[1-6]|table|tr|td|th|ul|ol|li|font|center|base|video|audio|source|math|details|template|noscript|frame|frameset|marquee|canvas|map|area|param";
const MARKUP = new RegExp(`<\\/?(?:${TAGS})(?:\\s[^<>]*=[^<>]*)?\\s*\\/?>|<\\/[a-z][^<>]*>|<[a-z][a-z0-9-]*\\s[^<>]*=[^<>]*>|<[!?]`, "i");
// Code, a shell, an addon's or a database's calls: not a thing the game says.
const SCRIPT = /\bjavascript:|\bon[a-z]+\s*=\s*["']?|\beval\(|\bfunction ?\(|^\s*import\s+[\w{*]+(?:\s*,\s*\{[^}]*\})?\s+from\b|\brequire\(|`{3}|\{\{|\}\}|\$\{|\$\(|\bselect\s+\*\s+from\b|\bunion\s+select\b|\bdrop\s+table\b|\brm\s+-|\b(?:curl|wget)\s+-|\bsudo\s+\w|\bpowershell\s+-|\b(?:RunScript|loadstring|SendChatMessage|CreateFrame)\b|&[a-z]{2,8};|&#\d+;/im;

/** Text a reader might be meant to read (a link, markup, code, the game's escape codes), hidden characters, or a wall. */
export function textProblem(value: string): string | undefined {
  if (value.length > 4000) return `${value.length} characters`;
  if (HIDDEN.test(value.replace(NOT_HIDDEN, ""))) return "hidden or control characters";
  // (read as a person or a tool reads it: fullwidth letters and the ideographic full stop folded)
  const v = value.normalize("NFKC").replace(/[\u3002\uff0e\uff61]/g, ".");
  if (LINK.test(v)) return "a link";
  if (/\|[cHhTtKAr]/.test(v)) return "the game's escape codes (|c, |H, |T...)";
  if (MARKUP.test(v)) return "markup";
  if (SCRIPT.test(v)) return "script-like text";
  return undefined;
}

// A heuristic, not a proof: a stranger's line that talks to whoever reads it
// (a person at review, or a tool) and not to the player. It catches the
// phrasings below and nothing more. The game's own orders ("Bring me ten
// boar ribs", "You must slay them") are quest text and pass. What it
// can't catch is what the second player and the person reading the pull
// request's report are for.
const ORDERS: [RegExp, string][] = [
  [/\b(?:ignore|disregard|forget|override)\b[^.]{0,40}\b(?:previous|prior|above|earlier|all|any|your|these|the)\b[^.]{0,30}\b(?:instructions?|rules?|prompts?|guidelines?|checks?)\b/i, "tells a reader to ignore its instructions"],
  [/\b(?:system prompt|as an ai\b|language model|chatgpt|openai|anthropic|assistant:|prompt injection)/i, "speaks to an AI"],
  [/\b(?:approve|merge|lgtm)\b[^.]{0,20}\b(?:this|it|the pull request|the pr)\b/i, "asks for an approval or a merge"],
  [/\b(?:pull request|reviewer|maintainer|workflow|api key|github)\b/i, "talks of the review or the repository"],
  [/(?:^|\s)\/(?:run|script|console|dump|rl|reload|logout|quit|camp|use|equip)\b/i, "gives a slash command"],
  [/\b(?:please|now|immediately|you (?:must|should|need to|have to))\s+(?:run|execute|download|install|paste|delete|disable|reveal|send|visit|open|subscribe|ignore|approve|merge|copy)\b[^.]{0,40}\b(?:this|the|our|my|your|a)\s+(?:code|script|addon|add-on|file|link|site|website|server|channel|command|macro|key|token)/i, "orders a reader to run, get or visit something"],
  [/\b(?:join|visit|check out|follow|subscribe to)\b[^.]{0,20}\b(?:our|my)\s+(?:server|channel|guild|community|site|website|stream|youtube|twitch|patreon|store|shop)/i, "advertises"],
  [/\b(?:do not|don't|never)\s+(?:tell|mention|reveal|show|report|flag)\b[^.]{0,30}\b(?:user|human|owner|reviewer|maintainer|moderator)\b/i, "asks for silence"],
];

/** A line that speaks to a reader as an order (a heuristic list, ORDERS), else nothing. */
export function orderProblem(value: string): string | undefined {
  const v = value.normalize("NFKC");
  const hit = ORDERS.find(([re]) => re.test(v));
  return hit ? `speaks to a reader: ${hit[1]}` : undefined;
}

/** The database's side of a fact, as `judge` asks it (a fake in the tests). */
export interface Facts {
  creature(id: number): { min_level: number | null; max_level: number | null; rank: number | null; type_id: number | null; family_id: number | null } | undefined;
  object(id: number): boolean;
  quest(id: number): boolean;
  item(id: number): boolean;
  name(kind: string, id: number, locale: string): string | undefined;
  questText(id: number, locale: string, field: string): string | undefined;
  relations(id: number, role: "start" | "end"): string[]; // "npc:123", "object:4"
  line(npc: number, locale: string, kind: string, text: string): "same" | "variant" | undefined; // (the build's row is the exact text: a variant is a row more)
  looted(kind: "creature" | "object", id: number): boolean;
  spots(npc: number, uiMap: number): [number, number][]; // the creature's spawns on that map, in its percent
}

const RANK_OF: Record<string, number> = { normal: 0, trivial: 0, minus: 0, elite: 1, rareelite: 2, worldboss: 3, rare: 4 };
const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
// (a text as the game wrote it: $B a new line, $N/$C/$R the reader's name, class
// and race, $g male:female; the reader's word in a player's copy, a mark of the
// collector's ($C{Hunter}), or the token itself)
const TOKEN = "\u0001";
const flat = (s: string) =>
  s
    .replace(/\$[bB]/g, " ")
    .replace(/\$[gG][^;$]*;/g, TOKEN)
    .replace(/\$[nNcCrR](\{[^}]*\})?/g, TOKEN)
    .replace(/[^\p{L}\p{N}\u0001]+/gu, " ")
    .trim()
    .toLowerCase();
export function sameText(player: string, db: string): boolean {
  if (same(player, db)) return true;
  const theirs = flat(player);
  const pattern = flat(db)
    .split(TOKEN)
    .map((p) => p.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".{0,40}?");
  return new RegExp(`^${pattern}$`, "u").test(theirs);
}
const short = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s).replace(/\n/g, "⏎");

function position(value: string): [number, number, number] | undefined {
  try {
    const p = JSON.parse(value);
    if (Array.isArray(p) && p.length === 3 && Number.isInteger(p[0]) && p[0] >= 1 && p[0] <= 100_000 && [p[1], p[2]].every((n) => typeof n === "number" && n >= 0 && n <= 100))
      return p as [number, number, number];
  } catch {}
  return undefined;
}

/** One added fact against the database. */
export function judge(game: string, locale: string, raw: unknown, db: Facts): Judged {
  const problem = shapeProblem(raw);
  const line = (Array.isArray(raw) ? raw : ["?", "?", "?", "?", null, []]) as Line;
  const out = (verdict: Verdict, why: string): Judged => ({ game, locale, line, verdict, why });
  if (problem) return out("flag", problem);
  const [kind, entity, field, value] = line;
  if (kind === "loot") {
    const [what, sid] = entity.split(":");
    const id = Number(sid);
    if (!/^\d+$/.test(value)) return out("flag", `item ${JSON.stringify(value)}`);
    if (!db.item(Number(value))) return out("new", `item ${value} no source has`);
    const has = what === "npc" ? !!db.creature(id) : db.object(id);
    if (!has) return out("new", `${what} ${id} no source has`);
    return db.looted(what === "npc" ? "creature" : "object", id) ? out("known", "its loot known already (the build keeps it)") : out("fills", "loot no source gives");
  }
  const id = Number(entity);
  if (kind === "say" || kind === "gossip") {
    if (!db.creature(id)) return out("new", `creature ${id} no source has`);
    const have = db.line(id, locale, kind === "gossip" ? "gossip" : field, value);
    return have === "same" ? out("known", "the same line") : out("fills", `${have === "variant" ? "a variant of a known line" : "a line"}: ${short(value)}`);
  }
  if (kind === "quest") {
    if (!db.quest(id)) return out("new", `quest ${id} no source has${field === "title" ? `: ${short(value)}` : ""}`);
    if (field === "title") {
      const have = db.name("quest", id, locale);
      return !have ? out("fills", `title ${short(value)}`) : same(have, value) ? out("known", "") : out("differs", `"${short(value)}", the database "${short(have)}"`);
    }
    if (QUEST_TEXTS.has(field)) {
      const have = db.questText(id, locale, field);
      return !have ? out("fills", `${field}: ${short(value)}`) : sameText(value, have) ? out("known", "") : out("differs", `${field} "${short(value)}", the database "${short(have)}"`);
    }
    if (field === "giver" || field === "ender") {
      const m = value.match(/^(npc|object):(\d+)$/);
      if (!m) return out("flag", `${field} ${JSON.stringify(value)}`);
      const known = m[1] === "npc" ? !!db.creature(Number(m[2])) : db.object(Number(m[2]));
      const have = db.relations(id, field === "giver" ? "start" : "end");
      if (have.includes(value)) return out("known", "");
      if (!known) return out("new", `${field} ${value} no source has`);
      return have.length ? out("differs", `${field} ${value}, the database ${have.join(", ")}`) : out("fills", `${field} ${value}`);
    }
    if (field === "where") return position(value) ? out("known", "where the player stood (not loaded)") : out("flag", `where ${value} out of bounds`);
    return out("known", `${field}: the build doesn't load it`);
  }
  // (npc)
  const c = db.creature(id);
  if (field === "where") {
    const p = position(value);
    if (!p) return out("flag", `where ${value} out of bounds`);
    if (!c) return out("new", `creature ${id} no source has, seen on map ${p[0]}`);
    const spots = db.spots(id, p[0]);
    if (!spots.length) return out("fills", `a sighting on map ${p[0]}, where no source puts it`);
    const near = Math.min(...spots.map(([x, y]) => Math.hypot(x - p[1], y - p[2])));
    return near > FAR ? out("far", `seen ${near.toFixed(0)}% of the map from its nearest spawn (a patrol, or where the player stood)`) : out("fills", "a sighting near its spawns (creature_sighting, never a spawn)");
  }
  if (!c) return out("new", `creature ${id} no source has${field === "name" ? `: ${short(value)}` : ""}`);
  if (field === "name") {
    const have = db.name("creature", id, locale);
    return !have ? out("fills", `name ${short(value)}`) : same(have, value) ? out("known", "") : out("differs", `"${short(value)}", the database "${short(have)}"`);
  }
  if (field === "level") {
    let r: unknown;
    try {
      r = JSON.parse(value);
    } catch {}
    if (!Array.isArray(r) || r.length !== 2 || !r.every((n) => Number.isInteger(n) && n >= 1 && n <= 100) || r[0] > r[1]) return out("flag", `level ${value}`);
    const [lo, hi] = r as [number, number];
    if (c.min_level === null || c.max_level === null) return out("fills", `level ${lo}-${hi}`);
    return lo >= c.min_level && hi <= c.max_level ? out("known", "") : out("differs", `level ${lo}-${hi}, the database ${c.min_level}-${c.max_level}`);
  }
  if (field === "rank") {
    if (!RANKS.has(value)) return out("flag", `rank ${JSON.stringify(value)}`);
    if (c.rank === null) return out("fills", `rank ${value}`);
    return RANK_OF[value] === c.rank ? out("known", "") : out("differs", `rank ${value}, the database ${c.rank}`);
  }
  if (field === "typeId" || field === "familyId") {
    if (!/^\d{1,4}$/.test(value)) return out("flag", `${field} ${JSON.stringify(value)}`);
    const have = field === "typeId" ? c.type_id : c.family_id;
    return have === null ? out("fills", `${field} ${value}`) : have === Number(value) ? out("known", "") : out("differs", `${field} ${value}, the database ${have}`);
  }
  return out("known", `${field}: ${short(value, 40)}`);
}

/** The database through `Facts`. */
export function factsOf(db: Database): Facts {
  const q = <T>(sql: string) => db.query<T, (string | number)[]>(sql);
  const creature = q<{ min_level: number | null; max_level: number | null; rank: number | null; type_id: number | null; family_id: number | null }>(
    "SELECT min_level, max_level, rank, type_id, family_id FROM creature WHERE id = ?",
  );
  const exists = (table: string) => q<{ 1: number }>(`SELECT 1 FROM ${table} WHERE id = ?`);
  const object = exists("object"),
    quest = exists("quest"),
    item = exists("item");
  const name = q<{ name: string }>("SELECT name FROM name WHERE kind = ? AND id = ? AND locale = ?");
  const text = q<{ text: string }>("SELECT text FROM quest_text WHERE quest_id = ? AND locale = ? AND field = ?");
  const rel = q<{ kind: string; entity_id: number }>("SELECT DISTINCT kind, entity_id FROM quest_relation WHERE quest_id = ? AND role = ?");
  const line = q<{ text: string }>("SELECT text FROM npc_line WHERE npc_id = ? AND locale = ? AND kind = ?");
  const looted = q<{ 1: number }>(
    "SELECT 1 FROM loot WHERE kind = ? AND source_id = coalesce((SELECT loot_id FROM creature WHERE ? = 'creature' AND id = ?), (SELECT loot_id FROM object WHERE ? = 'object' AND id = ?), ?)",
  );
  // (a spawn's percent is on its ui map, else on its zone's: the zones a ui map shows)
  const spots = q<{ ux: number; uy: number }>(
    `SELECT ux, uy FROM spawn WHERE kind = 'creature' AND entity_id = ? AND ux IS NOT NULL
       AND (ui_map_id = ? OR (ui_map_id IS NULL AND area_id IN (SELECT AreaID FROM client_UiMapAssignment WHERE UiMapID = ? AND AreaID > 0)))`,
  );
  return {
    creature: (id) => creature.get(id) ?? undefined,
    object: (id) => !!object.get(id),
    quest: (id) => !!quest.get(id),
    item: (id) => !!item.get(id),
    name: (kind, id, locale) => name.get(kind, id, locale)?.name,
    questText: (id, locale, field) => text.get(id, locale, field)?.text,
    relations: (id, role) => rel.all(id, role).map((r) => `${r.kind === "creature" ? "npc" : r.kind}:${r.entity_id}`),
    line: (npc, locale, kind, value) => {
      const texts = line.all(npc, locale, kind).map((l) => l.text);
      // (as the build writes it: players.ts's gameText)
      return texts.includes(value.replace(/\r?\n/g, "$B")) ? "same" : texts.some((t) => sameText(value, t)) ? "variant" : undefined;
    },
    looted: (kind, id) => !!looted.get(kind, kind, id, kind, id, id),
    spots: (npc, map) => spots.all(npc, map, map).map((s) => [s.ux, s.uy]),
  };
}


// ── what a daily job does with the day's facts ──────────────────────────────
//
// The files: data/players/<game>/<locale>.json are what the build loads;
// data/players/<game>/held/<locale>.json are text a single player saw, kept
// (so a second player's sighting of it finds it) and never loaded. A fact
// passes through four gates: the hard rejects (a line dropped, never merged),
// a new id in Classic Era (dropped: every id there is long known), the tier
// (mechanical facts go in, free text waits for TEXT_MIN_SEEN players), and
// the size ceiling (a pull request over it is left to a hand, its facts kept).

import { factProblem, TEXT_MIN_SEEN } from "./players";
export { TEXT_MIN_SEEN };

/** Most facts a pull request may add and still merge by itself: the history's largest is 447 (#19, 5 November 2026), #13 had 281. */
export const MAX_ADDED = 1500;
/** Most players a fact keeps (bin/players.ts's KEEP). */
export const KEEP_WHO = 20;

/** The fields the build knows, by kind. Anything else is a stranger's invention. */
const FIELDS: Record<string, RegExp> = {
  npc: /^(?:name|level|rank|reaction|typeId|familyId|type|family|where)$/,
  quest: /^(?:title|details|objectives|request|reward|giver|ender|where)$/,
  loot: /^item$/,
  say: /^(?:say|yell|emote|whisper)$/,
  gossip: /^text$/,
};

/** Whether a fact is mechanical (a number, an id, a name for an id) or the free text a player wrote or the game's long text. */
export function tierOf(kind: string, field: string): "mechanical" | "text" {
  if (kind === "say" || kind === "gossip") return "text";
  if (kind === "quest" && (field === "title" || QUEST_TEXTS.has(field))) return "text";
  return "mechanical";
}

/** What the day's pull request must not hold: a broken shape, a field the build doesn't know, a reaction that isn't one. */
export function fieldProblem(line: unknown): string | undefined {
  const bad = shapeProblem(line);
  if (bad) return bad;
  const [kind, entity, field, value] = line as Line;
  // (the build's own check, the one that would stop it: a level, a position, a rank, a giver)
  const unfit = factProblem(kind, entity, field, value);
  if (unfit) return unfit;
  if (!FIELDS[kind]?.test(field)) return `field ${kind}.${field} the build doesn't know`;
  if (kind === "npc" && field === "reaction" && !/^[1-8]$/.test(value)) return `reaction ${JSON.stringify(value)}`;
  if (kind === "quest" && field === "where" && !position(value)) return `where ${JSON.stringify(value.slice(0, 40))}`;
  if (kind === "npc" && (field === "type" || field === "family") && value.length > 100) return `${field} of ${value.length} characters`;
  return undefined;
}

export const keyOf = (l: Line) => `${l[0]}\u0000${l[1]}\u0000${l[2]}\u0000${l[3]}`;
const entityOrder = (s: string) => Number(s.replace(/^\D+/, ""));
/** The order a file keeps its lines in (bin/players.ts writes it, so a review changes only what it must). */
export const order = (a: Line, b: Line) =>
  a[0].localeCompare(b[0]) || entityOrder(a[1]) - entityOrder(b[1]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]) || (a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0);
export const serialize = (lines: Line[]) => `{"facts":[\n${[...lines].sort(order).map((l) => JSON.stringify(l)).join(",\n")}\n]}\n`;

/** Every file's lines, by "<game>/<locale>". */
export type Files = Map<string, Line[]>;
export type Tree = { loaded: Files; held: Files; odd: string[] };

/** A tree from the paths under data/players and a way to read one. */
export function treeOf(paths: string[], read: (path: string) => string): Tree {
  const tree: Tree = { loaded: new Map(), held: new Map(), odd: [] };
  for (const p of paths) {
    const m = p.match(/^data\/players\/([a-z]+)\/(?:(held)\/)?([a-z]{2}[A-Z]{2})\.json$/);
    if (!m) {
      tree.odd.push(p);
      continue;
    }
    let facts: unknown;
    try {
      facts = (JSON.parse(read(p)) as { facts?: unknown }).facts;
    } catch {}
    if (!Array.isArray(facts)) {
      tree.odd.push(`${p} (not { facts: [...] })`);
      continue;
    }
    (m[2] ? tree.held : tree.loaded).set(`${m[1]}/${m[3]}`, facts as Line[]);
  }
  return tree;
}

export type Rejected = { game: string; locale: string; line: Line; why: string };
export type Held = { game: string; locale: string; line: Line; players: number };
export type Outcome = {
  loaded: Files;
  held: Files;
  rejected: Rejected[];
  /** Text a single player saw, put in or kept in held/ this run. */
  holding: Held[];
  /** Text that reached TEXT_MIN_SEEN this run, now loaded. */
  promoted: Held[];
  /** Per game: what the lines are, for the report. */
  counts: Record<string, Record<string, number>>;
  /** Far sightings, new ids kept (Forever), differences: told, not stopped. */
  told: { far: number; newIds: number; differs: number };
  added: number;
  /** Why the pull request is left to a hand, else nothing. */
  stop?: string;
};

const inc = (counts: Record<string, Record<string, number>>, game: string, what: string, n = 1) => {
  counts[game] ??= {};
  counts[game][what] = (counts[game][what] ?? 0) + n;
};
const union = (a: string[], b: string[]) => [...new Set([...a, ...b])].slice(0, KEEP_WHO);

/**
 * The day's facts through the gates: `head` is the tree after the job's
 * merge from the inbox (or the pull request's branch), `base` main's. Pure:
 * the database comes in as `db(game)`, nothing is read or written here.
 */
export function review(base: Tree, head: Tree, db: (game: string) => Facts | undefined): Outcome {
  const out: Outcome = { loaded: new Map(), held: new Map(), rejected: [], holding: [], promoted: [], counts: {}, told: { far: 0, newIds: 0, differs: 0 }, added: 0 };
  const odd = [...head.odd, ...base.odd.filter((o) => !head.odd.includes(o))];
  if (odd.length) out.stop = `files under data/players the review doesn't take: ${odd.slice(0, 5).join(", ")}`;
  const files = new Set([...base.loaded.keys(), ...head.loaded.keys(), ...base.held.keys(), ...head.held.keys()]);
  for (const file of [...files].sort()) {
    const [game, locale] = file.split("/");
    const was = new Map((base.loaded.get(file) ?? []).map((l) => [keyOf(l), l]));
    const now = new Map((head.loaded.get(file) ?? []).map((l) => [keyOf(l), l]));
    const waiting = new Map((head.held.get(file) ?? base.held.get(file) ?? []).map((l) => [keyOf(l), l]));
    const loaded = new Map<string, Line>();
    for (const [key, line] of was) {
      if (!now.has(key)) out.stop ??= `${file}: the pull request removes a fact main holds`;
      loaded.set(key, line);
    }
    const facts = db(game);
    for (const [key, line] of now) {
      const had = was.get(key);
      if (had && JSON.stringify(had) === JSON.stringify(line)) continue;
      out.added++;
      const reject = (why: string) => {
        out.rejected.push({ game, locale, line, why });
        inc(out.counts, game, "rejected");
      };
      const problem = fieldProblem(line);
      if (problem) {
        reject(problem);
        continue;
      }
      if (!facts) {
        out.stop ??= `no ${game} database to read the facts against`;
        loaded.set(key, line);
        continue;
      }
      const judged = judge(game, locale, line, facts);
      if (judged.verdict === "flag") {
        reject(judged.why);
        continue;
      }
      if (judged.verdict === "new" && game === "classic") {
        reject(`a new id in Classic Era: ${judged.why}`);
        continue;
      }
      if (judged.verdict === "new") out.told.newIds++;
      if (judged.verdict === "far") out.told.far++;
      if (judged.verdict === "differs") out.told.differs++;
      if (tierOf(line[0], line[2]) === "mechanical" || had) {
        loaded.set(key, line);
        inc(out.counts, game, had ? "more players" : "mechanical");
        continue;
      }
      // (free text no one had before: it waits for a second player, whoever met it first)
      const mine = waiting.get(key);
      const merged: Line = [line[0], line[1], line[2], line[3], Number(line[4] ?? 0) >= Number(mine?.[4] ?? 0) ? line[4] : mine![4], union(mine?.[5] ?? [], line[5])];
      if (merged[5].length >= TEXT_MIN_SEEN) {
        loaded.set(key, merged);
        waiting.delete(key);
        out.promoted.push({ game, locale, line: merged, players: merged[5].length });
        inc(out.counts, game, "text with two players");
      } else {
        waiting.set(key, merged);
        out.holding.push({ game, locale, line: merged, players: merged[5].length });
        inc(out.counts, game, "text held");
      }
    }
    out.loaded.set(file, [...loaded.values()]);
    out.held.set(file, [...waiting.values()]);
  }
  if (out.added > MAX_ADDED) out.stop ??= `${out.added} lines added, over the ${MAX_ADDED} a pull request may bring and merge by itself`;
  return out;
}

// (a stranger's words quoted as code: no backticks, no invisible or direction characters)
const clip = (s: string, n = 80) => s.replace(/[`\r\n]+/g, " ").replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, "\ufffd").slice(0, n);
const reasonOf = (why: string) => why.split(":")[0].replace(/ "?\d.*$/, "");

/** The run's plain summary, Markdown: counts, what was dropped and why, what waits for a second player. */
export function summary(o: Outcome): string[] {
  const out: string[] = [];
  const total = (what: string) => Object.values(o.counts).reduce((n, c) => n + (c[what] ?? 0), 0);
  out.push(
    `Reviewed ${o.added} lines the day added: ${total("mechanical")} mechanical facts in, ${total("more players")} more players on facts main holds, ${o.promoted.length} texts in with ${TEXT_MIN_SEEN} players, ${o.holding.length} texts held for a second player, ${o.rejected.length} dropped.`,
  );
  if (o.told.newIds || o.told.far || o.told.differs)
    out.push(`Told: ${o.told.newIds} ids no source has (Forever's new content), ${o.told.far} sightings far from every known spawn (still sightings, never spawns), ${o.told.differs} facts that differ from the database (the database keeps its own).`);
  if (o.stop) out.push("", `**Left for a hand: ${o.stop}.**`);
  if (o.rejected.length) {
    const reasons = new Map<string, Rejected[]>();
    for (const r of o.rejected) reasons.set(reasonOf(r.why), [...(reasons.get(reasonOf(r.why)) ?? []), r]);
    out.push("", "Dropped (never merged, kept nowhere):");
    for (const [why, rs] of reasons) {
      out.push(`- ${rs.length} × ${why}`);
      for (const r of rs.slice(0, o.stop ? 200 : 3)) out.push(`  - ${r.game}/${r.locale} ${r.line[0]} ${r.line[1]} ${r.line[2]}: \`${clip(String(r.line[3]))}\``);
    }
  }
  if (o.holding.length || o.promoted.length) {
    out.push("", `Free text waits for ${TEXT_MIN_SEEN} players (data/players/<game>/held/, never loaded by the build):`);
    const by = new Map<string, number>();
    for (const h of o.holding) {
      const k = `${h.game}/${h.locale} ${h.line[0]}.${h.line[2]}, ${h.players} player${h.players === 1 ? "" : "s"}`;
      by.set(k, (by.get(k) ?? 0) + 1);
    }
    for (const [what, n] of by) out.push(`- held: ${n} × ${what}`);
    for (const p of o.promoted) out.push(`- in now: ${p.game}/${p.locale} ${p.line[0]} ${p.line[1]} ${p.line[2]} (${p.players} players)`);
  }
  return out;
}
