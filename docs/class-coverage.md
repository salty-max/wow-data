# What the class guide holds, class by class

Counted 4 November 2026 from `classic.db` and `forever.db` by `bun bin/coverage.ts`
(`src/coverage.ts`), held to a floor by `test/coverage.test.ts`: a pin bump that
empties a table for a class, loses a tree or a talent's facts fails the check.
Nothing here is filtered to a class: every table is built for all nine classes
(Warrior 1, Paladin 2, Hunter 3, Rogue 4, Priest 5, Shaman 7, Mage 8, Warlock
9, Druid 11) and every tree. `bun bin/card.ts class|talents|spell <name or id>
--game classic|forever` answers for each.

Columns: **Spells** are `class_spell` rows without Season of Discovery's runes
(engravings, `kind` rune: 588 on Classic, 664 on Forever, kept as rows).
**Level** has a spell_level (a talent's own level is unreliable, use
`talent.min_level`). **Named** has an English name. **In spell_info** has the
cost, cooldown, stance, icon (`docs/spell-info.md`). **Text whole** and **Text
open** count `spell_text` descriptions with every `$` put in or not.
**Trainer rows** are lessons a trainer sells. **Ranks** are `talent_rank` rows.

### classic

| Class | Races | Spells (no runes) | Trainer | Quest | Talent | Start | Other | Level | Named | In spell_info | Icon | Text whole | Text open | Trainer rows | Talents | Ranks | Prereqs (no rank) | New | Moved | Talents in spell_info |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Warrior | 8 | 316 | 95 | 5 | 172 | 6 | 38 | 288 | 316 | 316 | 316 | 263 | 31 | 95 | 52 | 172 | 9 (0) | 0 | 0 | 52 |
| Paladin | 2 | 343 | 123 | 4 | 140 | 5 | 71 | 228 | 343 | 343 | 343 | 237 | 61 | 123 | 44 | 140 | 5 (0) | 0 | 0 | 44 |
| Hunter | 5 | 431 | 155 | 6 | 148 | 7 | 115 | 275 | 431 | 431 | 431 | 338 | 32 | 155 | 46 | 148 | 6 (0) | 0 | 0 | 46 |
| Rogue | 7 | 278 | 104 | 1 | 155 | 5 | 13 | 147 | 278 | 278 | 278 | 271 | 4 | 104 | 51 | 155 | 7 (0) | 0 | 0 | 51 |
| Priest | 5 | 376 | 177 | 9 | 144 | 9 | 37 | 228 | 376 | 376 | 376 | 266 | 94 | 177 | 47 | 144 | 7 (0) | 0 | 0 | 47 |
| Shaman | 3 | 338 | 157 | 3 | 150 | 4 | 24 | 214 | 338 | 338 | 338 | 228 | 100 | 157 | 46 | 150 | 5 (0) | 0 | 0 | 46 |
| Mage | 4 | 327 | 158 | 2 | 143 | 2 | 22 | 308 | 327 | 327 | 327 | 211 | 109 | 158 | 49 | 143 | 7 (0) | 0 | 0 | 49 |
| Warlock | 4 | 351 | 144 | 8 | 154 | 4 | 41 | 180 | 350 | 350 | 350 | 253 | 68 | 144 | 50 | 154 | 9 (0) | 0 | 0 | 50 |
| Druid | 2 | 367 | 179 | 5 | 151 | 7 | 25 | 220 | 366 | 366 | 366 | 261 | 89 | 179 | 47 | 151 | 10 (0) | 0 | 0 | 47 |

