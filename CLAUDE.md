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
  (`repos`: allthethings, questiedb, pfquest, classicdb). The one place a
  build or a database is pinned: an addon never pins its own.
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
  the Classic database's world through `src/sql.ts`); `src/db.ts`
  (`openDb(game)`, read only; `dbPath`). IDs everywhere, names only in
  `name`, every row its `source`. `test/classic.test.ts` checks it against
  facts from the game (skipped where it isn't built).
- `bin/latest.ts`: newer builds than the pins (`--write`, `--next FILE`,
  `--summary FILE`); the databases' newer commits, told only. `bin/path.ts`:
  a cached file's path, for the addons' Python scripts.
- `.github/workflows/pins.yml`: daily, a pull request moving the pins (never
  merged by itself); `ci.yml`: `bun run check`.

## How the addons use it

They sit beside it (`~/code/wow-addons/<addon>`) and import
`../../wow-data/src/...` from their `scripts/`, or call `bin/path.ts` from
Python. Moving a script onto the kit must leave its generated files byte for
byte the same (the addon's own `--check`, and Hearthtale's golden check). An
addon's daily job checks out wow-data's main beside it and builds its data
again from the pins.

Wowhead: its tooltip service answers scripts (names in every language,
fetched slowly, PLAN.md step 3); its pages don't, so its book texts are
imported by hand from a browser into a snapshot committed here.

## Conventions

- Conventional Commits, lowercase subjects; no AI co-author trailers.
- Commit locally; ask before any push.
- `bun run check` (typecheck, tests) before committing.
