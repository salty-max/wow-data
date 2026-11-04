# Forever's talents the guides name and the tables lack

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