| Class | Tree | Talents | Rows | Points | New | Moved | Prereqs |
|---|---|---|---|---|---|---|---|
| Warrior | Arms (161) | 18 | 7 | 59 | 0 | 0 | 4 |
| Warrior | Protection (163) | 17 | 7 | 53 | 0 | 0 | 3 |
| Warrior | Fury (164) | 17 | 7 | 60 | 0 | 0 | 2 |
| Paladin | Retribution (381) | 15 | 7 | 45 | 0 | 0 | 1 |
| Paladin | Holy (382) | 14 | 7 | 45 | 0 | 0 | 2 |
| Paladin | Protection (383) | 15 | 7 | 50 | 0 | 0 | 2 |
| Hunter | Beast Mastery (361) | 16 | 7 | 48 | 0 | 0 | 2 |
| Hunter | Survival (362) | 16 | 7 | 48 | 0 | 0 | 2 |
| Hunter | Marksmanship (363) | 14 | 7 | 52 | 0 | 0 | 2 |
| Rogue | Combat (181) | 19 | 7 | 62 | 0 | 0 | 3 |
| Rogue | Assassination (182) | 15 | 7 | 46 | 0 | 0 | 2 |
| Rogue | Subtlety (183) | 17 | 7 | 47 | 0 | 0 | 2 |
| Priest | Discipline (201) | 15 | 7 | 48 | 0 | 0 | 2 |
| Priest | Holy (202) | 16 | 7 | 48 | 0 | 0 | 2 |
| Priest | Shadow (203) | 16 | 7 | 48 | 0 | 0 | 3 |
| Shaman | Elemental (261) | 15 | 7 | 46 | 0 | 0 | 2 |
| Shaman | Restoration (262) | 15 | 7 | 52 | 0 | 0 | 1 |
| Shaman | Enhancement (263) | 16 | 7 | 52 | 0 | 0 | 2 |
| Mage | Fire (41) | 16 | 7 | 46 | 0 | 0 | 2 |
| Mage | Frost (61) | 17 | 7 | 50 | 0 | 0 | 2 |
| Mage | Arcane (81) | 16 | 7 | 47 | 0 | 0 | 3 |
| Warlock | Destruction (301) | 16 | 7 | 53 | 0 | 0 | 3 |
| Warlock | Affliction (302) | 17 | 7 | 49 | 0 | 0 | 3 |
| Warlock | Demonology (303) | 17 | 7 | 52 | 0 | 0 | 3 |
| Druid | Feral Combat (281) | 16 | 7 | 46 | 0 | 0 | 3 |
| Druid | Restoration (282) | 15 | 7 | 53 | 0 | 0 | 3 |
| Druid | Balance (283) | 16 | 7 | 52 | 0 | 0 | 4 |

### forever

| Class | Races | Spells (no runes) | Trainer | Quest | Talent | Start | Other | Level | Named | In spell_info | Icon | Text whole | Text open | Trainer rows | Talents | Ranks | Prereqs (no rank) | New | Moved | Talents in spell_info |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Warrior | 10 | 202 | 95 | 5 | 56 | 7 | 39 | 179 | 202 | 198 | 198 | 165 | 28 | 95 | 52 | 0 | 8 (0) | 12 | 2 | 52 |
| Paladin | 3 | 273 | 123 | 4 | 75 | 3 | 68 | 176 | 266 | 237 | 237 | 165 | 70 | 123 | 51 | 0 | 8 (0) | 22 | 2 | 51 |
| Hunter | 8 | 415 | 155 | 6 | 71 | 5 | 178 | 322 | 412 | 385 | 385 | 307 | 25 | 155 | 50 | 0 | 8 (0) | 15 | 0 | 50 |
| Rogue | 9 | 196 | 102 | 1 | 53 | 6 | 34 | 139 | 192 | 192 | 192 | 170 | 19 | 102 | 53 | 0 | 8 (0) | 9 | 2 | 53 |
| Priest | 6 | 365 | 173 | 9 | 97 | 4 | 82 | 263 | 365 | 326 | 326 | 195 | 117 | 173 | 52 | 0 | 8 (0) | 15 | 0 | 52 |
| Shaman | 5 | 284 | 152 | 3 | 72 | 3 | 54 | 215 | 284 | 265 | 265 | 160 | 102 | 152 | 50 | 0 | 7 (0) | 12 | 1 | 50 |
| Mage | 6 | 312 | 158 | 2 | 109 | 2 | 41 | 244 | 312 | 254 | 253 | 120 | 132 | 158 | 53 | 0 | 7 (0) | 6 | 0 | 53 |
| Warlock | 5 | 282 | 144 | 6 | 58 | 4 | 70 | 175 | 282 | 253 | 253 | 181 | 65 | 144 | 52 | 0 | 8 (0) | 19 | 0 | 52 |
| Druid | 4 | 310 | 179 | 5 | 62 | 4 | 60 | 228 | 305 | 286 | 286 | 186 | 92 | 179 | 52 | 0 | 10 (0) | 15 | 4 | 52 |

