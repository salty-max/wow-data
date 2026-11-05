# Forever's talents the guides name and the tables lacked

**Hotfix feed checked, 5 November 2026 (launch day): it adds nothing, and Shank
and Poised are not talents.** wago.tools' hotfixes (https://wago.tools/hotfixes,
an Inertia page: the rows are JSON in the `data-page` attribute, props
`hotfixes`, 25 a page) were read for the question "does the server push the
trait wiring the client tables lack". It does not, so no build step was added.
What was checked, so nobody retraces it:

- **The filter.** `filter[table_name]=` does nothing (20.8 million rows). The
  page's one filter is a free-text box, query `search=`, matched against each
  row's `search_text` (`<locale> <push> <record> <build> <table> <data json>`,
  lower case), every word must match: `search=70790 traitnodeentry`,
  `search=1329283`. The site has no API route for hotfixes (only the page);
  rows carry `data` as a positional array with no column names. `status` is 1
  added, 2 deleted, 3 invalidate, 4 not public.
- **Coverage.** The feed holds Forever's builds 70707, 70755 and 70790, regions
  91, 93 and 95 (locales enUS, esMX, frFR, zhCN), all created at each build's
  ingest (70790: 4 Nov 2026 23:15 to 23:43 UTC). No trait row is newer than
  70790: these are the hotfix records the build ships, not a later server push.
- **Trait tables.** 2,585 rows for `70790 trait` (TraitNode, TraitNodeEntry,
  TraitDefinition, TraitNodeXTraitNodeEntry, TraitNodeGroupXTraitNode,
  TraitEdge, TraitCond, TraitDefinitionEffectPoints and others);
  `SkillLineXTraitTree` has 13 rows, none Forever's (last build 65300). Every
  added row of region 91, enUS (150 definitions, 395 nodes, 165 entries, 30
  node-entry links, 661 group links, 57 edges) **is already in the cached
  70790 table with the same values**, and every deletion names a record the
  table already lacks. wago.tools' tables at the pinned build already contain
  the hotfixes: applying them changes no row, and `bin/tree-diff.ts` would see
  the same trees. Reckless Swings (TraitDefinition 145966, spell 1329555, node
  113636) came through them and is in `forever.db`.
- **Shank and Poised.** Their spell ids (1329283, 1329549, 1328825 to 1328829)
  occur in the feed only in spell tables (Spell, SpellName, SpellEffect,
  SpellMisc, SpellLevels, SkillLineAbility, ...), at builds 70707, 70755 and
  70790, **in no trait table**. They are not missing talents: `SkillLineAbility`
  59899 teaches the Rogue (class mask 8) Shank at level 24, 59900 its second
  rank (1329549, superseding 1329283) at 44, 59888 Poised, a passive, at 18
  (59889: a Druid variant, 1328829, at 32). `class_spell` holds all four
  (kind `other`). Blizzard's launch notes call them talents; the game files
  teach them as spells, so a guide that counts them as talents counts more than
  any trait tree holds.
- **Warrior.** Every `SkillLineAbility` spell of the Warrior and Rogue masks
  is in `class_spell` (none left out). `forever.db` has 53 Warrior `talent`
  rows (Reckless Swings among them) and the guides count 54: no trait row,
  spell or hotfix in the files explains the one more. It stays unnamed. Treat
  it like Hunter's 51st below, a guide's miscount (or an ability counted as a
  talent, as with Shank) until the game says otherwise; the probe that settles
  it is `C_Traits.GetTreeNodes` and `GetNodeInfo` in the live client.
- **Result.** Nothing known to be missing: of the 12 talents the notes name,
  ten are talent nodes (see below) and Shank and Poised are class spells, all
  in the data.

