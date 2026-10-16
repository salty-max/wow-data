-- wow-data's game database: one SQLite file per game (classic.db, forever.db),
-- built from the pinned sources (pins.json) by bin/build.ts. A draft for the
-- user's review (14 October 2026), before anything is imported.
--
-- The rules (PLAN.md):
-- - IDs everywhere: every link between tables is the game's id (an area, a
--   map, a faction, a family, a type, a model, a spell, a skill line, a
--   page, a quest, an npc, an item), never a name.
-- - A thing's names live in `name` alone, by kind, id and language, English
--   included: no entity table repeats one.
-- - Every row says where it comes from (`source`): client (the game's own
--   tables), questie (QuestieDB: quests, NPCs, objects, their spawns, the
--   translations), classicdb (the Classic database: what Questie lacks),
--   wowhead (names, ranks and points fetched once and frozen in
--   data/wowhead), allthethings (Forever's own quests' rewards, frozen in
--   data/allthethings), players (what the game told the players who said yes
--   to the addons' opt-in, pulled into data/players: gaps only).
-- - One owner a table, never two sources for the same fact (PLAN.md).
-- - forever.db is Classic's world plus Forever's: a row Forever removed is
--   marked (`removed`), never dropped.

-- ── about the file ───────────────────────────────────────────────────────────
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,  -- game, built_at, pins (pins.json as built), schema
  value TEXT NOT NULL
);
CREATE TABLE source (
  name    TEXT PRIMARY KEY,  -- client, questie, classicdb, wowhead
  version TEXT NOT NULL,     -- the pinned build or commit
  url     TEXT,
  license TEXT
);

