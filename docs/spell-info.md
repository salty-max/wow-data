# The spell tables

Built 3 November 2026 for Primer (the class guide), which fact-checks a
rotation and draws spell icons. Two derived tables in both databases
(schema.sql, "spells"), from the client's own tables on wago.tools at the
pins; the tables they come from are in too, whole. All of them exist at both
pinned builds (checked: Classic Era 1.15.9.70576, Forever 1.60.1.70790).
Nothing reads them yet except Primer's next generator.

Looking: `bun bin/card.ts spell <id or exact name> [--game classic|forever]`.

## The client's tables (client_*, whole)

`SpellMisc` (icon id, school, attributes, the cast time, duration and range
rows a spell uses), `SpellPower` (power type and cost), `SpellCooldowns`,
`SpellCategories`, `SpellCastTimes`, `SpellRange`, `SpellDuration`,
`SpellRadius`, `SpellShapeshift` (the forms a spell needs),
`SpellShapeshiftForm` (their names), `SpellEquippedItems` (the weapon it
needs), `SpellAuraOptions`, `SpellTargetRestrictions` and
`ManifestInterfaceData` (a file's id to its path: the client's own file list,
35,759 rows on Classic, 134,284 on Forever). Classic Era's `SpellRange` has no
Forever-only columns and Forever's `SpellCastTimes` no `PerLevel`: both are
kept as the client has them.

## `spell_info`: one row a spell (31,174 Classic, 31,939 Forever)

| Column | What it holds |
|---|---|
| `icon_file_id`, `icon_path` | `SpellMisc.SpellIconFileDataID` and its path from `ManifestInterfaceData`, no `.blp` (`Interface\ICONS\ability_rogue_ambush`). The case is the client's: Classic's are lower case, Forever's mixed (`Ability_Rogue_Ambush`); `SetTexture` does not care. Power type -2 is health. 31,051 and 31,751 have one. |
| `school_mask` | 1 physical, 2 holy, 4 fire, 8 nature, 16 frost, 32 shadow, 64 arcane. |
| `passive`, `attributes_0` | `Attributes_0` bit 6 (0x40). 300 Classic class_spell rows (non-rune) are passive, 140 Forever. |
| `cast_ms` | `SpellCastTimes.Base`; 0 is instant. |
| `range_min/max`, `…_friend` | yards, hostile and friendly; 0 is self or melee (a melee spell is 5 yd: Combat Range). |
| `duration_ms` | `SpellDuration`; -1 until cancelled. |
| `cooldown_ms` | what a player waits: the larger of `recovery_ms` (the spell's own) and `category_cd_ms` (its category's). Classic keeps Retaliation's 30 minutes in the category's, so a consumer reading `recovery_ms` alone would see none. |
| `category` | the shared-cooldown category (several spells wait on one). |
| `gcd_ms`, `gcd_category` | `StartRecoveryTime` (1,500, or 1,000 for energy), null: off the global cooldown. |
| `power_type`, `cost`, `cost_pct`, `cost_per_second` | `SpellPower` order 0: 0 mana, 1 rage, 3 energy. **Rage is stored in tenths by the client (150 is 15 rage) and divided here**; the UI source cannot say it (`ui.ts find` has no rage text), Heroic Strike's 15 and Whirlwind's 25 are the check. `cost_pct` is a percent of base mana. Two rage spells cost 0.1. A spell with a second power row (`OrderIndex` 1) keeps only the first. |
| `stance_mask`, `stance_mask_hi`, `stance_exclude`, `…_hi` | `SpellShapeshift`: bit n-1 is `SpellShapeshiftForm` n; null or 0 is any form. Battle Stance 17 (bit 16, 65536), Defensive 18 (131072), Berserker 19 (262144), Cat Form 1, Bear Form 5, Dire Bear 8. Hamstring is 327680 (Battle or Berserker). `exclude` is a form it can **not** be used in: bit 30 is form 31 (Moonkin Form), which Cat Form, Tranquility and Rejuvenation exclude (1073741824). |
| `weapon_class`, `weapon_subclass`, `weapon_invtypes` | `SpellEquippedItems`: class 2 is a weapon, `subclass` a mask of weapon subclasses (Heroic Strike's 173555). |

### Where it is weak

- **Forever's tables are Forever's.** A spell the Forever client lost (the old
  Classic ids its trainers and talents still name: Faerie Fire (Feral) 16857,
  Tiger's Fury's later ranks) has **no row**: 243 of Forever's 2,075 non-rune
  class spells. Its name is Classic's (below), its cost and cooldown are not
  known. Forever also re-did some spells (Tiger's Fury 30 s and no cost,
  Thunder Clap Battle or Defensive, Retaliation 15 minutes): the row is
  Forever's, never Classic's.
- `cost` is what the client lists. A cost scaled by level, by talents or by
  a stance is not in it, and `cost_pct` is of base mana, not of the pool.
- Talent and passive spells have rows but their cost is meaningless; use
  `passive`.
- A spell with more than one `SpellMisc`, `SpellCategories` or
  `SpellCooldowns` row for difficulty 0 keeps the first.
- The weapon masks are the client's `ItemSubclass` bits; this repository does
  not name them.
- The UI source has no spell data: the checks are the client's own icon file
  list (`ui.ts texture` agrees the icon files exist in both clients) and what
  Classic is known to do.

## `spell_text`: descriptions with their `$` put in (English)

One row for each spell's description and each aura description
(`kind` `description` or `aura`; 17,624 and 17,838 descriptions). `text` has
the tokens the tables can say replaced, `complete` is 1 when none is left.
Done by `src/spellText.ts` (tested): `$s1`/`$m1`/`$M1` the effect's points
(Classic Era: `EffectBasePoints`, plus 1 when the effect has a die, and a die gives "x to y"; Forever:
`EffectBasePointsF`), `$d` the duration, `$t1` a tick, `$o1` the total over
time, `$a1` the radius, `$x1`, `$q1`, `$e1`, `$b1`, `$h`, `$n`, `$i`, `$u`,
`$r`, another spell's `$12345s1`, `$@spelldesc123`, `$@spellname123`, `${…}`
sums of those, `$/10;s1`, `$*2;s1`, and `$lone:many;`.

What stays as written (the row is not `complete`): `$?s123[a][b]` and `$?a…`
(asks whether the player knows a spell or has an aura), `$g…:…;` (a gender),
`$<ticks>` and `$<mult>` (names set in a `$<…>=` elsewhere in the text, in
Rip's table of damages), `$PL` (the player's level), any `$s`/`$m`/`$o` of an effect whose points grow with the player's level (`EffectRealPointsPerLevel`: Lightning Bolt, most casters' damage: the tooltip depends on the level), `$f1` (not checked
against the game, so not guessed: Ferocious Bite's), `$AP`, and any index the
spell has no effect, duration or radius for. A token never becomes a wrong
number: it stays whole.

The first
count of the audit was 154 of 159 Warrior descriptions holding a token. Other languages are not resolved: their rows stay in `name` with the
tokens.

## Faerie Fire (Feral) and the other dropped ids

Forever's `class_spell` still lists Classic's talent ranks and lessons
Forever's client has lost, so a class spell with no name takes **Classic's**
name in every language, source `classic` (the trades' lessons do the same,
`docs/sources.md`): 2,915 `name` rows for 265 spells on Forever (224 non-rune class spells,
the rest runes); the class spells named in neither client are told in
`docs/class-coverage.md`. 16857 reads "Faerie Fire (Feral)" now. It is the name only: no
level, no description, no `spell_info` row.
