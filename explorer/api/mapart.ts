// A zone's map as the game draws it, every area explored: the client's own
// tiles for its UiMap (UiMapXMapArt, UiMapArt, its style's layer,
// UiMapArtTile's file ids) and the explored areas' overlays over them
// (WorldMapOverlay, WorldMapOverlayTile), fetched from wago.tools once,
// stitched into one PNG (.cache/explorer/maps/<game>/<ui map>.png). Forever's
// new zones too.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CACHE, cached } from "../../src/cache";
import { type Game, PINS } from "../../src/pins";
import { decodeBlp, encodePng } from "./blp";
import { db, type Row } from "./db";

const making = new Map<string, Promise<string | null>>();

export function hasArt(game: Game, uiMapId: number): boolean {
  const d = db(game);
  if (!d.query("SELECT 1 FROM sqlite_master WHERE name = 'client_UiMapXMapArt'").get()) return false;
  return !!d.query("SELECT 1 FROM client_UiMapXMapArt WHERE UiMapID = ?").get(uiMapId);
}

// the map's PNG (made the first time), or null when the client has no art for it
export function mapImage(game: Game, uiMapId: number): Promise<string | null> {
  const file = path.join(CACHE, "explorer", "maps", game, `${uiMapId}.png`);
  if (existsSync(file)) return Promise.resolve(file);
  const key = `${game}:${uiMapId}`;
  let p = making.get(key);
  if (!p) {
    p = make(game, uiMapId, file).finally(() => making.delete(key));
    making.set(key, p);
  }
  return p;
}

async function make(game: Game, uiMapId: number, file: string): Promise<string | null> {
  if (!hasArt(game, uiMapId)) return null;
  const d = db(game);
  const x = d.query("SELECT UiMapArtID FROM client_UiMapXMapArt WHERE UiMapID = ? ORDER BY PhaseID LIMIT 1").get(uiMapId) as Row;
  const art = d.query("SELECT UiMapArtStyleID FROM client_UiMapArt WHERE ID = ?").get(x.UiMapArtID) as Row | null;
  const layer = art && (d.query("SELECT * FROM client_UiMapArtStyleLayer WHERE UiMapArtStyleID = ? ORDER BY LayerIndex LIMIT 1").get(art.UiMapArtStyleID) as Row | null);
  if (!layer) return null;
  const tiles = d.query("SELECT * FROM client_UiMapArtTile WHERE UiMapArtID = ? AND LayerIndex = 0").all(x.UiMapArtID) as Row[];
  if (!tiles.length) return null;
  const W = layer.LayerWidth,
    H = layer.LayerHeight;
  const canvas = new Uint8Array(W * H * 4);
  const product = PINS.builds[game].product;
  const texture = async (fdid: number) =>
    decodeBlp(new Uint8Array(readFileSync(await cached(`https://wago.tools/api/casc/${fdid}?download&branch=${product}`, `wago/files/${fdid}.blp`))));
  // a texture drawn at (ox, oy), within (w, h) of it, its alpha blended
  const draw = (img: Awaited<ReturnType<typeof texture>>, ox: number, oy: number, w: number, h: number) => {
    for (let y = 0; y < Math.min(img.height, h) && oy + y < H; y++)
      for (let x = 0; x < Math.min(img.width, w) && ox + x < W; x++) {
        const s = (y * img.width + x) * 4,
          o = ((oy + y) * W + ox + x) * 4;
        const a = img.data[s + 3] / 255;
        for (let k = 0; k < 3; k++) canvas[o + k] = img.data[s + k] * a + canvas[o + k] * (1 - a);
        canvas[o + 3] = Math.max(canvas[o + 3], img.data[s + 3]);
      }
  };
  const base = await Promise.all(tiles.map((t) => texture(t.FileDataID)));
  tiles.forEach((t, i) => draw(base[i], t.ColIndex * layer.TileWidth, t.RowIndex * layer.TileHeight, layer.TileWidth, layer.TileHeight));
  const hasOverlays = d.query("SELECT 1 FROM sqlite_master WHERE name = 'client_WorldMapOverlayTile'").get();
  const overlays = hasOverlays ? (d.query("SELECT * FROM client_WorldMapOverlay WHERE UiMapArtID = ?").all(x.UiMapArtID) as Row[]) : [];
  for (const o of overlays) {
    const parts = d.query("SELECT * FROM client_WorldMapOverlayTile WHERE WorldMapOverlayID = ? AND LayerIndex = 0").all(o.ID) as Row[];
    const imgs = await Promise.all(parts.map((t) => texture(t.FileDataID)));
    parts.forEach((t, i) => {
      const x0 = t.ColIndex * 256,
        y0 = t.RowIndex * 256;
      draw(imgs[i], o.OffsetX + x0, o.OffsetY + y0, o.TextureWidth - x0, o.TextureHeight - y0);
    });
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, encodePng({ width: W, height: H, data: canvas }));
  return file;
}
