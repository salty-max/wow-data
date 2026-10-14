# wow-data: our own game database

14 October 2026. The user's goal: every bit of game or outside data an addon
uses comes from here, built once, in one shape, for every addon to pick
from. The databases are built (steps 1 to 4 below); the addons still parse
the sources their own way until each moves onto them (step 5).

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

Every row says where it comes from (`source`: `client`, `questie`,
`classicdb`, `wowhead`), so a doubtful fact can be traced and a source's
rows replaced whole. The tables: `schema.sql`.

### Three sources, one owner a table

The user's call, 14 October 2026: fewer sources, fewer errors, less
dependence. A first build read six (adding AllTheThings, QuestieDB's beta
traces, pfQuest and Wowhead's tooltips); it found QuestieDB keeping the
world for both games, Forever's own content in its correction layers, with
translations in nine languages.

| Source | Owns |
|---|---|
| **The client** (wago.tools, the pinned builds) | its own tables, whole (`client_<Table>`); the names it gives (areas, maps, spells, skills, items, factions, flight masters...) in all eleven languages; items |
| **QuestieDB** (the pinned commit) | quests (who starts and ends them, what they ask, their requirements, reputation rewards); NPCs and objects (levels, rank, flags, title, spawns by zone, paths); items the client lacks, and their drops and vendors where the Classic database has none; names and quests' objectives in nine languages |
| **The Classic database** (cmangos) | what Questie lacks: a creature's type, family and models, an object's type, lock and first page, a quest's type, details and item rewards, its objectives' counts (merged into Questie's rows), loot odds, vendors, trainers, books, speech in seven languages, world coordinates (spawns with their own id, the paths they walk), anything Questie doesn't have |
| **Wowhead, frozen** (`data/wowhead/`) | French names Questie doesn't translate (Forever's own content), and the clients' own where Questie's lag them (mined by Wowhead: 87 for Forever, 71 for Classic Era, 14 Oct), fetched once; French book pages a browser saved. No job asks Wowhead |

Names, by precedence: the client's, Questie's, the Classic database's, then
the frozen Wowhead ones, which are the clients' own (mined) and so win over
Questie's where the two truly differ (Questie's translations lag the clients'
renames). Questie's objectives carry no counts: a Classic
quest's come from the Classic database, Forever's own are in the
objective's text ("Slay 8 Ursera Scavengers...").

Questie's data is merged by Questie's own engine (`generator/flavor.lua`:
the raw base, every correction layer, the derived passes), run in a
checkout of the pinned commit (`bin/questie-export.lua`, real Lua 5.1: on
Linux Questie's bundled binary, on macOS one built from lua.org's source).
Nothing of its layering is interpreted here.

### Building and shipping it

- `bun bin/build.ts [classic|forever]` builds a database from the cache
  (the sources at their pins), in minutes.
- It is never committed: `wow-data`'s workflow builds both on every change
  of the pins or the build code and publishes them as a release asset named
  by the pins (`db-<pins hash>`). An addon's daily job downloads the release
  for the current pins instead of parsing every source again. Locally,
  `src/db.ts` opens the database, built once from the shared cache.
- Tests: known facts checked on every build (Hogger is creature 448, quest
  182 asks for 14 of creature 706, Coldridge Valley in French and German, a
  quest of Forever's own present only in `forever.db`).

### What stays in the addons

Their own derived data: Hearthtale's grammar tables (`Names.lua`) and the
writer's knowledge, Yonder's riddle spots and naturalist's notes, the
Codex's pages and unlocks, the translations we wrote (the Codex's
`books-supplement.json`). They become queries against the database.

## Order

1. **Schema and the Classic import.** Done 14 October 2026, the schema
   reviewed by the user first.
2. **Forever and the three sources.** Done 14 October 2026: first with
   AllTheThings, QuestieDB's traces and pfQuest, then reworked around the
   three sources (the user's call). `classic.db`: Questie's Classic (10,122
   NPCs, 4,257 quests), the Classic database for what it lacks; `forever.db`:
   Questie's Forever (13,392 NPCs, 5,226 quests: Classic's and Forever's
   own). About 40 and 20 seconds once the sources are cached. Tested
   (`test/classic.test.ts`, `test/forever.test.ts`).
3. **Names in every language.** Done: the client's in eleven languages,
   Questie's in nine (about 245,000 names and quest texts a game), the
   French Questie lacks from Wowhead, fetched once (`bin/names.ts`, a hand
   tool now) and frozen in `data/wowhead/`, with the French book pages.
4. **Releases.** `.github/workflows/db.yml`: both databases built from the
   pins on every change of what makes them, tested, and published as the
   latest release (`db-<commit>`, gzipped, the five latest kept);
   `bin/get.ts` downloads them.
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

## Decisions (the user's, 14 October 2026)

- **SQLite**, one file per game: SQL from TypeScript and Python alike.
- **`forever.db` keeps Classic's content** that Forever may have removed:
  no source lists the removals yet. A row is marked removed (`removed = 1`,
  its source) once one does, never dropped.
- **IDs everywhere** (the user's rule): if a thing has an id, the database
  uses it. Every link between tables is an id (a zone, an area, a map, a
  faction, a family, a type, a model, a spell, a skill, a page, a quest, an
  npc, an item), never a name. A thing's names live in one place, the
  `name` table, by kind, id and language, English included: no entity table
  repeats a name.
- **The client wins on names.** Then Questie's, the Classic database's, and
  last the frozen Wowhead ones; but Wowhead's mine the clients, so where
  they truly differ from Questie's, they are the client's and win.
- **Three sources** (the client, QuestieDB, the Classic database), one owner
  a table: fewer sources, fewer errors, less dependence. AllTheThings,
  pfQuest, QuestieDB's old traces and live Wowhead fetching are dropped from
  the database (their pins kept `legacy` for Hearthtale's old scripts until
  it reads the database).
