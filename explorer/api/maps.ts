// Where things stand, drawn on a zone's map. Questie's points are already a
// zone map's percent (its area's map); the Classic database's are the world's
// coordinates, placed on the smallest zone map holding them, the client's
// own way (UiMapAssignment's regions, as C_Map.GetMapPosFromWorldPos).
import type { Database } from "bun:sqlite";
import type { Row } from "./db";
import type { Namer, Ref } from "./names";

type Region = {
  ui: number;
  type: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  size: number;
};
export type Point = { x: number; y: number; source: string; spawn?: number };
export type Path = { source: string; label: string; points: [number, number][] };
export type MapGroup = { ref: Ref; points: Point[]; paths: Path[] };

const regions = new WeakMap<Database, Map<number, Region[]>>();
const painted = new WeakMap<Database, Map<number, [number, number, number, number][]>>();

// a map's explored areas (WorldMapOverlay), as percent rectangles: where the
// zone itself is drawn, not its neighbours' land inside its frame
function overlaysOf(d: Database, ui: number): [number, number, number, number][] {
  let byUi = painted.get(d);
  if (!byUi) {
    byUi = new Map();
    painted.set(d, byUi);
    const has = d.query("SELECT 1 FROM sqlite_master WHERE name = 'client_UiMapXMapArt'").get();
    if (has)
      for (const r of d
        .query(
          `SELECT x.UiMapID AS ui, o.OffsetX, o.OffsetY, o.TextureWidth, o.TextureHeight, l.LayerWidth, l.LayerHeight
           FROM client_UiMapXMapArt x JOIN client_UiMapArt a ON a.ID = x.UiMapArtID
           JOIN client_UiMapArtStyleLayer l ON l.UiMapArtStyleID = a.UiMapArtStyleID AND l.LayerIndex = 0
           JOIN client_WorldMapOverlay o ON o.UiMapArtID = x.UiMapArtID`,
        )
        .all() as Row[]) {
        const list = byUi.get(r.ui) ?? [];
        list.push([(r.OffsetX / r.LayerWidth) * 100, (r.OffsetY / r.LayerHeight) * 100, ((r.OffsetX + r.TextureWidth) / r.LayerWidth) * 100, ((r.OffsetY + r.TextureHeight) / r.LayerHeight) * 100]);
        byUi.set(r.ui, list);
      }
  }
  return byUi.get(ui) ?? [];
}
const areaMaps = new WeakMap<Database, Map<number, number | null>>();

// a world map's zone regions (zones and dungeons: no continents, no caves)
function regionsOf(d: Database, mapId: number): Region[] {
  let byMap = regions.get(d);
  if (!byMap) regions.set(d, (byMap = new Map()));
  let list = byMap.get(mapId);
  if (!list) {
    const rows = d
      .query(
        `SELECT a.*, u.Type AS type FROM client_UiMapAssignment a JOIN client_UiMap u ON u.ID = a.UiMapID
         WHERE a.MapID = ? AND u.Type IN (3, 4) AND a.WMOGroupID = 0`,
      )
      .all(mapId) as Row[];
    list = rows.map((r) => ({
      ui: r.UiMapID,
      type: r.type,
      minX: r.Region_0,
      minY: r.Region_1,
      maxX: r.Region_3,
      maxY: r.Region_4,
      u0: r.UiMin_0,
      v0: r.UiMin_1,
      u1: r.UiMax_0,
      v1: r.UiMax_1,
      size: (r.Region_3 - r.Region_0) * (r.Region_4 - r.Region_1),
    }));
    list.sort((a, b) => a.size - b.size);
    byMap.set(mapId, list);
  }
  return list;
}

// a world point on its zone's map: { ui map, percent }. The zones' frames
// overlap (Hogger's camp is inside Duskwood's, Barrens herbs inside
// Durotar's): a map whose explored areas cover the point wins, then one the
// thing is known on (Questie's zones for it), then the smallest.
export function worldToMap(d: Database, mapId: number, x: number, y: number, known?: Set<number>): { ui: number; x: number; y: number } | null {
  const holding = regionsOf(d, mapId)
    .filter((r) => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY)
    .map((r) => {
      const u = (r.u0 + ((r.maxY - y) / (r.maxY - r.minY)) * (r.u1 - r.u0)) * 100;
      const v = (r.v0 + ((r.maxX - x) / (r.maxX - r.minX)) * (r.v1 - r.v0)) * 100;
      const drawn = overlaysOf(d, r.ui).some(([x0, y0, x1, y1]) => u >= x0 && u <= x1 && v >= y0 && v <= y1);
      return { ui: r.ui, x: round(u), y: round(v), score: (drawn ? 2 : 0) + (known?.has(r.ui) ? 1 : 0) };
    });
  if (!holding.length) return null;
  const best = holding.reduce((a, b) => (b.score > a.score ? b : a));
  return { ui: best.ui, x: best.x, y: best.y };
}

// an area's own map (its zone's), when the client assigns one
export function areaMap(d: Database, areaId: number): number | null {
  let byArea = areaMaps.get(d);
  if (!byArea) areaMaps.set(d, (byArea = new Map()));
  if (!byArea.has(areaId)) {
    const r = d
      .query(
        `SELECT a.UiMapID AS ui FROM client_UiMapAssignment a JOIN client_UiMap u ON u.ID = a.UiMapID
         WHERE a.AreaID = ? AND u.Type IN (3, 4) ORDER BY a.OrderIndex LIMIT 1`,
      )
      .get(areaId) as Row | null;
    byArea.set(areaId, r?.ui ?? null);
  }
  return byArea.get(areaId) ?? null;
}

const round = (n: number) => Math.round(n * 100) / 100;

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
