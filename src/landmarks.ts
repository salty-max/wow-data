import type { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, type Game } from "./pins";

type Landmark = {
  id: string;
  games: Game[];
  uiMap: number;
  x: number;
  y: number;
  observedAt: string;
  evidence: string;
  source?: "owner-report" | "client-map";
};

// owner-report: the owner's own eyes in the game. client-map: a placement
// in the pinned client's map files (bin/placements.ts), its file, model and
// unique id in the evidence.
// A client-map landmark is frozen hand data: the build it was read in is in
// its evidence, never the pin of the day.
const SOURCES = {
  "owner-report": ["data/landmarks.json (reviewed)", null, "Owner supplied observations"],
  "client-map": ["data/landmarks.json (frozen: the build each evidence names)", "https://wago.tools", "Blizzard's"],
} as const;

/** Explicitly reviewed scenery, kept apart from automatic NPC sightings.
 * A map position names a place. It does not invent a creature or object ID. */
export function loadLandmarks(
  db: Database,
  game: Game,
  records: Landmark[] = JSON.parse(readFileSync(path.join(ROOT, "data/landmarks.json"), "utf8")),
) {
  if (!Array.isArray(records)) throw new Error("landmarks: expected a list");
  const seen = new Set<string>();
  for (const r of records) {
    if (!r || typeof r.id !== "string" || !/^[a-z][a-z0-9-]+$/.test(r.id) || seen.has(r.id)
      || !Array.isArray(r.games) || !r.games.length || new Set(r.games).size !== r.games.length
      || r.games.some(g => g !== "classic" && g !== "forever")
      || !Number.isSafeInteger(r.uiMap) || r.uiMap <= 0
      || ![r.x, r.y].every(n => Number.isFinite(n) && n >= 0 && n <= 100)
      || typeof r.observedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.observedAt)
      || typeof r.evidence !== "string" || !r.evidence.trim()
      || (r.source !== undefined && !Object.hasOwn(SOURCES, r.source)))
      throw new Error(`landmarks: invalid or duplicate record ${r?.id}`);
    seen.add(r.id);
  }
  const selected = records.filter(r => r.games.includes(game));
  for (const r of selected)
    if (!db.query("SELECT 1 FROM client_UiMap WHERE ID = ?").get(r.uiMap))
      throw new Error(`landmark ${r.id}: no ${game} map ${r.uiMap}`);
  db.transaction(() => {
    const source = db.prepare("INSERT OR IGNORE INTO source VALUES (?, ?, ?, ?)");
    const insert = db.prepare("INSERT INTO landmark VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const r of selected) {
      const s = r.source ?? "owner-report";
      source.run(s, ...SOURCES[s]);
      insert.run(r.id, r.uiMap, r.x, r.y, r.observedAt, r.evidence, s);
    }
  })();
}
