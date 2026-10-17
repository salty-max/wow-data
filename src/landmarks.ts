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
};

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
      || typeof r.evidence !== "string" || !r.evidence.trim())
      throw new Error(`landmarks: invalid or duplicate record ${r?.id}`);
    seen.add(r.id);
  }
  const selected = records.filter(r => r.games.includes(game));
  for (const r of selected)
    if (!db.query("SELECT 1 FROM client_UiMap WHERE ID = ?").get(r.uiMap))
      throw new Error(`landmark ${r.id}: no ${game} map ${r.uiMap}`);
  db.transaction(() => {
    if (selected.length)
      db.query("INSERT OR IGNORE INTO source VALUES ('owner-report', 'data/landmarks.json (reviewed)', NULL, 'Owner supplied observations')").run();
    const insert = db.prepare("INSERT INTO landmark VALUES (?, ?, ?, ?, ?, ?, 'owner-report')");
    for (const r of selected) insert.run(r.id, r.uiMap, r.x, r.y, r.observedAt, r.evidence);
  })();
}
