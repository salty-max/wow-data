# wow-data: our own game database

14 October 2026. The user's goal: every bit of game or outside data an addon
uses comes from here, built once, in one shape, for every addon to pick
from. Today wow-data only pins and downloads the sources (phase 0, done);
each addon still parses them its own way.

## Why

The same sources are read several times, by different code that disagrees
at the edges:

- the Classic database (cmangos classic-db) is parsed four times: Hearthtale's
  `audit-data.ts`, the Codex's `portraits.py`, `texts.py` and `book_texts.py`,
  Yonder's `creatures.py`, the kit's `glossary.py`;
- Forever's own content (AllTheThings, QuestieDB's traces) is merged twice,
  in Hearthtale's `forever-data.ts` and Yonder's `expeditions.py` and
  `forever_rares.py`; the Codex has none of it;
- names in other languages are gathered three times (Yonder's
  `creature_names.py`, the Codex's `text_titles.py`, the kit's `glossary.py`
  and `subzones.py`), all from Wowhead's tooltips;
- the client's area tables are read four times.

Forever's launch build (4 November) should be one pull request moving the
pins, then one data pull request per addon.

## The database

One SQLite file per game: `classic.db` and `forever.db`. Bun reads SQLite
natively (`bun:sqlite`) and so does Python (`sqlite3`), so every script,
TypeScript or Python, queries the same tables with plain SQL.

Every row says where it comes from (`source`: `classicdb`, `client`,
`allthethings`, `questiedb`, `wowhead`, `pfquest`, `wiki`, `manual`), so a
doubtful fact can be traced and a source's rows replaced whole.

### Tables (first draft, for review)

The world:

| Table | Columns | From |
|---|---|---|
| `creature` | id, name, subname, type, family, rank, min_level, max_level, model, faction, npc_flags | classicdb; Forever's additions from allthethings, questiedb |
| `creature_spawn` | creature_id, map, x, y, zone_id, sub_id | classicdb, pfquest; Forever: questiedb traces |
| `object` | id, name, type, page_id | classicdb; allthethings, questiedb |
| `object_spawn` | object_id, map, x, y, zone_id, sub_id | classicdb; questiedb |
| `item` | id, name, quality, class, subclass, inventory_type, page_id | client (ItemSparse, Item), classicdb for what the client lacks |
| `quest` | id, title, details, objectives, level, min_level, races, classes, zone_id, prev_id, next_id, chain_root | classicdb; allthethings, questiedb |
| `quest_objective` | quest_id, idx, kind (monster, item, object, event), target_id, count, text | classicdb; allthethings |
| `quest_npc` | quest_id, role (starter, ender), kind (creature, object, item), npc_id | classicdb; allthethings, questiedb |
| `loot` | source_kind, source_id, item_id, chance | classicdb |
| `trainer_spell` | npc_id, spell_id, level, skill_id | classicdb |
| `npc_text` | id, locale, text | classicdb (broadcast_text and its 66,624 translated lines) |
| `readable` | kind (object, item), id, title | classicdb |
| `readable_page` | kind, id, locale, idx, text | classicdb (English); Wowhead's pages (other languages) |

The client's own tables (wago.tools, the pinned build):

| Table | From |
|---|---|
| `area` (id, name, parent_id, map_id, zone_id), `wmo_area` | AreaTable, WMOAreaTable |
| `ui_map`, `map_overlay`, `map` (instances), `encounter` | UiMap, UiMapAssignment, WorldMapOverlay, Map, DungeonEncounter |
| `spell` (id, name), `skill_line`, `skill_ability`, `talent_tab`, `specialization` | SpellName, SkillLine, SkillLineAbility, TalentTab, ChrSpecialization |
| `taxi_node`, `faction`, `creature_type`, `creature_family`, `display` | TaxiNodes, Faction, CreatureType, CreatureFamily, CreatureDisplayInfo(Extra) |

Names in every client language, one table for every kind:

| Table | Columns | From |
|---|---|---|
| `name` | kind, id, locale, name | client tables where they carry names (areas, spells, skills, flight points, factions, families, items); Wowhead's tooltips for the rest (creatures, objects, quests) |

The Classic database holds no translated names (its `locales_*` tables are
empty). Wowhead turns scripts away from its pages but answers its tooltip
service (`nether.wowhead.com`): names are fetched there, slowly, and cached.
Its book pages open only in a browser: they are imported by hand (the
routine used for the Codex on 14 October) into a snapshot committed here,
`data/wowhead/`, since a cache can be lost and they can't be fetched again
by a script.

Also from outside sources: `rare_zone` (Yonder's rares by zone, the WoWWiki
archive), and the game's interface textures (Gethe/wow-ui-textures, pinned)
as files.

### Classic and Forever

`classic.db` is the original world: the Classic database and Classic Era's
client tables. `forever.db` is the same world as Forever knows it: the
Classic database, Forever's client tables (which replace Classic Era's),
Forever's new quests, creatures and objects from AllTheThings and QuestieDB's
traces (each row its source), and Forever's renames. Hearthtale's
`forever-data.ts` already does this merge for itself; it moves here.

### Building and shipping it

- `bun bin/build.ts [classic|forever]` builds a database from the cache
  (the sources at their pins), in minutes.
- It is never committed: `wow-data`'s workflow builds both on every change
  of the pins or the build code and publishes them as a release asset named
  by the pins (`db-<pins hash>`). An addon's daily job downloads the release
  for the current pins instead of parsing every source again. Locally,
  `src/db.ts` opens the database, built once from the shared cache.
- Tests: known facts checked on every build (Hogger is creature 448, quest
  182 asks for 14 of creature 706, the Frostwolf rows' names in French, a
  Forever quest from AllTheThings present only in `forever.db`), and row
  counts compared with the previous build.

### What stays in the addons

Their own derived data: Hearthtale's grammar tables (`Names.lua`) and the
writer's knowledge, Yonder's riddle spots and naturalist's notes, the
Codex's pages and unlocks, the translations we wrote (the Codex's
`books-supplement.json`). They become queries against the database.

## Order

1. **Schema and the Classic import.** The tables above, from the Classic
   database and Classic Era's client tables; the tests. The schema goes to
   the user before anything is imported.
2. **The Forever layer.** Forever's client tables, AllTheThings and
   QuestieDB's traces, Hearthtale's merge moved here.
3. **Names in every language.** The client's, Wowhead's tooltips (cached,
   throttled, resumable), the book pages' snapshot.
4. **Releases.** The workflow building and publishing both databases.
5. **The addons, one at a time:** the Codex, Hearthtale, the kit's glossary
   and subzones (queries now), then Yonder once its French branch is merged.
   Each one's generated files are compared before and after: the four old
   parsers don't agree on every edge case (escaped quotes, empty fields), so
   a few lines may change. Each difference is read and fixed or accepted,
   never waved through.
6. **Cleanup.** The addons' own fetch code and caches removed, their docs
   pointed here.

About two days for steps 1 to 4, then half a day to a day per addon: done
before Forever's launch on 4 November.

## Open questions

- SQLite, as proposed, or plain JSON files per table? SQLite: one file, SQL
  from both languages, small. JSON: readable in a diff, but every script
  loads whole tables.
- Should `forever.db` keep Classic quests and creatures Forever removed? No
  source lists the removals yet: kept, and marked once a source says so.
- Wowhead's names for creatures and quests come from its Forever and Classic
  databases, which may lag the game. Where the client itself names a thing,
  the client wins.