**Update, 4 November 2026 (evening, three hours before launch): build 70790
carries them.** `forever.db` is now built at `1.60.1.70790` (wowf, created 4
Nov 18:08 UTC, version still 1.60.1 so the TOC interface stays 16001): 470 live
trait nodes against 468, 467 `talent` rows against 465 (128 new to Forever
against 125; 339 take Classic's id against 340). Of the 12 talents the notes
name, **ten are in**: Reckless Swings (Warrior Fury, 1329555, node 113636, 1
rank), Improved Whirlwind (1310315, 2 ranks, was Raging Blows), Blood Splatter,
Flash of Steel (5 ranks), Composure, Quick Getaway (1310728, 2 ranks, was
Quietus), Boot Knife (5), Death Mark, Coup de Grace and Efficient Strikes.
**Still missing: Shank and Poised** (no spell, entry or node; Poised's spells
are in `SpellName` since 70755 but nothing points at them). The five removed
(Murder, Improved Distract, Quietus, Cutthroat, Thousand Cuts) are gone from
the live trees. Also changed: Flurry 3 ranks, Improved Tactical Mastery 3,
Bloodthrill 2, Seal Fate 3, Lethality 2, Camouflage 3, Opportunity 5, Lava
Burst replaced by Call of Thunder (Shaman node 104760), Relentless Strikes and
Dual Wield Specialization re-added as new nodes (113633, 113635), Mutilate and
Venom moved. Two `talent` ids left (Murder 274, Improved Distract 110868),
both retired by the rework, and no addon saves a talent id. `class_spell`
lost Shaman's Lava Burst (408490, 408491, 1238299, 1238300, 1238373, 1238376),
Priest's Binding Heal (401937, 1240770 to 1240773, in `class_spell` only) and
Rogue's Venom 1310703 (the new Venom is 1329328): spell ids, so each addon's
ids guard is the check. The build's stops
(grid, points, unique cells) all passed unchanged. The text below is the
analysis at 70755 and stays as the record of why the data lacked them.

Looked into 4 November 2026 (launch eve), because launch-week guides count more
talents than `forever.db` holds. Verdict: **the client's tables at the pinned
build 70755 (the newest wowf build wago.tools lists) do not carry them**. Our
mapping drops nothing, so nothing in the data changed. The pin refresh at launch
is what brings them, if the launch build carries them in its files at all.

## Counts

| Class | `talent` rows | Trait nodes in the live tree | Guides | Verdict |
|---|---|---|---|---|
| Warrior | 52 | 52 (tree 1117) | 54 (timesaver.gg, two Mobalytics Arms guides) | A: Reckless Swings has no spell, entry or node in any build |
| Paladin | 51 | 51 (1100) | 51 (timesaver.gg), 52 (one guide, since retracted) | none missing: Voice of Truth is a level 20 spell (1310897, 3 min, immunity to silence and interrupt), not a talent |
| Hunter | 50 | 52 (1091), 2 retired off-window | 51 (one source, unnamed) | no 51st node anywhere; see below |
| Rogue | 53 | 53 (1111) | 2 Nov rework | A: the rework is not wired into the trees |
| Mage / Priest / Shaman / Warlock / Druid | 53 / 52 / 50 / 52 / 52 | 53 / 53 (1 retired) / 50 / 52 / 52 | not compared | equal to their nodes |

Every live node has a talent row except three nodes that stand off the window
(`FAR` in `src/classGuide.ts`): Hunter's Lightning Reflexes (node 104982, x 102,800) and
Improved Serpent Sting (105003, y 39,300), Priest's Holy Specialization (105865, y 21,300).
Each shares its group with the node that replaced it (110859, 110870, and the
Priest's one in the tree) and has no edge: they are retired nodes the client
still lists, not talents. No node has several entries (no choice nodes), none
is without an entry, none is in no group, none has a vote or position the
build could mis-assign (the build also stops on an unclear one).

## The evidence (tables in `.cache/wago/forever/<build>/`)

1. **Older builds could not be compared.** wago.tools answers a request for an
   older wowf build (70245 to 70707) with the current build's tables, byte for
   byte (same md5 as 70755, SpellName included, while the SpellName files cached
   in October when those builds were current all differ). The trait tables of
   an older build are therefore not available now, and whether a talent was in
   an earlier build is **not known** from them. The only history is the October
   `SpellName` caches (below).
2. **Names.** `SpellName` at 70755 has no Reckless Swings, Blood Splatter,
   Flash of Steel, Composure, Quick Getaway, Boot Knife or Efficient Strikes.
   `TraitDefinition` has no override name for them either (one row, 134246).
3. **Spells without wiring.** Death Mark (1316709, 1325756 to 1325758) is in
   `SpellName` from build 70425 and Poised (1328825 to 1328827 and 1328829, a
   passive that cheapens the next ability at full energy) only at 70755, both
   after the earlier caches, but no `TraitDefinition` points at either.
   Reckless Swings and Voice of Truth as a talent never appear: in every cached
   `SpellName` (70291 to 70755) there is no Reckless Swings, and Voice of Truth
   (1310897) is there from 70291 as a spell. Coup de Grace (1310709) has two
   unwired entries (137860, 137861), and Flawless Execution (1310711) a second,
   unwired definition (142617) beside its live one.
4. **Orphans.** 102 of 662 `TraitNodeEntry` rows are held by no node (retired
   talents, the Rogue's two Coup de Grace entries 137860 and 137861, Improved
   Stings 137859, and the placeholder `Unknown` ones). Their ids all lie below
   the newest entry a live node holds (141293): they are old work, not the rework.
5. Removed talents Murder, Improved Distract, Quietus and Thousand Cuts are
   still in the Rogue's live tree at 70755 (Cutthroat 462708 too), which is the
   pre-rework tree.

So the 2 November beta notes and Reckless Swings are changes Blizzard made
after the data we can read. wago.tools' tables are the client's own files; a
change delivered as a hotfix (a server push) would not be in them (not
verified: the probe is `C_Traits.GetTreeNodes` in the live client, or a wowf
build newer than 70755).

## Hunter's 51st

The research counted 51 and could not name the missing one (`hunter-overview.md`).
The tables have 52 nodes, 2 retired (above), 50 live. The only candidate in the
files is Improved Serpent Sting, which is retired and replaced by Improved Stings
(shares group 11371). Treat the 51 as a guide's miscount until the game says
otherwise.

## What the next pin refresh must bring

Warrior: Reckless Swings (Fury, 16-point row), Improved Whirlwind, Flurry cut to 3
ranks. Rogue: Shank (24), Poised (18), Blood Splatter, Flash of Steel, Composure,
Quick Getaway, Boot Knife, Death Mark, Coup de Grace and Efficient Strikes (the
renames); Murder, Improved Distract, Quietus, Cutthroat and Thousand Cuts gone.

When a newer wowf build exists (`bun bin/latest.ts` says so; the pins job at
04:17 UTC carries it into a pull request):

```bash
bun bin/tree-diff.ts 1.60.1.70755      # the old build against the new pin: nodes added, lost, moved, and the names above in or out
bun bin/build.ts forever && bun bin/card.ts talents Rogue --game forever
```

A new node may trip the build's stops (two nodes in one cell, an unclear tab
vote, a node off the 600 grid): read `talent:` in the log and `src/classGuide.ts`.
Primer's check against the guides is where the counts are compared.
