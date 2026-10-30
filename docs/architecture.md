# wow-data's architecture

How the repository is laid out and built, file by file (moved from
CLAUDE.md on 20 October 2026; the map stays there). The sources each table
comes from, and the rules for them: `docs/sources.md`.

## The pins, the cache, the fetchers

- `pins.json`: the clients' builds on wago.tools (`builds.classic`: Classic
  Era; `builds.forever`: Forever, on its own product `wowf` since 23
  October 2026, its beta filed before under `wow_classic_beta` beside Mists
  of Pandaria's) and the databases' commits
  (`repos`: questie, classicdb). The one place a build or a database is
  pinned: an addon never pins its own. What other sources alone had is
  frozen in `data/` (Wowhead's, AllTheThings' rewards and prerequisites for
  Forever's own quests), never fetched by a build or a job.
- `src/pins.ts` (the pins, `wagoQuery`), `src/fetch.ts` (`fetchRetry`: a
  5xx or a dropped connection tried again three times, 10, 30, 60 s apart),
  `src/cache.ts` (`cached(url, rel)`: `.cache/<rel>`, once; `WOW_DATA_CACHE`
  moves it), `src/csv.ts`, `src/wago.ts` (`wago(game, table, locale)`,
  `wagoFile`: `.cache/wago/<game>/<build>/<table>-<locale>.csv`; `LOCALES`),
  `src/github.ts` (`repoFile(name, path)`, `repoTree(name)`, `repoDir`,
  `classicDump()`: `.cache/github/<repo>/<commit12>/<path>`), `src/builds.ts`
  (version order: `newer`, `newest`, `family`).

## The database

- The database (PLAN.md, `schema.sql`): `bin/build.ts <classic|forever|all>`
  builds `.cache/db/<game>.db` from the pinned sources (`src/build.ts`: the
  client's tables whole as `client_<Table>`, their names in every language,
  the music's chain from an area to its files (`music()`, `docs/sources.md`),
  then Questie's world (`src/questie.ts`: QuestieDB at its pin, whole, merged
  by its own engine, `bin/questie-export.lua` run with real Lua 5.1, built
  from lua.org's source into the cache on macOS), then the Classic
  database for what Questie lacks (`src/sql.ts`), then the frozen Wowhead
  names and books; one owner a table, names client > Questie > Classic
  database > Wowhead, except where Wowhead's (mined from each client) truly
  differ from Questie's lagging translations: those are the game's own; a
  creature's server-side fields, faction, npc and unit flags, are the Classic
  database's wherever it has the creature, which Questie's lack or misplace;
  `creature.friendly`, the players' sides a creature is friendly to, A, H or
  AH, is Questie's `friendlyToFaction`, for about 60% of its creatures in
  both games: the one word on a creature with no faction template,
  Forever's new vendors);
  `src/db.ts`
  (`openDb(game)`, read only; `dbPath`). IDs everywhere, names only in
  `name`, every row its `source`. `test/classic.test.ts` and `test/forever.test.ts` check them against
  facts from the game (skipped where they aren't built).
- The ground (`src/terrain.ts`, 30 October 2026, for geoguessr's camera
  picker), in a database of its own: `bun bin/terrain.ts classic` builds
  `.cache/db/classic-terrain.db` (`terrain.sql`; `src/terrainDb.ts`'s `openTerrain(game)` reads
  it, saying when it was read at another pin, by another parser or with
  another schema). Never
  built by `bin/build.ts`, never released, never run by a job: no addon
  reads it, and its 70 MB in classic.db would have grown every addon's daily
  download by half (the user's call). `terrain_chunk`, one row per map chunk
  of Classic's two continents (its heights a byte each over the 9x9 corner
  vertices, its holes, the liquid over it, its area), `wmo_placement`
  (each WMO's bounding box), `doodad_placement` (each M2 doodad: a tree, a
  rock, a fence, about 316,000) and `doodad_model` (each doodad model's
  bounding and collision boxes from its header, 2944 models), read from
  every tile the map's WDT lists, its root and `_obj0` ADT, and each model's
  M2, from wago.tools at the pinned build, six at a time.
  The raw tiles (300 KB each, 1666 of them) and models are never kept: the
  cache holds what is read from each: a tile gzipped in
  `.cache/wago/terrain-<parser>/<build>/<map>/<col>_<row>.json.gz`, a
  model's boxes as plain JSON in `.../<build>/models/<id>.json` (a model
  wago.tools lacks is asked again next build), about 60 MB in all;
  `<parser>` a hash of `terrain.ts`, so a change to the parser reads every
  tile again). A tile that isn't a map file (a challenge page, a body cut
  short) stops the build. About 100 seconds, 96 MB. Forever's maps are not built.
  `wmo_group` (`src/wmoGroups.ts`, 30 October 2026): the groups of the big
  WMO placements (160 yards or more across) whose WMO the client names a
  part of in `client_WMOAreaTable` (so classic.db is built first, at the
  pin: refused otherwise, its tag in the meta as `game_db`): 20 WMOs,
  1237 groups, the cities' districts (Stormwind's Trade District,
  Orgrimmar's Valley of Strength) and some dungeons' halls. Each group's
  box from its file's MOGP header, turned by its placement's MODF rotation
  (the WMO's +x along the game's facing rot + 180: fitted on the 260 big
  placements' own extents, 5 yards off on average) and placed in world
  coordinates, with its id, the WMO's id and the placement's name set, the
  keys of `client_WMOAreaTable`'s name. A group file is 300 KB and Stormwind
  has 306, so the cache keeps what is read from each WMO
  (`.cache/wago/wmo-groups-<groups>-<parser>/<build>/<root file>.json`,
  hashes of `wmoGroups.ts`, in the database's meta as `groups`, and of
  `terrain.ts`), and the small files whole (the 260 big placements' roots,
  the `_obj0` tiles under the 20, in `.cache/wago/casc/<build>/`). A
  placement is looked up in the tile under its origin, then the others
  under its box. `wmoGroups.ts` is apart from `terrain.ts`, its fetch
  helpers written again, so the tiles' cache (a hash of `terrain.ts`, about
  1 GB to read again) stays.
