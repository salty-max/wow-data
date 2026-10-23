# wow-data's sources

What each source gives the databases and the rules that decide between
them (moved from CLAUDE.md on 20 October 2026). The build and the files:
`docs/architecture.md`. Finds' gathering data in detail:
`docs/finds-materials.md`.

Three sources (the user's call, 14 October 2026: fewer sources, fewer
errors, less dependence): the client, Questie, the Classic database. Wowhead
is frozen data, not a source a build or a job asks. Players' facts (15
October 2026) fill what none of them has, first of all Forever's new content
before the others know it.

## Wowhead, frozen

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

## Gathering data for Finds

- Gathering data for Finds: `gathering_node` resolves the client's Lock
  requirements and fills unknown ones from frozen Wowhead pages.
  `src/gathering.ts`, `docs/finds-materials.md`. The tab fetcher also retains
  object yields and explicit mined/skinned item sources (`item` jobs).
  Targeted `wowhead-pages.ts queue` and `freeze` accept `--kind item|object
  --ids ID,ID` and optional `--locale`. The overlay has a Materials row.
  Loot IDs are provider-specific: ClassicDB/players use templates,
  Questie/Wowhead use entities. Keep Wowhead counts out of server odds.
  A Questie or Wowhead row whose creature or object no source has is left
  out last (`unknownLoot`): Questie keeps an item's sources it can't
  resolve, and Wowhead's Forever lists carry Season of Discovery's (98 such
  in Forever, 20 October 2026; 19 rows once the SoD pass below has run). The
  46 with Forever's evidence (looted by its players in Questie's traces, or
  dropping an item only Forever has) had their Wowhead pages frozen instead:
  Forever kept SoD's world books.

## Season of Discovery in Forever

- Season of Discovery in Forever (`seasonOfDiscovery`, before `unknownLoot`;
  the user's rule, 20 October 2026): Wowhead's Forever environment answers
  for SoD's ids, so Questie's Forever delta-base and Wowhead's pages carry
  SoD wholesale. Of the ids in Questie's SoD base (`questieSeason`,
  `bin/questie-season.lua`, with its Forever traces), a creature, an object
  or a quest stays where Forever shows it: met by its players (Questie's
  traces, the players' facts: seen, heard, giving or taking a quest),
  holding something only Forever has (an item or a quest Classic Era's
  client lacks), changed by Forever on Wowhead's page (`changed`, its
  envChange lines: a value Forever has, "Classes none instead of Mage"
  included, not a line saying "no longer", one starting "Level none", "Title
  <none>" or "Family none", one ending "instead of", or a reward renamed
  DEPRECATED; `wowheadChanged`), or starting, ending or asked for by a SoD
  quest that stays or a quest only Forever has, or dropping an item such a
  quest asks for. Not evidence: Wowhead's "unchanged" (SoD's copy), its
  "added in patch" (SoD's world books say 1.15.0, Forever's players looted
  them), Latest Additions, either client's tables (both hold SoD's quests
  and items). The rest goes with every row naming it (217 creatures, 9
  objects, 28 quests: Ashenvale's battle, the Nightmare incursions, the
  Firelands in Searing Gorge, the Scarlet Enclave, SoD's herbs and veins,
  the Duskwood Missions), but its names: `left_out` lists it, its `name` rows
  stay in every language, for the journals that may hold its id (the user's
  call, 20 October 2026: names only, nothing else of it). A SoD item stays (the client has it), its Questie
  and Wowhead drops, contents, vendors and recipe sources only where
  Forever's players looted it or such a quest asks for it (Waylaid Supplies
  dropped nowhere; the rune scrolls and The Cook in the Cage's key kept).
  Three SoD things Forever's quests use had their Wowhead pages frozen:
  Wendel Mathers (The Cook in the Cage), the Strange Orb, Illari's Loot
  Cache.

## The trades' recipes