| Class | Tree | Talents | Rows | Points | New | Moved | Prereqs |
|---|---|---|---|---|---|---|---|
| Warrior | Arms (161) | 17 | 7 | 47 | 3 | 1 | 4 |
| Warrior | Protection (163) | 18 | 7 | 50 | 5 | 1 | 2 |
| Warrior | Fury (164) | 17 | 7 | 53 | 4 | 0 | 2 |
| Paladin | Retribution (381) | 17 | 7 | 44 | 5 | 1 | 2 |
| Paladin | Holy (382) | 17 | 7 | 46 | 10 | 0 | 3 |
| Paladin | Protection (383) | 17 | 7 | 49 | 7 | 1 | 3 |
| Hunter | Beast Mastery (361) | 16 | 7 | 44 | 2 | 0 | 3 |
| Hunter | Survival (362) | 18 | 7 | 52 | 6 | 0 | 2 |
| Hunter | Marksmanship (363) | 16 | 7 | 52 | 7 | 0 | 3 |
| Rogue | Combat (181) | 17 | 7 | 44 | 2 | 1 | 3 |
| Rogue | Assassination (182) | 17 | 7 | 48 | 2 | 1 | 2 |
| Rogue | Subtlety (183) | 19 | 7 | 47 | 5 | 0 | 3 |
| Priest | Discipline (201) | 18 | 7 | 51 | 7 | 0 | 3 |
| Priest | Holy (202) | 17 | 7 | 48 | 3 | 0 | 2 |
| Priest | Shadow (203) | 17 | 7 | 49 | 5 | 0 | 3 |
| Shaman | Elemental (261) | 16 | 7 | 46 | 3 | 0 | 3 |
| Shaman | Restoration (262) | 16 | 7 | 51 | 3 | 0 | 1 |
| Shaman | Enhancement (263) | 18 | 7 | 51 | 6 | 1 | 3 |
| Mage | Fire (41) | 17 | 7 | 46 | 1 | 0 | 2 |
| Mage | Frost (61) | 18 | 7 | 48 | 2 | 0 | 2 |
| Mage | Arcane (81) | 18 | 7 | 45 | 3 | 0 | 3 |
| Warlock | Destruction (301) | 16 | 7 | 50 | 7 | 0 | 3 |
| Warlock | Affliction (302) | 17 | 7 | 46 | 5 | 0 | 2 |
| Warlock | Demonology (303) | 19 | 7 | 50 | 7 | 0 | 3 |
| Druid | Feral Combat (281) | 20 | 7 | 50 | 8 | 1 | 5 |
| Druid | Restoration (282) | 16 | 7 | 51 | 3 | 2 | 3 |
| Druid | Balance (283) | 16 | 7 | 46 | 4 | 1 | 2 |


## What the all-class pass added (4 November 2026)

- **Talents are class spells.** A talent's spells mostly have a
  `SkillLineAbility` row with no class mask (Sweeping Strikes in Arms' line,
  Death Wish in Fury's, Concussion Blow in Protection's, Omen of Clarity in
  Balance's), and the class book wanted a mask: every rank of every talent is
  a `class_spell` row of kind `talent` now (1,078 added on Classic, 348 on
  Forever), with the row's skill line and acquire method, or 0 and -1 where the
  spell has no row at all.
- **Other spells with no class mask.** 87 on Classic (Innervate), 216 on
  Forever (Omen of Clarity, whose talent Forever dropped), kind `other`: spells
  with no mask in a skill line that holds one of the class's talents (found by
  id; the Hunter's Beast Training, the pets', the mounts' hold none). Weak:
  a line also holds a few spells nobody learns (Felfire, Lightwell Renew,
  Comprehend Scroll), told here, not filtered by name.
- **Who may be what.** `class_race` (CharBaseInfo: 40 combinations on Classic,
  56 on Forever) and `class_spell_race`: one row a (class, spell, race) for the
  spells only some of a class's races learn (100 rows for 78 spells on
  Classic, 129 for 98 on Forever). The masks are 64 bits over two columns, a
  bit a race's `PlayableRaceBit` (Forever's races 95 and 96 are bits 32, 33);
  a mask of every race, or any row without one, is no restriction. Also whole
  in `client_*`: `CharBaseInfo`, `ChrClassesXPowerTypes`, `SkillRaceClassInfo`.
