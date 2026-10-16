# Data for Yonder's Finds

Updated 16 October 2026. Finds entries are material items, never nodes. Every
added ore, stone, gem, cloth, leather and hide needs its own authored and
translated naturalist's note in Yonder. The tables below supply evidence for
those pages, not finished prose or a list of required discoveries.

## Preferred sources

The current pinned client, QuestieDB and ClassicDB were checked first.
Items, icons, translated names, profession identities, recipe reagents,
ordinary cloth drops and the original-world mining/skinning tables already
exist. Questie's newer objects have coordinates but no mining rank or loot
template. Its newer leather `npcDrops` records do not distinguish ordinary
drops from skinning.

The missing facts were recovered from Wowhead's Forever pages on 16 October
using the extraction functions in `bin/wowhead-tab.js`. Pages were read in a
browser and processed locally. The overlay/background queue was not used for
this capture. Evidence is frozen in `data/wowhead/forever/pages-enUS.json`
and `points.json`. Builds make no requests to Wowhead.

## Querying the data

- `gathering_node`: object ID, profession SkillLine ID, minimum rank, source
  and optional introduced build. Requirements are resolved through each
  client's Lock table first, including rank zero and all eight slots.
  Frozen Wowhead facts fill objects with no known requirement. They do not
  invent client Lock IDs or replace known requirements.
- `loot`: what each source provides, following references where present.
  **ClassicDB and the existing players importer use loot template IDs.
  Questie and Wowhead use entity IDs.** For ClassicDB, join through an
  object's `loot_id` or a creature's `loot_id`/`skin_loot_id`. Never join all
  providers to a template ID. Reference tables belong to their provider.
- `spawn`: existing coordinates plus Wowhead's independently recorded
  points, by area. These are source locations, not collectible pages.
- `name`: game labels by kind, ID and locale. `client_Item.IconFileDataID`
  supplies item icons. Names and icons already cover the baseline items.
- `client_SpellReagents`, `client_SpellEffect`, `client_SkillLineAbility`
  and spell names/descriptions provide evidence for uses in the notes. For
  example, spell 2657 consumes Copper Ore 2770. Keep original-world uses
  separate from Forever's recipes. Do not invent lore or infer a use from
  the English item name.

Every new Wowhead loot row has null probability and stack counts. The site's
observed counts, which can include other seasons, are not server drop rates.
Known preferred-source yields, including nested reference yields, are not
duplicated. Reimporting the evidence is idempotent. Missing entities/items
do not generate orphan loot rows.

## Recovered evidence

| Source object | Mining rank | Recorded yields | Added-in build |
| --- | --- | --- | --- |
| 562111 Poor Copper Vein | 1 | Copper Ore 2770, Rough Stone 2835 | 1.60.1.69893 |
| 566779 Heavy Thorium Vein | 300 | None recorded | 1.60.1.69913 |
| 656332 Chunk of Amber | 1 | Copper Ore, Rough Stone, shells/other finds, Fossilized Insect 275842, Tuft of Hair 275843 | 1.60.1.69893 |
| 656333 Large Chunk of Amber | 1 | Those yields plus Malachite 774, Tigerseye 818, Shadowgem 1210 and Pyrite 249391 | 1.60.1.69893 |
| 439628 Fool's Gold Vein | 175 | Jade 1529, Lesser Moonstone 1705, Citrine 3864, Fool's Gold 219445 | 1.15.2.54092 |
| 439778 Starsilver Vein | 245 | Starsilver Ore 219486 | 1.15.2.54092 |

The last two pages explicitly carry Season of Discovery's added-in build.
Keeping their source facts does not establish current Forever availability.
Do not put their exclusive items in Forever completion requirements without
separate evidence. Similarly, amber's shells and other junk are source
yields, not proposals for ore/gem pages.

Wowhead points were frozen for the five objects with a map. Poor Copper's
points include Mulgore, absent from its current Questie record. Heavy
Thorium has no recorded positions. Do not make up a location from its name.

Pyrite 249391 and Bauxite 249425 were also checked through their explicit
mined-from-object lists. These give 12 and three source object IDs,
respectively, broader than the current Questie records. Existing Questie
relations remain in place and only missing relations are added.

Explicit skinning sources, distinct from existing Questie ordinary drops:

| Material | Creature IDs |
| --- | --- |
| Pristine Leather 249427 | Lakota'mani 3474, Thunderstomp 5832, Daggerfang 270693 |
| Pristine Hide 249428 | Maddened Rotclaw 271334 |

Fel Hide 248824, Fel Leather 248825 and Pristine Scale 249429 were checked
too. Their pages provide no explicit skinning/mining source list. No
acquisition facts were invented for them. This does not prove the items are
unobtainable.

## Maintaining the frozen evidence

The existing browser fetcher now retains object mining/herbalism yields and
an item's explicit `skinned-from` / `mined-from-object` lists. Ordinary `dropped-by`
lists are deliberately not relabelled as skinning. Its existing overlay
(`__wd.panel()`) includes a Materials row. `__wd.start(1)` starts the queue.

Targeted queues avoid refetching every quest:

```sh
bun bin/wowhead-pages.ts queue --kind item --ids 249427,249428 --keys --refresh
bun bin/wowhead-pages.ts queue --kind object --ids 562111,656332,656333 --keys --refresh
```

Pass the returned keys to `__wd.addJobs(keys, { refetch: true })` in the
Wowhead tab, use the usual export/import or Ravenpost relay, then freeze:

```sh
bun bin/wowhead-pages.ts import exported-pages.json
bun bin/wowhead-pages.ts freeze --kind item --ids 249427,249428
bun bin/wowhead-pages.ts freeze --kind object --ids 562111,656332,656333
```

Targeted freezing preserves other pages already frozen in the repository,
even when they are absent from this machine's cache. The extractor parses
literal listview data without executing page scripts. Added-in build strings
survive escaped quotation marks in the page's info box.

Positions can be seeded from saved browser pages with the existing tool:
`bun bin/wowhead-points.ts forever --seed DIR`, whose expected filenames are
`forever-page-object-<id>.html`.

Before committing, rebuild both databases and run `bun run check`. The
regressions cover source namespaces, reference yields, preference order,
idempotency, invalid/missing entities, zero rank, escaped page metadata and
the new facts in each game. Yonder can then query the refreshed databases
to curate item pages and write their individual notes.

## Validation on 16 October

Both local databases were rebuilt from the current pins. All 60 wow-data
tests passed, including database integration assertions. The import adds six
missing requirements, 24 missing object-to-item source relations and four
explicit skinning relations in Forever.
Classic receives the normalized original-world
requirements without Forever's additions. Yonder's audit reads the refreshed
databases, with five audit regression tests passing.

The update is local until pushed and published. The previously published
database snapshot does not contain these additions yet. Existing uncommitted
recipe work in `schema.sql` and `src/build.ts` was preserved separately.