- `left_out`: what the build leaves out of a game though a source had it
  (Forever: Season of Discovery's, `docs/sources.md`), its names kept in
  `name` and nothing else of it. A journal may hold its id: an addon's
  table that turns saved ids back into names keeps these ids as names
  (never as the game's: no spawn, no level, no source), and only there.
- `bun bin/card.ts <npc|object|place|item|quest> <id or exact name> [--game classic|forever] [--full]`:
  one thing on one card, 40 lines at most (`src/card.ts`), before any query by hand
  (a left-out thing: its names, "LEFT OUT").

## The workflows and the hand tools

- `.github/workflows/db.yml`: both databases built, tested and published as
  the latest release (`db-<commit12>`, the last commit that changed them);
  `bin/db-tag.ts` supplies the same input-revision tag to the publisher and
  addon jobs, including recovery builds after test-only fixes. `bin/get.ts`
  downloads them (`--tag`: one exact release, `--wait SECONDS`: wait for both
  uploads). Addon jobs wait up to ten minutes for a build still publishing.
  A release a cancelled run left half uploaded is finished by the next run
  (its assets uploaded again, marked latest), never made a second time.
- A build stops rather than publish less than it should: a client table
  wago.tools doesn't have (its 400, or a 404) is the one absence, every
  other failed download stops it (`absent`, `src/cache.ts`; a 429 is tried
  again after its Retry-After, `src/fetch.ts`); a language holding fewer
  than 95% of English's names for a kind stops it (`nameFloor`: 99.9% at
  least on 23 October 2026); a frozen file one of the games reads, missing,
  stops it (`frozenFile`). The cache keeps nothing half written: a download, an
  unpacked archive or Questie's export lands beside its path and is moved in
  whole, and an empty body or a web page where a table or JSON was asked is
  refused. Questie's export is keyed by the exporter's own hash too. The
  dump's core tables (creatures, objects, items, quests, texts, pages)
  can't come back empty (`rows(sql, table, 1)`).
- What a database is made of (`buildInputs`, `src/dbRelease.ts`): the pins,
  the schema, `data/`, db.yml, the Lua the build runs, and every file
  `bin/build.ts` imports, followed when asked; its tag is the last commit
  touching them, so a hand tool's edit (card.ts, tell.ts) is no new
  database. The build writes the tag into `meta`; `openDb` (and the Python
  `db()`) says once when a database was built from other inputs than the
  checkout's, an error under `WOW_DATA_STRICT=1`.
- A pull request a job opens (pins, players) gets no `pull_request` run:
  GitHub starts none for a job's own token. The job dispatches ci.yml on
  its branch instead (`actions: write`), so the pull request shows its
  checks.
- `.github/workflows/addon-data.yml`: an addon's game data built again,
  called by each addon's daily `game-data.yml` (Hearthtale, the Codex,
  Yonder, Second Wind, Palaver, Mealbook, Goodwill, Yours Truly; one run at
  a time in each, no husky hooks) with its own generators (`generate`), the files a
  pull request carries (`paths`), its checks (`check`), Hearthtale's
  journals compared (`before`, `report`), addon-kit beside it (`kit`): the
  databases of the wow-data checked out downloaded, a pull request only when
  a generated file changes, rebased onto main by itself once the checks pass
  (`merge`: nothing reaches players before a release, which stays by hand).
  Each day is told to the owner in words (`bin/describe-data.ts`: the files'
  entries new, changed, gone, and wow-data's commits since the last data
  commit's `wow-data: <commit>`; `bin/tell.ts`: Ravenpost's inbox, its
  activity and the owner's phone, `INBOX_EVENTS_TOKEN`, callers pass
  `secrets: inherit`), a failure too. A caller needs "Allow GitHub Actions to
  create and approve pull requests".
