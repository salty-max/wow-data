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
-- - Every row says where it comes from (`source`): classicdb, client,
--   allthethings, questiedb, pfquest, wowhead, wiki, manual.
-- - forever.db is Classic's world plus Forever's: a row Forever removed is
--   marked (`removed`), never dropped.

-- ── about the file ───────────────────────────────────────────────────────────
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,  -- game, built_at, pins (pins.json as built), schema
  value TEXT NOT NULL
);
CREATE TABLE source (
  name    TEXT PRIMARY KEY,  -- classicdb, client, allthethings, ...
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
  source        TEXT NOT NULL
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
-- Classic database's) and/or on a zone's map (UiMap id, percent: pfQuest's,
-- QuestieDB's traces, AllTheThings').
CREATE TABLE spawn (
  kind      TEXT NOT NULL,  -- creature, object
  spawn_id  INTEGER,        -- the source's own id for this spawn (the Classic database's guid), if it has one
  entity_id INTEGER NOT NULL,
  map_id    INTEGER,        -- Map id (0 Eastern Kingdoms, 1 Kalimdor, an instance)
  x         REAL, y REAL, z REAL,
  area_id   INTEGER,        -- AreaTable id, the zone (where a source gives it)
  ui_map_id INTEGER,        -- UiMap id of the map the percent is on, where a source gives one
  ux        REAL, uy REAL,  -- 0-100 on that map, else on the zone's map (area_id: pfQuest's, QuestieDB's)
  source    TEXT NOT NULL
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
  source          TEXT NOT NULL  -- client where the client has it, else classicdb
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
  source    TEXT NOT NULL
);
CREATE INDEX loot_source ON loot (kind, source_id);
CREATE INDEX loot_item ON loot (item_id);
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
  source         TEXT NOT NULL
);
-- A quest's texts, per language (the Classic database's are English; Wowhead
-- and AllTheThings may give others): title, details, objectives, request, reward, end.
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
  kind     TEXT NOT NULL,  -- item, choice, spell, cast, reputation
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
  source         TEXT NOT NULL
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
--   AreaTable, WMOAreaTable, Map, UiMap, UiMapAssignment, UiMapLink,
--   WorldMapOverlay, DungeonEncounter, SpellName, SkillLine,
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