- The trades' recipes (the cookbook's ground, 19 October 2026): `item_spell`
  (the client's ItemEffect: what an item casts, by trigger), `teaching` (a
  recipe item's use or a trainer's lesson and the recipe it teaches: the
  client's learn effect, else the name within the skill line; a use spell
  many items share, Forever's "Learning", never stands for all of them;
  Forever's trainers are the Classic database's, their lessons Classic
  spells Forever's client lacks: resolved through the pinned Classic
  client, source `classic`), `recipe_source` (every way a trade's recipe is
  learned: with the skill, from a trainer, a recipe item (Forever's item
  names its recipe directly, trigger 6), a quest; the skill it takes to
  learn it; a quest's own in `quest.skill_value`, the Classic database's
  RequiredSkillValue: Smoked Desert Dumplings' quest asks 285), `vendor.max_count`/`restock_s` (a limited stock). A recipe's
  yellow and grey are the client's SkillLineAbility's trivial ranks (in
  Forever too), its orange from `recipe_source.skill_value`. The Wowhead
  tab's item jobs also keep who sells, drops or rewards an item
  (`itemSources`: only where no other source has the item, a test realm's
  vendor left out, no drop odds): Forever's own recipes, most of which no
  source knows before launch (players' facts will).

## Reputation

- Reputation (the reputation road's ground, 23 October 2026,
  `ideas/reputation-road.md` §6): what a quest gives is `quest_reward` kind
  `reputation`, Questie's figures (the Classic database's for a quest
  Questie lacks). The two disagree on most quests they share (250 against
  100, 350 against 150): neither is checked against Era's game yet, the
  players' facts will settle it. `quest_standing` is the standing a quest
  asks before it's offered (Questie's requiredMinRep and requiredMaxRep, the
  Classic database's RequiredMinRep and RequiredMaxRep for its own quests),
  apart from `quest_objective` kind `reputation`, a standing the quest asks
  you to reach. `item_reputation` is the standing an item asks: the
  client's ItemSparse first, the Classic database's item_template for the
  rest (Era's client gates no capital's goods). `kill_reputation` is the
  Classic database's creature_onkill_reputation (its 1.12 figures): up to
  two factions a creature, the last standing a kill still counts at (the
  Brood of Nozdormu's Ahn'Qiraj trash: Hated, so until Hostile), the side
  where the source makes it the Alliance's or the Horde's. Forever has no
  source of its own for kills: the old factions' figures are Classic's (an
  inference), its new factions' come with the players' facts.
  `reputation_turnin` joins a repeatable quest's items to its reputation:
  the repeatable flag is the Classic database's, so Forever's own quests
  (the Craftsman's Writs) aren't in it. Questie's own flag (917 of
  Forever's quests) is left out on purpose: filling `special_flags` with it
  would change what Hearthtale's scripts read.

## Reviewed scenery (landmarks)

- Kill reputation by hand: `data/kill-reputation.json` (the user's call, 23
  October 2026), loaded after the Classic database's
  `creature_onkill_reputation`, in both games, each entry with its why and
  its source (`source` guides). `add`: rows the dump lacks (the Syndicate's
  humanoids raising Ravenholdt, 5 a kill at most, to Friendly). `caps`: the
  last standing a faction's kills count at where Era's guides disagree with
  the dump (the Bloodsail stop at Friendly). Unverified in game: a test
  there moves an entry or removes it.
- Reviewed scenery positions: `data/landmarks.json`, imported by
  `src/landmarks.ts` into `landmark`, with an owning map, observation date
  and evidence. Source `owner-report` is explicit human review, not an
  automatic NPC sighting: the owner's look in the game, or at the client's
  map in a viewer (classicwowmapexplorer for Arathi's carved LOL, 22
  October 2026), the evidence saying which and whether it was checked in
  game. A landmark has its own text ID and never invents
  a game object or spawn. Per-game applicability and unverified clients stay
  in its evidence. Yonder reads this table for the abandoned Dun Morogh camp,
  corrected in game to 39.2, 67.6, instead of borrowing a bear's spawn.
- Source `client-map` (22 October 2026): a placement in the pinned client's
  own map files, for scenery the tables don't hold (a model's texture, a
  painted slope). `bin/placements.ts <game> <map> <model ids> <tiles>
  --ui-map N` reads the tiles' ADT files at the pinned build (wago.tools,
  into the cache) and prints each placement of the models: its unique id,
  world position, the area of its map chunk and its percent on the zone's
  map. The evidence names the build read, the file, the model and the
  unique id, and whether the other game places it the same: the landmark is
  frozen there, and a moved pin doesn't vouch for it (read it again). Yonder's smiling log on the
  Webwinder Path (Stonetalon 57.9, 67.6) is the first.

## The TBC Anniversary client's items

- The TBC Anniversary client's items, `data/tbc/items.json` (`bin/tbc-items.ts
  <ids>`, a hand tool: its ItemSparse on wago.tools, every language, frozen
  with its build): what an addon's TBC package names and neither client has
  (Second Wind's tools: TBC's own potions, bandages, medallions), given to
  Classic Era's database (the TBC packages read Classic Era's files), source
  `tbc`, where it names no such item.

## Players' facts

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
