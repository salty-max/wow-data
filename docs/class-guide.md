# The class guide's tables

Built 3 November 2026 for the class guide addon (`ideas/class-guide.md`, M1).
Primer's `scripts/guide.ts` reads them (3 November 2026). Per class and tree: `docs/class-coverage.md`. A spell's cost, cast time, cooldown, stance, school, passive flag, icon and resolved description are in `docs/spell-info.md`. Four tables in both databases (schema.sql, "classes"),
all from the client's own tables on wago.tools at the pins (`src/classGuide.ts`,
run after `teachings`); the client's tables they come from are in too, whole:
`client_Talent`, `client_SpellLevels`, `client_SkillLineXTraitTree`,
`client_TraitNode`, `…Entry`, `…Definition`, `…XTraitNodeEntry`,
`…GroupXTraitNode`, `…GroupXTraitCond`, `client_TraitCond`, `client_TraitEdge`
(Classic Era has `Talent`, `SpellLevels` and a nine-row stub of five trait tables; the other four are not in its client).
English names only were needed: a talent's and a spell's names are `name`
rows by spell id, already in every language; so is the class's and the tree's
(`talent_tab`). Nothing was added to `name`.

Looking: `bun bin/card.ts talents Warrior --game forever --full` (or a tree:
`talents "Feral Combat"`), `bun bin/card.ts class Warrior --game classic`.

## What the tables hold

- **`spell_level`**: `SpellLevels.SpellLevel` for DifficultyID 0, one row a
  spell with a `SpellLevel` above 0 (11,105 Classic, 11,446 Forever). `level` is the level a spell is
  learned, never `BaseLevel` (kept as `base_level`, told only): on Forever
  8,935 of 12,985 rows have `BaseLevel` 0 beside a `SpellLevel`, and talent
  spells have a base level of 0 in both.
- **`talent`**: the talent window's cells. `tab_id` is a `TalentTab` (the tree),
  `row` and `col` from 0 at the top left, `spell_id` rank 1's spell, `req_points`
  five a row (Blizzard's `PLAYER_TALENTS_PER_TIER = 5` in the Vanilla frame:
  `ui.ts find PLAYER_TALENTS_PER_TIER`; its API `tier` is 1-based, ours is
  not), `min_level` = 10 + `req_points` (the first point is at 10: this is the
  rule, not a column of the client).
  - **Classic Era**: the `Talent` table, 432 rows, `id` = `Talent.ID`;
    `talent_rank` has each rank's spell (1,357), `talent_prereq` the
    `PrereqTalent` with the rank (65). A talent is known when its highest
    rank's spell is.
  - **Forever** (465 talents): retail's trait engine. `Talent` is still in the
    client with the same 432 rows but it is not what the window shows. The
    live tree of each class is named by `SkillLineXTraitTree` (nine rows). The
    client also carries older partial trees of the same classes (Mage 1058,
    Shaman 1081, Druid 1083, the stub 1066 and 1187–1189): not read. Per tree,
    the **class** is the one Classic's talents on its nodes belong to (a vote,
    no ties allowed), a **tab** is a cluster of node columns (gaps over 1,500),
    named by the same vote, and a node's **row and column** are its position
    in cells of 600 from the tab's origin, the origin from the points the
    nodes' groups ask (`TraitCond.SpentAmountRequired`, 5 a row), else from
    Classic's tiers. `req_points` agrees with the game's own condition for
    every node that has one (a check the build counts: 0 off). A node outside
    the window (a coordinate past 20,000: Lightning Reflexes' old node at x
    102,800, Improved Serpent Sting at y 39,300, an old Holy Specialization at
    y 21,300) is left out. `id` is Classic's `Talent.ID` when the node's spell
    is a Classic talent's rank 1 (340 of 465), else the trait node's id
    (100,000 and up, no clash); `node_id` and `entry_id` are what
    `C_Traits.GetNodeInfo` and `GetEntryInfo` take. 125 talents are new to
    Forever, 11 moved to another tree (`era_tab_id` ≠ `tab_id`; Improved Slam,
    Fury → Arms). `talent_rank` is empty: the trait engine keeps a node's rank,
    and a rank spell of Classic's is not known to be what it grants.
    `talent_prereq` is `TraitEdge` of type 2 or 3 (type 0 is a line drawn, both
    ways, and made a cycle in Balance), left needed before right. The edge has
    no rank: the **required talent's last rank** is filled in (all 65 of
    Classic's prerequisites ask it, a test), `edge_type` keeps the type. One
    edge pointed the wrong way (Intimidation needing Bestial Wrath, two rows
    below it; Bestial Wrath needing Intimidation is the real one) and is
    dropped: a requirement stands above or beside the talent it opens (72 rows
    left). No talent has two prerequisite edges after the drop; type 2 against 3
    is a reading (not tried in the game; `C_Traits.GetNodeInfo`
    `canPurchaseRank` settles it).
