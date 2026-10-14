# wow-data

The game data the WoW addons are built from, pinned in one place and
downloaded once (README.md). Build-time tooling only: nothing here ships in
an addon. Bun and TypeScript.

Where it is going: our own game database, one SQLite file per game that
every addon queries (PLAN.md: the tables, Classic and Forever, the order).

## Layout

- `pins.json`: the clients' builds on wago.tools (`builds.classic`: Classic
  Era; `builds.forever`: Forever, whose beta wago files under
  `wow_classic_beta` beside Mists of Pandaria's) and the databases' commits
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
  database's wherever it has the creature, which Questie's lack or misplace);
  `src/db.ts`
  (`openDb(game)`, read only; `dbPath`). IDs everywhere, names only in
  `name`, every row its `source`. `test/classic.test.ts` and `test/forever.test.ts` check them against
  facts from the game (skipped where they aren't built).
- Wowhead, frozen: `data/wowhead/<game>/<locale>.json` (names Questie
  doesn't translate: Forever's own content; and the clients' own where
  Questie's French lags them: "Sentinelle de Dolanaar", Classic's "Goulet
  des Warsong") and `books-<locale>.json` (book
  pages saved from a browser: `books-enUS.json` the English of Forever's own
  texts, which neither Questie nor the Classic database has), `ranks.json` (Forever's own creatures' ranks,
  which Questie's traces don't give) and `points.json` (where Wowhead's
  players met a creature or an object, by zone: the addons' cross-check and
  a roaming rare's haunts, loaded as spawns of source wowhead).
  `bin/names.ts` and `bin/wowhead-points.ts` fetched or seeded them once;
  they are hand tools, run only when something is missing, never by a job.
- `.github/workflows/db.yml`: both databases built, tested and published as
  the latest release (`db-<commit12>`, the last commit that changed them);
  `bin/get.ts` downloads them (`--tag`: one release's, which must be there).
- `.github/workflows/addon-data.yml`: an addon's game data built again,
  called by each addon's daily `game-data.yml` (Hearthtale, the Codex,
  Yonder, Second Wind) with its own generators (`generate`), the files a
  pull request carries (`paths`), its checks (`check`), Hearthtale's
  journals compared (`before`, `report`), addon-kit beside it (`kit`): the
  databases of the wow-data checked out downloaded, a pull request only when
  a generated file changes, never merged by itself. A caller needs "Allow
  GitHub Actions to create and approve pull requests".
- `bin/latest.ts`: newer builds than the pins (`--write`, `--next FILE`,
  `--summary FILE`); the databases' newer commits, told only. `bin/path.ts`:
  a cached file's path, for the addons' Python scripts.
- `.github/workflows/pins.yml`: daily, a pull request moving the pins (never
  merged by itself); `ci.yml`: `bun run check`, and the explorer's.
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
again from the pins.

Three sources (the user's call, 14 October 2026: fewer sources, fewer
errors, less dependence): the client, Questie, the Classic database. Wowhead
is frozen data, not a source a build or a job asks.

## Conventions

- Conventional Commits, lowercase subjects; no AI co-author trailers.
- Commit locally; ask before any push.
- `bun run check` (typecheck, tests) before committing.