- **Forever's prerequisites.** Classic's 65 prerequisites all ask the required
  talent's last rank (a test), so Forever's 72 take that as `rank` (inferred,
  `edge_type` still tells they came from the trait edges). The one edge that
  ran both ways (Intimidation needing Bestial Wrath, two rows below it) is
  dropped: a requirement is above or beside the talent it opens.

## What stays open, per game

Nothing here needs a test before launch; each line says where the answer could
only come from.

### Both games

- **A role per tree** (tank, healer, damage; melee or ranged): the client has a
  roles mask per class (`client_ChrClasses.RolesMask`), not per tree. A hand
  table of 27 rows, in Primer's data (its voice decides).
- **Spell text with the level in it**: `$s1` of an effect whose points grow with
  the player's level (`EffectRealPointsPerLevel`), `$?s…` (does the player know
  it), `$g…` (a gender), `$<ticks>` (Rip's table of damages) stay as written
  (the `Text open` column). Only the game's own tooltip, at runtime, fills them.
- **Costs that scale** (a cost reduced by a talent, a stance or the level):
  `spell_info.cost` is the base the client lists.
- **Other languages' `$` tokens** are not resolved (English only, Primer's scope).

### Classic Era

- Two non-rune class spells have no English name in the client: Warlock 435395
  and Druid 414854 (start spells, Season of Discovery ids).
- 19 (Mage) to 171 (Warlock) non-rune spells a class have no level (`level`
  null): talent ranks, passives and the spells of the kind `other`. A talent's
  `min_level` is the answer for the first; the others are given, not learned.
- Race restrictions are the client's masks only: a racial that a class gets is
  not tied to the class (no table in the client says it).

### Forever

- **Talent rank spells** (`talent_rank` is empty, 0 of 465): the trait engine
  keeps one spell a node and scales it by rank (`TraitDefinitionEffectPoints`
  (653 rows at the pinned build on wago.tools, not imported), whose curves are in tables this repository does not import:
  Curve, CurvePoint). The node's `max_rank` is known; per-rank numbers in a
  talent's text are not. A talent's description shows rank 1. Only the game's
  `C_Traits` at runtime says the rank someone has.
- **Trainer lessons are Classic's.** `class_spell.lesson_source = 'classic'`
  on 1,195 of 1,281 trainer rows (91 Warrior … 166 Druid): which spells a
  class buys is right where Forever kept Classic's spells; a spell Forever
  added (Slam 1240193 at 20, Tactical Mastery, Spearing Strike, Lacerate,
  Primal Bite, Feral Charge, Wild Growth) has no trainer row, and whether a
  Forever trainer sells a spell is for the game after launch.
- **Dropped Classic ids** have a name (from Classic's client) but no
  `spell_info`, no level, no description: Warrior 4, Paladin 36, Hunter 30,
  Rogue 4, Priest 39, Shaman 19, Mage 58, Warlock 29, Druid 24 non-rune class
  spells without a row. Their real replacements, where Forever renamed or re-ranked
  them, are not linked (no table says which new spell replaces an old id).
- **Nameless in both clients**: 92 Season of Discovery class_spell rows, plus
  the non-rune ones the `Named` column shows (Paladin 7, Hunter 3, Rogue 4,
  Druid 5).
- **Tabs and cells are inferred** (a vote and a position, validated against the
  points each row asks): only `C_Traits` settles them in the game.
- **Dual specialisation** and **hero talents**: no table in either client
  (a second talent group is runtime-only).
- 23 (Warrior) to 107 (Warlock) non-rune class spells a class have no level
  (the same kinds as Classic's, and old Classic ids).
