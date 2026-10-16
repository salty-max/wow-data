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
  they are hand tools, run only when something is missing, never by a job
  (`names.ts --gaps`: only what the database names in no way in that
  language; `--readable`: of the objects, the texts read; `--ids`: these
  alone. Forever's new creatures in Spanish, Russian, Portuguese, Korean
  and Chinese, 15 October 2026, both games' in Italian and Mexican Spanish,
  and the texts read and the riddles' objects in every language). A name Wowhead gives in brackets is the English its client
  shows where the language has none: the build records it as that
  language's name (the English one, of the source `english`: no
  translation, which a glossary leaves out), so every language names what
  its client shows.
  `pages-<locale>.json`: Wowhead's pages of Forever, every quest (texts in
  English, German, French and Spanish; in English its info box's level,
  zone, giver and ender), the creatures' and objects' gaps, the books'
  missing languages and what its Latest Additions hold that no database
  knows, fetched by a Wowhead tab (`bin/wowhead-tab.js`, its how-to; it hands
  them to Ravenpost's inbox) and taken, then frozen, by `bin/wowhead-pages.ts`
  (`queue --keys` the tab's jobs, `pull`, `freeze`: one compact page a line,
  the texts the game's own, `src/gametext.ts`). `src/wowheadPages.ts` loads
  them into Forever's database after the books: a gap of the other sources
  filled (they win a fact they have), Forever's new quests, creatures,
  objects and books added (source wowhead), the creatures' lines in
  `npc_line`; Wowhead's own codes left out (an "uncategorized" creature, a
  quest object's category, a scaling level).
- The TBC Anniversary client's items, `data/tbc/items.json` (`bin/tbc-items.ts
  <ids>`, a hand tool: its ItemSparse on wago.tools, every language, frozen
  with its build): what an addon's TBC package names and neither client has
  (Second Wind's tools: TBC's own potions, bandages, medallions), given to
  Classic Era's database (the TBC packages read Classic Era's files), source
  `tbc`, where it names no such item.
- Players' facts, `data/players/<game>/<locale>.json`: what the game told
  the players who said yes to the addons' opt-in (the kit's `K.collect`:
  quests' texts, givers and enders, creatures' names, levels, ranks, types
  and families (by their ids; an older file's words matched to them)
  and approximate sightings, NPCs' lines, loot), sent by Ravenpost to its
  inbox (salty-max/ravenpost's `inbox/`, its README.md:
  https://ravenpost-inbox.vercel.app, a private Blob store, no database;
  players link it with Battle.net from Ravenpost, one account one voice) and
  merged from it daily by `bin/players.ts` (`pull`, then `done` once the pull
  request holds them; `INBOX_URL`, `INBOX_TOKEN`), run by
  `.github/workflows/players.yml` (a pull request, never merged by itself:
  strangers' facts are read by a hand first, the owner's phone told; its
  waiting branch merged into again). Each fact keeps who saw it, a hash
  of the account and the fact (no one's facts tied together), 20 at most.
  `src/players.ts` loads them last, as source `players`, where no other
  source has the fact: the value most players saw (`MIN_SEEN`: one is
  enough while they are few), a level the range of all seen, NPCs' lines in
  `npc_line`, loot only for a creature or an object no source gives any.
  NPC positions go to `creature_sighting` as observer coordinates, even
  when a creature already has known spawns. They never add to `spawn` and
  must never resolve an exact riddle spot. Multiple sightings are retained.
  The collector marks checked world NPCs with `world: true`, rejecting
  player-controlled units and purging its older unchecked NPC cache. The
  inbox rejects unchecked legacy NPC entries and keeps type/family ids.
  Dashboard merge counts are new archived observations, not database gaps.
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
is frozen data, not a source a build or a job asks. Players' facts (15
October 2026) fill what none of them has, first of all Forever's new content
before the others know it.

## Conventions

- Conventional Commits, lowercase subjects; no AI co-author trailers.
- Commit locally; ask before any push.
- `bun run check` (typecheck, tests) before committing.
