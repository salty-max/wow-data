# wow-data

The World of Warcraft game data the addons are built from (Hearthtale,
Lorekeeper's Codex, Yonder), pinned in one place and downloaded once.

- **The game client's own tables**, from [wago.tools](https://wago.tools):
  Classic Era and World of Warcraft: Forever, each at a pinned build, in
  English and the other client languages.
- **The community databases**, at pinned commits: the
  [Classic database](https://github.com/cmangos/classic-db) (cmangos,
  GPL-3.0), [AllTheThings](https://github.com/ATTWoWAddon/AllTheThings) and
  [QuestieDB](https://github.com/Questie/QuestieDB) for Forever's own quests
  and creatures, and [pfQuest](https://github.com/shagu/pfQuest) (MIT) for
  where things stand. They hold what Blizzard never publishes: spawns, quest
  objectives, loot.

The pins live in `pins.json`. Every file downloads once into `.cache/`,
under its build or commit, so the addons beside this folder share it.

## The database

Everything above becomes one SQLite file per game, `classic.db` and
`forever.db` (`schema.sql`, PLAN.md): creatures, objects and where they
stand, items, quests with what they ask and who gives them, loot, vendors,
trainers, books and their pages, what NPCs say, the paths creatures walk,
the client's own tables whole, and every name in every language. Every link
is the game's id, every row says where it comes from. Forever's adds its own
quests, creatures and objects from AllTheThings and QuestieDB's traces.

```bash
bun bin/get.ts               # the latest published databases (GitHub release)
bun bin/build.ts all         # or build them from the pinned sources
```

```ts
import { openDb } from "../../wow-data/src/db";
const db = openDb("forever");
db.query(`SELECT n.name FROM quest_objective o
  JOIN name n ON n.kind = 'creature' AND n.id = o.target_id AND n.locale = 'frFR'
  WHERE o.quest_id = 182 AND o.kind = 'creature'`).all();  // [{ name: "Jeune troll Frostmane" }]
```

Python reads the same file with `sqlite3`.

## Use

The addons sit beside this folder (`~/code/wow-addons/<addon>` and
`~/code/wow-addons/wow-data`) and import it:

```ts
import { wago, wagoFile } from "../../wow-data/src/wago";       // a client table
import { classicDump, repoFile } from "../../wow-data/src/github"; // a database's file
import { CLASSIC, FOREVER } from "../../wow-data/src/pins";
const areas = await wago("forever", "AreaTable", "frFR");          // rows by column
```

A Python script asks for a file's path:

```bash
bun ../wow-data/bin/path.ts wago forever AreaTable frFR
```

## Keeping up with the game

```bash
bun bin/latest.ts            # newer builds than the pins?
bun bin/latest.ts --write    # and move the pins
```

`.github/workflows/pins.yml` does it every day and opens a pull request when
a build moves. Each addon's own daily job then builds its data again from
the new pins. A build moves only within its major version (wago.tools lists
Forever's beta, 1.60, beside Mists of Pandaria's, 5.5). Forever's builds
under another product and the databases' newer commits are reported, never
followed: those changes are made by hand.

## License

MIT. The data it downloads keeps its own licenses.
