# wow-data

The game data the WoW addons are built from, pinned in one place and
downloaded once: one SQLite database per game (`.cache/db/classic.db`,
`forever.db`) that every addon's scripts query, built from the pinned
sources. Build-time tooling only: nothing here ships in an addon. Bun and
TypeScript (salty-max/wow-data). Read the family's CLAUDE.md
(`~/code/wow-addons/CLAUDE.md`) first.

## Where things are

| What | Where |
|---|---|
| The repository file by file: pins, cache, fetchers, the build, the workflows, the explorer, how the addons use it | `docs/architecture.md` |
| Each source and the rules between them: Wowhead frozen, Season of Discovery in Forever, recipes, landmarks, TBC items, players' facts | `docs/sources.md` |
| Finds' gathering data (nodes, yields, materials) | `docs/finds-materials.md` |
| The tables | `schema.sql` |
| Where the databases are going (the plan, its steps) | `PLAN.md` |
| Getting the data, for a person | `README.md` |
| The databases in a browser | `explorer/README.md` |

## Commands

```bash
bun run check                                   # tsc, bun test ./test (classic/forever tests skip what isn't built)
bun ../addon-kit/q.ts check -- bun run check    # the same, quiet, stamping the tree for the push
bun bin/build.ts <classic|forever|all>          # .cache/db/<game>.db from the pins
bun bin/get.ts [--tag db-<commit12>]            # the published databases instead of a build
bun bin/card.ts <npc|object|place|item|quest> <id or exact name> [--game classic|forever] [--full]
bun bin/path.ts db <game>                       # a database's path (wago, repo, pin, tree: a cached file)
bun bin/latest.ts                               # newer builds than the pins, told only
bun run explore                                 # the explorer (explore:dev; bun run --cwd explorer check)
```

Hand tools, never run by a job: `bin/names.ts` (`--gaps`, `--readable`,
`--ids`), `bin/wowhead-points.ts`, `bin/wowhead-pages.ts` (`queue --keys`,
`pull`, `freeze`; the tab is `bin/wowhead-tab.js`), `bin/tbc-items.ts
<ids>`. `bin/players.ts pull|done` is the players' facts job's.

## Hard rules

- `pins.json` is the one place a build or a database is pinned. An addon
  never pins, fetches or downloads a source of its own.
- Three sources (the user's call, 14 October 2026): the client, Questie,
  the Classic database. Wowhead is frozen data in `data/`, never fetched by
  a build or a job. Players' facts fill only what none of them has.
- IDs everywhere, names only in `name`, every row its `source`. One owner a
  table; names client > Questie > Classic database > Wowhead (with the
  exceptions in `docs/sources.md`).
- A field a script needs and the databases lack goes into `schema.sql` and
  the build, never a read of the raw files beside them.
- Moving a script onto wow-data leaves the addon's generated files byte for
  byte the same (its `--check`, Hearthtale's golden check).
- Season of Discovery leaves Forever except where Forever shows it (the
  user's rule, 20 October 2026: the evidence list in `docs/sources.md`).
- Players' sightings go to `creature_sighting`, never `spawn`, and never
  resolve a riddle's exact spot. Their pull requests are merged by hand.
- `bin/card.ts` before any query by hand.
- An explorer change: render the page and look at it before calling it done
  (headless Chrome when the browser pane is hidden).
- Conventional Commits, lowercase subjects, no AI trailers. Commit locally;
  ask before any push. `bun run check` before committing; the pre-push hook
  wants its stamp.
