# wow-data

The World of Warcraft game data the addons are built from (Hearthtale,
Lorekeeper's Codex, Yonder), pinned in one place and downloaded once.

- **The game client's own tables**, from [wago.tools](https://wago.tools):
  Classic Era and World of Warcraft: Forever, each at a pinned build, in
  every client language.
- **[QuestieDB](https://github.com/Questie/QuestieDB)**, at a pinned commit:
  the world as Questie keeps it, for both games (quests, who gives them and
  what they ask, NPCs and objects and where they stand, Forever's own
  content), merged by Questie's own engine, with its translations in nine
  languages.
- **The [Classic database](https://github.com/cmangos/classic-db)**
  (cmangos, GPL-3.0), for what Questie lacks: books, what NPCs say, loot
  odds, trainers, creature types and models, the world's coordinates.

Three sources, one owner a table. Names Questie doesn't translate (Forever's
own content) come from Wowhead, fetched once and frozen in `data/wowhead/`,
as are the French book pages a browser saved from it.

The pins live in `pins.json`. Every file downloads once into `.cache/`,
under its build or commit, so the addons beside this folder share it.

## The database

Everything above becomes one SQLite file per game, `classic.db` and
`forever.db` (`schema.sql`, PLAN.md): creatures, objects and where they
stand, items, quests with what they ask and who gives them, loot, vendors,
trainers, books and their pages, what NPCs say, the paths creatures walk,
the client's own tables whole, and every name in every language. Every link
is the game's id, every row says where it comes from. Forever's is Questie's
Forever: Classic's world and Forever's own quests, creatures and objects.

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

## The explorer

The databases in a browser: any name in any of the eleven languages or an
id, found as you type; a page for every quest, creature, item, object, zone,
faction and spell, every other thing on it a link by its id; where things
stand, drawn on the zone's own map from the client (every area explored,
Forever's new zones too); every table to browse, filter and sort; and a
read-only SQL console with the schema completed as you type and saved
queries (`explorer/queries.json`, kept in the repository).

```bash
bun run explore              # http://localhost:4100
bun run explore:dev          # hot reload while working on it (:4101)
```

It reads `.cache/db/` (build or get the databases first) and keeps what it
makes beside them: the names' search index and the zone maps
(`.cache/explorer/`, made once a build). React, Vite and Tailwind in
`explorer/src`, a Bun server in `explorer/server.ts` and `explorer/api/`.

## Use

The addons sit beside this folder (`~/code/wow-addons/<addon>` and
`~/code/wow-addons/wow-data`) and import it:

```ts
import { wago, wagoFile } from "../../wow-data/src/wago";       // a client table
import { classicDump, repoFile } from "../../wow-data/src/github"; // a database's file
import { CLASSIC, FOREVER } from "../../wow-data/src/pins";
const areas = await wago("forever", "AreaTable", "frFR");          // rows by column
```

A Python script reads the databases with `py/wowdata.py`:

```python
sys.path.insert(0, os.path.join(ROOT, "..", "wow-data", "py"))
from wowdata import db
db("forever").execute("SELECT name FROM name WHERE kind = 'area' AND id = 12 AND locale = 'frFR'").fetchone()
```

or asks for a file's path:

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
the new pins. A build moves only within its product and major version
(Forever on its own product, `wowf`, since 23 October 2026: its beta was
filed beside Mists of Pandaria's, 5.5). A game's builds under another
product and the databases' newer commits are reported, never followed:
those changes are made by hand.

## License

MIT. The data it downloads keeps its own licenses.
