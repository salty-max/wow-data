// pfQuest's database (MIT, shagu/pfQuest at its pin): where every creature
// and object stands, a zone (AreaTable id) and a point on its map (percent):
// db/units.lua and db/objects.lua, read line by line.
import { readFileSync } from "node:fs";
import { repoFile } from "./github";

export type PfSpawn = { id: number; x: number; y: number; zone: number };

export async function pfSpawns(kind: "units" | "objects"): Promise<PfSpawn[]> {
  const out: PfSpawn[] = [];
  let id = 0;
  for (const line of readFileSync(await repoFile("pfquest", `db/${kind}.lua`), "utf8").split("\n")) {
    const head = line.match(/^ {2}\[(\d+)\] = \{/);
    if (head) {
      id = Number(head[1]);
      continue;
    }
    const c = line.match(/^ {6}\[\d+\] = \{ ([-\d.]+), ([-\d.]+), (\d+),/);
    if (c && id) out.push({ id, x: Number(c[1]), y: Number(c[2]), zone: Number(c[3]) });
  }
  return out;
}