-- ── names, in every language ─────────────────────────────────────────────────
-- kind: creature, creature_subname, object, item, quest, area, wmo_area,
-- map, ui_map, encounter, spell, skill_line, talent_tab, specialization,
-- taxi_node, faction, creature_type, creature_family, readable_title, class,
-- race. locale: enUS, deDE, esES, esMX, frFR, itIT, koKR, ptBR, ruRU, zhCN,
-- zhTW. The client's own name wins over Wowhead's (the user's call).
CREATE TABLE name (
  -- (every word the game has in each language, by kind and id: names, and the
  -- client's item_description, spell_description, aura_description,
  -- spell_subtext, faction_description and global_string, whose tags are
  -- client_GlobalStrings.BaseTag)
  kind   TEXT NOT NULL,
  id     INTEGER NOT NULL,
  locale TEXT NOT NULL,
  name   TEXT NOT NULL,
  female TEXT,             -- a gendered name where the language has one (Druidesse)
  source TEXT NOT NULL,
  PRIMARY KEY (kind, id, locale)
);

-- ── the world: creatures and objects ─────────────────────────────────────────
CREATE TABLE creature (
  id            INTEGER PRIMARY KEY,  -- the npc id (a GUID's id)
  min_level     INTEGER,
  max_level     INTEGER,
  type_id       INTEGER,  -- CreatureType id (client_CreatureType)
  family_id     INTEGER,  -- CreatureFamily id, beasts (client_CreatureFamily)
  rank          INTEGER,  -- 0 normal, 1 elite, 2 rare elite, 3 boss, 4 rare
  faction_id    INTEGER,  -- FactionTemplate id
  npc_flags     INTEGER,  -- vendor, trainer, quest giver... (bit flags)
  unit_class    INTEGER,
  display_ids   TEXT,     -- its models' CreatureDisplayInfo ids, comma-separated
  loot_id       INTEGER,  -- loot.source_id for kind creature
  skin_loot_id  INTEGER,
  pick_loot_id  INTEGER,
  kill_credit   TEXT,     -- the creature ids a kill of it counts as
  removed       INTEGER,  -- 1: Forever no longer has it (forever.db, when a source says so)
  source        TEXT NOT NULL,
  trainer_type  INTEGER,  -- a trainer's kind: 0 class, 1 mounts, 2 trades, 3 pets (the Classic database's)
  trainer_class INTEGER,  -- a class trainer's class (ChrClasses id)
  unit_flags    INTEGER   -- the Classic database's (0x02000000: not selectable, a helper)
);
CREATE TABLE object (
  id         INTEGER PRIMARY KEY,  -- the gameobject id
  type       INTEGER,  -- 2 quest giver, 3 chest (a herb, a vein), 9 text, 10 goober...
  display_id INTEGER,  -- GameObjectDisplayInfo id
  faction_id INTEGER,
  lock_id    INTEGER,  -- client_Lock id: the skill a node needs (herbs, ores)
  page_id    INTEGER,  -- a text's first page (type 9)
  loot_id    INTEGER,
  data       TEXT,     -- the template's data0..data23 as JSON, for what isn't a column
  removed    INTEGER,
  source     TEXT NOT NULL
);
-- Where a creature or an object stands: in the world's coordinates (the
-- Classic database's, with its own spawn id) and/or on a zone's map (percent:
-- Questie's, and Wowhead's players' sightings, frozen for what the addons
-- need: source wowhead).
CREATE TABLE spawn (
  kind      TEXT NOT NULL,  -- creature, object
  spawn_id  INTEGER,        -- the source's own id for this spawn (the Classic database's guid), if it has one
  entity_id INTEGER NOT NULL,
  map_id    INTEGER,        -- Map id (0 Eastern Kingdoms, 1 Kalimdor, an instance)
  x         REAL, y REAL, z REAL,
  area_id   INTEGER,        -- AreaTable id, the zone (where a source gives it)
  ui_map_id INTEGER,        -- UiMap id of the map the percent is on, where a source gives one
  ux        REAL, uy REAL,  -- 0-100 on that map, else on the zone's map (area_id: Questie's)
  source    TEXT NOT NULL,
  movement_type   INTEGER,  -- a creature's: 0 stands, 1 wanders, 2 walks its path (the Classic database's)
  wander_distance REAL      -- how far it wanders from its spot, in yards
);
CREATE INDEX spawn_entity ON spawn (kind, entity_id);
CREATE INDEX spawn_area ON spawn (area_id);
CREATE INDEX spawn_own ON spawn (kind, spawn_id);
-- The way a creature walks: one spawn's own path (owner: spawn, its spawn_id)
-- or every spawn of a creature's (owner: creature, its id; path_id when it has
-- several), point by point. Yonder's quarries are tracked along them.
CREATE TABLE path (
  owner     TEXT NOT NULL,     -- spawn, creature
  owner_id  INTEGER NOT NULL,  -- spawn.spawn_id, or creature.id
  path_id   INTEGER NOT NULL DEFAULT 0,
  point     INTEGER NOT NULL,
  map_id    INTEGER,
  x         REAL, y REAL, z REAL,
  area_id   INTEGER,  -- the zone whose map ux, uy are on (QuestieDB's waypoints)
  ui_map_id INTEGER,
  ux        REAL, uy REAL,
  wait_ms   INTEGER,
  source    TEXT NOT NULL,
  PRIMARY KEY (owner, owner_id, path_id, point, source)
);

-- ── items ────────────────────────────────────────────────────────────────────
CREATE TABLE item (
  id              INTEGER PRIMARY KEY,
  class_id        INTEGER,  -- ItemClass id
  subclass_id     INTEGER,
  quality         INTEGER,  -- 0 poor .. 5 legendary
  inventory_type  INTEGER,  -- the slot (0: not worn)
  item_level      INTEGER,
  required_level  INTEGER,
  container_slots INTEGER,  -- a bag's room
  page_id         INTEGER,  -- a readable item's first page
  start_quest_id  INTEGER,  -- an item that starts a quest
  display_id      INTEGER,
  removed         INTEGER,
  source          TEXT NOT NULL,  -- client where the client has it, else classicdb
  allowable_class INTEGER         -- the classes that may use it (ChrClasses mask; null: every class)
);
-- What drops or gives what: a creature's, an object's, an item's (a box), a
-- fishing area's, skinning's, pickpocketing's.
CREATE TABLE loot (
  kind      TEXT NOT NULL,  -- creature, object, item, fishing, skinning, pickpocket, reference
  source_id INTEGER NOT NULL,  -- the template's id (creature.loot_id, an area id for fishing)
  item_id   INTEGER,        -- null for a reference row
  ref_id    INTEGER,        -- another template, for a reference row
  chance    REAL,           -- percent; negative: only on its quest
  group_id  INTEGER,
  min_count INTEGER,
  max_count INTEGER,
  source    TEXT NOT NULL,
  event_id  INTEGER         -- a game event the row drops only during (the Classic database's conditions)
);
CREATE INDEX loot_source ON loot (kind, source_id);
CREATE INDEX loot_item ON loot (item_id);
-- The Classic database's: another creature that may stand at a spawn instead
-- (a rare in an ordinary mob's place), and spawn groups, whose spawns share
-- their entries
CREATE TABLE spawn_entry (
  kind      TEXT NOT NULL,     -- creature
  spawn_id  INTEGER NOT NULL,  -- spawn.spawn_id
  entity_id INTEGER NOT NULL,
  source    TEXT NOT NULL,
  PRIMARY KEY (kind, spawn_id, entity_id)
);
CREATE TABLE spawn_group (
  id     INTEGER PRIMARY KEY,
  kind   TEXT NOT NULL,  -- creature, object
  source TEXT NOT NULL
);
CREATE TABLE spawn_group_entry (
  group_id  INTEGER NOT NULL,
  entity_id INTEGER NOT NULL,
  source    TEXT NOT NULL
);
CREATE TABLE spawn_group_spawn (
  group_id INTEGER NOT NULL,
  spawn_id INTEGER NOT NULL,  -- spawn.spawn_id
  source   TEXT NOT NULL
);
-- A dungeon's or a raid's encounters (the Classic database's): what credits one
CREATE TABLE encounter (
  id          INTEGER PRIMARY KEY,  -- DungeonEncounter id
  credit_type INTEGER NOT NULL,     -- 0 a creature killed, 1 a spell cast
  credit_id   INTEGER NOT NULL,     -- that creature or spell
  last        INTEGER,              -- the dungeon it ends (lastEncounterDungeon), if any
  source      TEXT NOT NULL
);
-- The graveyards and other safe places (WorldSafeLocs, the Classic
-- database's), their names in name (kind graveyard)
CREATE TABLE graveyard (
  id     INTEGER PRIMARY KEY,
  map_id INTEGER,
  x      REAL, y REAL, z REAL,
  source TEXT NOT NULL
);
-- The game's events (the Classic database's), their names in name (kind
-- game_event: "Winter Season Fishing")
CREATE TABLE game_event (
  id      INTEGER PRIMARY KEY,
  holiday INTEGER,  -- Holidays id
  source  TEXT NOT NULL
);
CREATE TABLE vendor (
  npc_id  INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  source  TEXT NOT NULL
);

-- ── quests ───────────────────────────────────────────────────────────────────
CREATE TABLE quest (
  id             INTEGER PRIMARY KEY,
  level          INTEGER,
  min_level      INTEGER,
  zone_id        INTEGER,  -- AreaTable id (the quest log's zone)
  sort_id        INTEGER,  -- QuestSort id, for a class's, a trade's, a holiday's
  type           INTEGER,  -- QuestInfo id (elite, dungeon, raid...)
  races          INTEGER,  -- ChrRaces mask
  classes        INTEGER,  -- ChrClasses mask
  skill_line_id  INTEGER,  -- a trade's quest
  prev_id        INTEGER,
  next_id        INTEGER,  -- NextQuestId
  next_in_chain  INTEGER,  -- NextQuestInChain
  chain_root     INTEGER,  -- the first quest of its chain (computed)
  flags          INTEGER,
  removed        INTEGER,
  source         TEXT NOT NULL,
  special_flags  INTEGER,  -- the Classic database's: 1 repeatable, 2 an event or an escort (no objective counts it)
  exclusive_group INTEGER, -- one quest of the group only (Volcor's escape: stealth or force)
  src_item_id    INTEGER   -- an item the quest hands over at its start (Questie's, else the Classic database's)
);
-- A quest's texts, per language (the Classic database's are English; Wowhead
-- gives the objectives in its nine languages): details, objectives, request, reward, end.
CREATE TABLE quest_text (
  quest_id INTEGER NOT NULL,
  locale   TEXT NOT NULL,
  field    TEXT NOT NULL,  -- details, objectives, request, reward, end, objective1..4
  text     TEXT NOT NULL,
  source   TEXT NOT NULL,
  PRIMARY KEY (quest_id, locale, field)
);
-- What a quest asks: the k-th of each kind, as the quest log orders them.
CREATE TABLE quest_objective (
  quest_id  INTEGER NOT NULL,
  idx       INTEGER NOT NULL,  -- 1-4 within its kind
  kind      TEXT NOT NULL,     -- creature, object, item, source (an item given for it), spell (one to cast),
                               -- event (a task in the quest's own words: text)
  target_id INTEGER NOT NULL,  -- a creature, an object, an item or a spell id (0: an event)
  count     INTEGER,
  text      TEXT,              -- its line in the quest log, where a source gives it
  source    TEXT NOT NULL,
  PRIMARY KEY (quest_id, kind, idx, source)
);
-- What a quest needs done first: one of its `any` (Questie's alternatives,
-- one a side's: "Call of Earth" after 1516, 1519 or 92466), every one of its
-- `all`. quest.prev_id is the first of them.
CREATE TABLE quest_prereq (
  quest_id INTEGER NOT NULL,
  prev_id  INTEGER NOT NULL,  -- negative: must be under way, not done (the Classic database's)
  kind     TEXT NOT NULL,     -- any, all
  source   TEXT NOT NULL,
  PRIMARY KEY (quest_id, prev_id, source)
);
CREATE INDEX quest_prereq_prev ON quest_prereq (prev_id);
-- Who or what starts and ends a quest.
CREATE TABLE quest_relation (
  quest_id  INTEGER NOT NULL,
  role      TEXT NOT NULL,  -- start, end
  kind      TEXT NOT NULL,  -- creature, object, item
  entity_id INTEGER NOT NULL,
  source    TEXT NOT NULL,
  PRIMARY KEY (quest_id, role, kind, entity_id, source)
);
CREATE INDEX quest_relation_entity ON quest_relation (kind, entity_id);
CREATE TABLE quest_reward (
  quest_id INTEGER NOT NULL,
  kind     TEXT NOT NULL,  -- item, choice, spell, cast, reputation, money (count: copper)
  ref_id   INTEGER NOT NULL,  -- an item, a spell or a faction id
  -- (count: an item's number, a reputation's value)
  count    INTEGER,
  source   TEXT NOT NULL
);

-- ── what trainers teach ──────────────────────────────────────────────────────
CREATE TABLE trainer_spell (
  npc_id         INTEGER NOT NULL,
  spell_id       INTEGER NOT NULL,
  cost           INTEGER,
  level          INTEGER,
  skill_line_id  INTEGER,
  skill_value    INTEGER,
  source         TEXT NOT NULL,
  req_spell_id   INTEGER   -- a spell it needs known first (a rank's earlier one, a talent)
);

-- ── what is written in the world ─────────────────────────────────────────────
-- A book, a note, a plaque: an object (type 9) or an item with a page. Its
-- title is its name (name.kind object or item, or readable_title); its pages
-- per language. English: the Classic database's page chain; other languages:
-- Wowhead's pages, imported by hand from a browser (data/wowhead/, committed).
CREATE TABLE readable (
  kind      TEXT NOT NULL,  -- object, item
  id        INTEGER NOT NULL,
  page_id   INTEGER,        -- the first page in the Classic database
  removed   INTEGER,
  source    TEXT NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE TABLE readable_page (
  kind   TEXT NOT NULL,
  id     INTEGER NOT NULL,
  locale TEXT NOT NULL,
  idx    INTEGER NOT NULL,  -- 1, 2, ...
  text   TEXT NOT NULL,     -- the game's own, its tokens kept ($N, $C, $B)
  source TEXT NOT NULL,
  PRIMARY KEY (kind, id, locale, idx)
);

-- ── what npcs say ────────────────────────────────────────────────────────────
-- The Classic database's broadcast texts, English and its six translations.
CREATE TABLE speech (
  id          INTEGER NOT NULL,  -- BroadcastText id
  locale      TEXT NOT NULL,
  text        TEXT,              -- male
  text_female TEXT,
  language_id INTEGER,           -- Languages id
  source      TEXT NOT NULL,
  PRIMARY KEY (id, locale)
);

-- What an npc was heard to say, by the npc: Wowhead's pages' quotes and
-- players' facts (the broadcast texts above know no speaker). kind: say, yell, emote, whisper, gossip (its
-- window's text).
CREATE TABLE npc_line (
  npc_id INTEGER NOT NULL,
  locale TEXT NOT NULL,
  kind   TEXT NOT NULL,
  text   TEXT NOT NULL,  -- the game's own ($N, $C, $R the player's name, class and race; $B a new line)
  seen   INTEGER,        -- the players who heard it
  source TEXT NOT NULL,
  PRIMARY KEY (npc_id, locale, kind, text)
);

-- Where a player stood while seeing a world creature. This is an approximate
-- observation, never a spawn point: do not use it as a riddle's exact spot.
CREATE TABLE creature_sighting (
  npc_id      INTEGER NOT NULL,
  locale      TEXT NOT NULL,
  ui_map_id   INTEGER NOT NULL,
  observer_x  REAL NOT NULL,
  observer_y  REAL NOT NULL,
  build       TEXT,
  seen        INTEGER NOT NULL,
  source      TEXT NOT NULL,
  PRIMARY KEY (npc_id, locale, ui_map_id, observer_x, observer_y)
);

-- ── outside sources' own facts ───────────────────────────────────────────────
-- A rare's zone (the WoWWiki archive's "Rare mobs by zone", else its spawns).
CREATE TABLE rare_zone (
  creature_id INTEGER NOT NULL,
  ui_map_id   INTEGER NOT NULL,
  source      TEXT NOT NULL
);

-- ── the client's own tables ──────────────────────────────────────────────────
-- Imported whole from wago.tools at the pinned build, one table each, column
-- for column, prefixed client_ (client_AreaTable, client_UiMap...): an addon
-- reaches anything the client knows without a schema change. Their names in
-- other languages go to `name`. The tables:
--   AreaTable, WMOAreaTable, AreaTrigger (the quests' exploration
--   triggers), Map, UiMap, UiMapAssignment, UiMapLink,
--   UiMapXMapArt, UiMapArt, UiMapArtStyleLayer, UiMapArtTile (a map's
--   art: its tiles' file ids), WorldMapOverlay, WorldMapOverlayTile (the
--   explored areas painted over it), DungeonEncounter, SpellName, SkillLine,
--   SkillLineAbility, TalentTab, ChrSpecialization, ChrClasses, ChrRaces,
--   TaxiNodes, Faction, FactionTemplate, CreatureType, CreatureFamily,
--   CreatureDisplayInfo, CreatureDisplayInfoExtra, ItemSparse, Item, Lock,
--   QuestSort, QuestInfo, EmotesText, Languages
-- (created by bin/build.ts from each CSV's header; integers stored as such).

-- ── views: the common joins, English ─────────────────────────────────────────
-- (an addon reads these or writes its own SQL; a language other than
-- English: the same join on name.locale)
CREATE VIEW creature_en AS
  SELECT c.*, n.name AS name, s.name AS subname
  FROM creature c
  LEFT JOIN name n ON n.kind = 'creature' AND n.id = c.id AND n.locale = 'enUS'
  LEFT JOIN name s ON s.kind = 'creature_subname' AND s.id = c.id AND s.locale = 'enUS';
CREATE VIEW quest_en AS
  SELECT q.*, n.name AS title
  FROM quest q
  LEFT JOIN name n ON n.kind = 'quest' AND n.id = q.id AND n.locale = 'enUS';
CREATE VIEW item_en AS
  SELECT i.*, n.name AS name
  FROM item i
  LEFT JOIN name n ON n.kind = 'item' AND n.id = i.id AND n.locale = 'enUS';
