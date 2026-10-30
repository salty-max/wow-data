-- wow-data's ground database: <game>-terrain.db beside the game's database,
-- built by bin/terrain.ts (never by bin/build.ts, never released: no addon
-- reads it, and its 70 MB would grow every addon's daily download by half).
-- The user's call, 30 October 2026.

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL  -- game, build (the pin it was read at), parser (src/terrain.ts' hash), built_at
);

-- ── the ground ────────────────────────────────────────────────────────────────
-- The continents' ground from the client's map files (src/terrain.ts: each
-- tile's root and _obj0 ADT at the pinned build). Classic's maps 0 and 1 only,
-- for geoguessr's camera picker; Forever's are not built.
-- One row per map chunk, 33.3 yards a side, on a grid over the whole map:
-- x = 17066.67 - row * 33.33, y = 17066.67 - col * 33.33 is its north-west
-- corner (the largest x and y it covers).
CREATE TABLE terrain_chunk (
  map_id       INTEGER NOT NULL,
  row          INTEGER NOT NULL,  -- 0-1023, world x falls with it
  col          INTEGER NOT NULL,  -- 0-1023, world y falls with it
  x            REAL NOT NULL,
  y            REAL NOT NULL,
  area_id      INTEGER NOT NULL,  -- AreaTable id: the subzone (or the zone) the client names here
  z_min        REAL NOT NULL,
  z_max        REAL NOT NULL,
  heights      BLOB NOT NULL,     -- 81 bytes: the 9x9 corner vertices 4.17 yards apart, row by row, each z_min + b / 255 * (z_max - z_min)
  holes        BLOB,              -- 8 bytes, the 8x8 cells with no ground (a cave mouth), bit row * 8 + col, little end first; NULL: none
  liquid_type  INTEGER,           -- LiquidType id of the liquid over it (water, ocean, magma, slime); NULL: none
  liquid_min   REAL,              -- the liquid's surface, lowest and highest
  liquid_max   REAL,
  liquid_cells BLOB,              -- 8 bytes, the cells it covers, as holes
  source       TEXT NOT NULL,
  PRIMARY KEY (map_id, row, col)
);
-- Where the map files place a WMO (a building, a city, a cave, a bridge): its
-- bounding box in world coordinates. One placed over several tiles is one row.
CREATE TABLE wmo_placement (
  map_id    INTEGER NOT NULL,
  unique_id INTEGER NOT NULL,  -- the placement's own id
  file_id   INTEGER,           -- the WMO's root file; NULL: named by path
  x         REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL,
  min_x     REAL NOT NULL, min_y REAL NOT NULL, min_z REAL NOT NULL,
  max_x     REAL NOT NULL, max_y REAL NOT NULL, max_z REAL NOT NULL,
  source    TEXT NOT NULL,
  PRIMARY KEY (map_id, unique_id)
);

-- Where the map files place a doodad (an M2: a tree, a rock, a fence, a
-- banner). One placed over several tiles is one row.
CREATE TABLE doodad_placement (
  map_id    INTEGER NOT NULL,
  unique_id INTEGER NOT NULL,  -- the placement's own id
  file_id   INTEGER,           -- the model's file (doodad_model); NULL: named by path
  x         REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL,
  yaw       REAL NOT NULL,     -- its turn about the up axis, degrees, as the file gives it: the model's +x lies along the game's facing yaw + 180 (its tilt is not kept)
  scale     REAL NOT NULL,     -- 1: the model's own size
  source    TEXT NOT NULL,
  PRIMARY KEY (map_id, unique_id)
) WITHOUT ROWID;
-- A doodad model's two boxes from its header, in its own yards (x forward,
-- y left, z up from its foot), before a placement's scale and turn: the whole
-- model (leaves and branches too), and what a player bumps into (a trunk, a
-- rock; all 0: nothing, grass and flowers).
CREATE TABLE doodad_model (
  file_id   INTEGER PRIMARY KEY,
  min_x     REAL NOT NULL, min_y REAL NOT NULL, min_z REAL NOT NULL,
  max_x     REAL NOT NULL, max_y REAL NOT NULL, max_z REAL NOT NULL,
  col_min_x REAL NOT NULL, col_min_y REAL NOT NULL, col_min_z REAL NOT NULL,
  col_max_x REAL NOT NULL, col_max_y REAL NOT NULL, col_max_z REAL NOT NULL,
  source    TEXT NOT NULL
);
