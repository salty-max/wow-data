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
- `.github/workflows/addon-data.yml`: an addon's game data built again,
  called by each addon's daily `game-data.yml` (Hearthtale, the Codex,
  Yonder, Second Wind) with its own generators (`generate`), the files a
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
