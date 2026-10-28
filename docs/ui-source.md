# Blizzard's UI source

What the game's own frames and textures say, pinned like the data and read
through one tool, so no session guesses a frame path or fetches a branch it
likes. Added 28 October 2026.

## The pins (`ui-pins.json`)

| Pin | Repository, branch | Carries | Sure? |
|---|---|---|---|
| `ui-classic` | Gethe/wow-ui-source `classic_era` | 1.15.9 (70576) | exact: the client pinned in `pins.json` is 70576 |
| `ui-forever` | Gethe/wow-ui-source `forever` | 1.60.1 (70532), 22 October | the nearest: the client is 70658, Gethe's branch had not caught up. The Camelot UI moves little in a few days, but a frame added in those builds is not here |
| `ui-textures-classic` | Gethe/wow-ui-textures `classic` | 1.13.5 (34911), 2020 | art only, old: the last commit of the branch |
| `ui-textures-live` | Gethe/wow-ui-textures `live` | 9.2.7 (45114), 2022 | art only, old, and GitHub cuts its file list short (about 67,000 of the files) |

They live in `ui-pins.json`, not `pins.json`: `pins.json` is an input of the
database tag, and a UI pin is no database's. `bun bin/latest.ts` tells a
newer commit on each branch and whether a source is behind the pinned client
(never followed: bump by hand, then read what `ui.ts` says for the claims
below). The source is one tarball per pin, unpacked once into
`.cache/github/Gethe/wow-ui-source/<commit12>/`; a texture picture is one
raw file in `.cache/github/Gethe/wow-ui-textures/<commit12>/`. No job
fetches either.

Whether a texture **exists** is not Gethe's answer but the client's: wago.tools'
`ManifestInterfaceData` at the pinned build (every file under `Interface\`
the client ships, exact for both games). Gethe's PNGs are only the picture.

## The tool (`bin/ui.ts`)

```bash
bun wow-data/bin/ui.ts frame MinimapCluster.IndicatorFrame.MailFrame     # both games
bun wow-data/bin/ui.ts frame InboxFrame --game classic --xml            # with the XML lines
bun wow-data/bin/ui.ts find MiniMapMailFrame [--all]                    # Lua and XML, which game has it
bun wow-data/bin/ui.ts texture 'Interface\Icons\INV_Misc_Note_01'       # exists per game, picture path and size
bun wow-data/bin/ui.ts pins
```

- `frame Name.Key.Key`: the named frame, then each `parentKey` inside it
  (and inside the templates it inherits). One card per match: file and
  lines, attributes (`inherits`, `hidden`, `virtual`…), size, anchors, what
  is inside, the frames around it. `$parent` names are resolved
  (`$parentText` inside `InboxTooMuchMail` is `InboxTooMuchMailText`). A
  path not in the XML says so, names similar frames and the Lua lines that
  mention the first name.
- `find`: every line of the source's Lua, XML and TOCs with the text, per
  game.
- `texture`: exists or not per game (client), near misses in the folder,
  and the picture in the mirrors with its size and the art's build.

## What it cannot say

- What the live client does. A frame made in Lua under a computed name, a
  hotfix, a build after the pinned commit: a frame the source lacks is a
  **guess**, and the code or doc that uses it says so (`-- from memory, not
  in the source`). A test in the game settles it.
- Forever's source is a few builds behind its client (above), and both
  Forever platform folders (`Camelot/`, `Mainline/`) can define a frame:
  the card prints each, read which one the TOC loads.
- The pictures are old art. Look at one for its layout; the client's art
  may differ.

## The rule

A claim about a Blizzard frame (name, `parentKey` path, size, anchors), a
texture or icon path, or a frame API goes through `ui.ts` first. The
reviewer checks it. See the family's `CLAUDE.md` and addon-kit's.