- `ui-pins.json`, `src/ui.ts`, `bin/ui.ts`: Blizzard's UI source and textures, pinned apart from the data (no database is made of them) and read by one tool: `docs/ui-source.md`.
- `bin/latest.ts`: newer builds than the pins (`--write`, `--next FILE`,
  `--summary FILE`); the databases' newer commits, told only. `bin/path.ts`:
  a cached file's path, for the addons' Python scripts.
- `.github/workflows/pins.yml`: daily, a pull request moving the pins, merged
  by itself once the databases build at them and pass their tests (else it
  waits, and says so), then `db.yml` asked for (a merge by the workflow's
  token sets off no push workflow); `ci.yml`: `bun run check`, and the
  explorer's.

## The explorer

- `explorer/`: the databases in a browser (README.md), its own package
  (`bun run explore`, `explore:dev`; `bun run --cwd explorer check`). The
  server (`server.ts`, `api/`: search on a trigram index of `name`, a page's
  data by kind in `entity.ts`, the console's queries in a worker, zone maps
  from the client's tiles in `mapart.ts`, BLP decoded in `blp.ts`) reads
  the databases read only; the page (`src/`) is Ravenpost's look (night
  stone, gold, Cinzel, Inter). Its caches: `.cache/explorer/`. Render a page
  and look at it before calling a change done (headless Chrome when the
  browser pane is hidden).

## How the addons use it

They sit beside it (`~/code/wow-addons/<addon>`) and import
`../../wow-data/src/...` from their `scripts/`; Python reads the databases
through `py/wowdata.py` (`db(game)`, read only) or asks `bin/path.ts` for a
file. Moving a script onto the kit must leave its generated files byte for
byte the same (the addon's own `--check`, and Hearthtale's golden check). An
addon's daily job checks out wow-data's main beside it and builds its data
again from the pins. A table decoding a journal's ids reads `left_out` too
(Hearthtale's English_Forever.lua, Second Wind's and Yonder's
creatures.json): an id leaves no saved file bare when the build leaves its
thing out. Each addon's check proves it: addon-kit's `ids.ts` compares
every table its `saved-ids.json` lists with the fork point from origin/main,
so a daily job whose regeneration drops an id fails before its pull request
(the run's summary names the ids) and the owner is told.
