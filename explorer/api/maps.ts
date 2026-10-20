// Where things stand, drawn on a zone's map. Questie's points are already a
// zone map's percent (its area's map); the Classic database's are the world's
// coordinates, placed on the smallest zone map holding them (src/world.ts).
import type { Database } from "bun:sqlite";
import type { Row } from "./db";
import { areaMap, worldToMap } from "../../src/world";
import type { Namer, Ref } from "./names";

export type Point = { x: number; y: number; source: string; spawn?: number };
export type Path = { source: string; label: string; points: [number, number][] };
export type MapGroup = { ref: Ref; points: Point[]; paths: Path[] };

// a row's place: { key, ref, x, y } (a spawn's or a path point's)
function place(d: Database, names: Namer, r: Row, known: Set<number>): { key: string; ref: () => Ref; x: number; y: number } | null {
  if (r.ux != null && r.uy != null) {
    const ui = r.ui_map_id ?? (r.area_id != null ? areaMap(d, r.area_id) : null);
    if (ui != null) return { key: `ui:${ui}`, ref: () => names.ref("ui_map", ui), x: r.ux, y: r.uy };
    if (r.area_id != null) return { key: `area:${r.area_id}`, ref: () => names.ref("area", r.area_id), x: r.ux, y: r.uy };
  }
  if (r.map_id != null && r.x != null && r.y != null) {
    const p = worldToMap(d, r.map_id, r.x, r.y, known);
    if (p) return { key: `ui:${p.ui}`, ref: () => names.ref("ui_map", p.ui), x: p.x, y: p.y };
  }
  return null;
}

// a creature's or an object's spawns and paths, by map (the busiest first)
export function mapsOf(d: Database, names: Namer, kind: "creature" | "object", id: number): { maps: MapGroup[]; unplaced: number } {
  const groups = new Map<string, MapGroup>();
  const group = (key: string, ref: () => Ref) => {
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { ref: ref(), points: [], paths: [] }));
    return g;
  };
  let unplaced = 0;
  const spawns = d.query("SELECT * FROM spawn WHERE kind = ? AND entity_id = ?").all(kind, id) as Row[];
  const known = new Set<number>();
  for (const s of spawns) {
    const ui = s.ui_map_id ?? (s.area_id != null ? areaMap(d, s.area_id) : null);
    if (ui != null) known.add(ui);
  }
  for (const s of spawns) {
    const p = place(d, names, s, known);
    if (!p) {
      unplaced++;
      continue;
    }
    group(p.key, p.ref).points.push({ x: p.x, y: p.y, source: s.source, ...(s.spawn_id != null ? { spawn: s.spawn_id } : {}) });
  }
  if (kind === "creature") {
    const spawnIds = spawns.filter((s) => s.spawn_id != null).map((s) => s.spawn_id);
    const rows = [
      ...(d.query("SELECT * FROM path WHERE owner = 'creature' AND owner_id = ? ORDER BY path_id, point").all(id) as Row[]),
      ...(spawnIds.length
        ? (d
            .query(`SELECT * FROM path WHERE owner = 'spawn' AND owner_id IN (${spawnIds.map(() => "?").join(",")}) ORDER BY owner_id, path_id, point`)
            .all(...spawnIds) as Row[])
        : []),
    ];
    const paths = new Map<string, { key: string; ref: () => Ref; path: Path }>();
    for (const r of rows) {
      const p = place(d, names, r, known);
      if (!p) continue;
      const id = `${r.owner}:${r.owner_id}:${r.path_id}:${r.source}:${p.key}`;
      let entry = paths.get(id);
      if (!entry) {
        const label = r.owner === "spawn" ? `spawn ${r.owner_id}` : `path ${r.path_id}`;
        paths.set(id, (entry = { key: p.key, ref: p.ref, path: { source: r.source, label, points: [] } }));
      }
      entry.path.points.push([p.x, p.y]);
    }
    for (const { key, ref, path } of paths.values()) if (path.points.length > 1) group(key, ref).paths.push(path);
  }
  const maps = [...groups.values()].sort((a, b) => b.points.length - a.points.length);
  return { maps, unplaced };
}