- **`class_spell`**: `SkillLineAbility` rows with exactly one class in the
  `ClassMask`, one row a class and spell. `level` is `spell_level`'s. `kind`:
  `trainer` (a trainer's lesson teaches it: a spell with a learn effect, type
  36, giving this one, and `trainer_spell` has the lesson), `quest` (a quest's
  reward spell or cast is such a lesson: the stances, Bear Form, Cat Form),
  `talent` (a rank of any Classic talent, on Forever too, where those rank spells have no name or level), `start` (`AcquireMethod` 2, given at creation), `rune` (Season of
  Discovery's engravings and runes: `AcquireMethod` 3 or the skill lines
  Engraving and Runes), `other` (what is left: passives, racials, spells
  with no level, and spells whose row has no class mask in one class's skill
  line: Innervate). Every rank of every talent is a row of kind `talent` too
  (the skill line of its `SkillLineAbility` row, which has no class mask; `acquire` -1 and line 0 where it has no row; 4 November 2026). `lesson_spell_id` is what `trainer_spell.spell_id` matches
  (never `spell_id`): `from trainer_spell where spell_id = <lesson>` is "which
  trainers"; `trainer_level` is what the Classic database's rows say beside the
  client's `level`.

## Where each source is weak

- **Forever's trainers are Classic's** (the Classic database's, `source`
  `classicdb`, the same 32,963 rows as classic.db) and 1,195 of Forever's
  1,281 `trainer` rows take their lesson from the **Classic client** (it is
  `lesson_source = 'classic'`: Forever's client has lost those lesson spells,
  not the spells they teach). What it is worth: *which spells a class buys*
  is right where Forever kept Classic's spells, and a spell Forever added or
  re-levelled is not in them: Slam's new first rank at 20 (1240193),
  Tactical Mastery at 14, Spearing Strike are `other` with no trainer. The
  **level** is Forever's own (`spell_level`) and the trainers' `reqlevel` is
  told beside it: 9 differ on Forever (Berserker Rage 30 against 32,
  Righteous Fury 10 against 16, Mana Tide Totem 38 and 48 against 48 and
  58), 4 on Classic (Intimidating Shout 22 against 20, which the Classic
  database has wrong or the client moved). Where they differ the client wins.
  Whether a Forever trainer actually teaches a spell is for the game to say.
- **Forever's trait mapping is inferred**, not read from a table that says
  "this tree is Arms": the tab and the cell come from a vote and the node's
  position, validated by the points the game asks (0 off) and by every cell
  being unique (the build stops otherwise). The client's `C_Traits` is the
  authority at runtime (`GetNodeInfo` for the node, `activeEntry` for the
  rank): `node_id` is the join. Not tested in the game: the M0 probe
  (`GetCombatConfigIDForSpecGroup`, `C_Traits.GetTreeNodes`) settles that the
  trees match. Unlike Classic's, Forever's node positions have no row and
  column fields: the only evidence of "row 4, column 1" is the position and
  the cells' agreement with the conditions. Choice nodes: none in the nine
  live trees (the build counts them; it reads the first entry).
- **Classes have no specialisation on either game**, so `class_spell` is a
  class's whole book: a tree's spells are those in the tree's skill line
  (`skill_line_id`: Arms 26, Fury 256, Protection 257).
- **`SkillLineAbility` is not a clean class book**. Season of Discovery's
  engravings are in both clients (Forever's too), so a consumer of Classic Era
  filters `kind` to `trainer`, `quest`, `start` and `talent`; `other` holds
  racials, passives, pet and item skill lines and spells whose names the
  client has but whose level is 0. Spells with no level (`level` null: 50 of
  Classic's 299 `other`, 253 of Forever's 598, and 32 of Forever's `trainer`
  rows, old Classic ids its `SkillLineAbility` still lists) are kept as rows.
- **Quests**: `quest` rows are the lessons given by quest rewards in the
  database (Path of Defense and its racial copies for the Warrior's Defensive
  Stance); a class quest `quest_reward` lacks, or one Forever changed, shows as
  `other`.
- **Not read**: the trait tables' specialisation sets, the second talent
  group (dual spec) and hero and sub-trees: Classic has none and Forever's nine
  trees have none (`TraitSubTree` is not in the client).
- Spells keep their *ranks* as separate ids, so a class's page names a
  family by its highest known rank; the card prints `Rank N` from
  `spell_subtext`.

## A talent spell's own level is unreliable

`spell_level` of a talent's spell is not when the talent is taken. Death Wish
shows 1, Concussion Blow 30, Sweeping Strikes 1 on Classic Era and 30 on
Forever (Death Wish 1 on both). **A consumer uses `talent.min_level`** (10 plus
`req_points`) for a talent, and `spell_level` only for a spell a class buys or
is given. The spell tables' cost, cooldown and stance for a talent spell are
fine (`docs/spell-info.md`).

## What can stop the build

The Forever talent mapping stops the build rather than publish wrong cells:
not nine live trees, a tree whose class or a cluster whose tab is not clearly
one (no talent of Classic's on it, or a vote closer than 4 to 1), two nodes in
one cell, a negative row or column, a node off the 600 grid, or a node asking
other points than its row's five. A Forever patch that moves a tab's origin or
adds a tree is the likely cause of a red daily job: read `talent:` in the
build's log, then `classGuide.ts`'s constants. Nothing reads the tables yet,
so a stop costs the databases, not an addon.

## For the addon (M2's generator)

- Join a talent to a known state: Classic `talent_rank` (highest rank known),
  Forever `node_id` (`C_Traits`).
- A line shows from `level`, a trainer's name from `trainer_spell` through
  `lesson_spell_id` and `creature`/`name`; none of it is a saved id.
- No addon reads these tables yet, so no addon's generated files changed, and
  there is no `saved-ids.json` entry to add here: the daily jobs' tables are
  untouched (checked: classic.db and forever.db rebuilt from the same pins,
  every earlier table identical row for row).
