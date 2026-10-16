import type { Database } from "bun:sqlite";
import type { Frozen } from "./wowheadPages";

/** Resolve the object's server lock through this client's Lock table.
 * A zero requirement is valid. No names or guessed node types are used. */
export function clientGathering(db: Database) {
  const insert = db.prepare("INSERT OR IGNORE INTO gathering_node (object_id, skill_line_id, min_skill, source) VALUES (?, ?, ?, 'client')");
  const locks = new Map((db.query("SELECT * FROM client_Lock").all() as Record<string, number>[]).map(r => [r.ID, r]));
  db.transaction(() => {
    for (const o of db.query("SELECT id, lock_id FROM object WHERE type = 3 AND removed IS NOT 1").all() as { id: number; lock_id: number }[]) {
      const lock = locks.get(o.lock_id);
      if (!lock) continue;
      for (let i = 0; i < 8; i++) {
        const skill = lock[`_Index_${i}`] === 3 ? 186 : lock[`_Index_${i}`] === 2 ? 182 : null;
        if (lock[`Type_${i}`] === 2 && skill && Number.isInteger(lock[`Skill_${i}`]) && lock[`Skill_${i}`] >= 0)
          insert.run(o.id, skill, lock[`Skill_${i}`]);
      }
    }
  })();
}

/** Frozen explicit gathering evidence, filling missing facts only.
 * Wowhead's counts combine observations and sometimes seasons. They are not
 * server probabilities, so loot chances and stack counts remain null. */
export function materialSources(db: Database, pages: Frozen, log: (s: string) => void) {
  const node = db.prepare("INSERT OR IGNORE INTO gathering_node VALUES (?, ?, ?, 'wowhead', ?)");
  const knownNode = db.prepare("SELECT 1 FROM gathering_node WHERE object_id = ?");
  const object = db.prepare("SELECT id FROM object WHERE id = ? AND removed IS NOT 1");
  const creature = db.prepare("SELECT id FROM creature WHERE id = ? AND removed IS NOT 1");
  const item = db.prepare("SELECT id FROM item WHERE id = ? AND removed IS NOT 1");
  const template = {
    object: db.prepare("SELECT loot_id AS id FROM object WHERE id = ?"),
    skinning: db.prepare("SELECT skin_loot_id AS id FROM creature WHERE id = ?"),
  };
  const rows = db.prepare("SELECT item_id, ref_id FROM loot WHERE kind = ? AND source_id = ? AND source = ?");
  const insert = db.prepare(`INSERT INTO loot (kind, source_id, item_id, source) VALUES (?, ?, ?, 'wowhead')`);
  const positiveId = (id: number) => Number.isSafeInteger(id) && id > 0;
  const expand = (kind: string, id: number, provider: string, target: number, trail = new Set<number>()): boolean =>
    (rows.all(kind, id, provider) as { item_id: number | null; ref_id: number | null }[]).some(r => {
      if (r.item_id === target) return true;
      if (!r.ref_id || trail.has(r.ref_id)) return false;
      return expand("reference", r.ref_id, provider, target, new Set([...trail, r.ref_id]));
    });
  let added = 0, requirements = 0;
  const add = (kind: "object" | "skinning", entity: number, material: number) => {
    if (!positiveId(entity) || !positiveId(material) || !item.get(material) || !(kind === "object" ? object : creature).get(entity)) return;
    const t = template[kind].get(entity) as { id: number | null } | null;
    // Classic rows use templates. Other providers use entity IDs. Existing
    // references count too, so a repeated source doesn't gain invented odds.
    if (t?.id && expand(kind, t.id, "classicdb", material)) return;
    if (expand(kind, t?.id ?? entity, "players", material)) return;
    if (["questie", "wowhead"].some(source => expand(kind, entity, source, material))) return;
    insert.run(kind, entity, material);
    added++;
  };
  db.transaction(() => {
    for (const [sid, o] of Object.entries(pages.object ?? {})) {
      const id = Number(sid);
      if (!positiveId(id) || !object.get(id)) continue;
      if (!knownNode.get(id) && o.gathering && [182, 186].includes(o.gathering[0]) && Number.isSafeInteger(o.gathering[1]) && o.gathering[1] >= 0)
        requirements += node.run(id, ...o.gathering, o.added ?? null).changes;
      for (const material of o.yields ?? []) add("object", id, material);
    }
    for (const [sid, i] of Object.entries(pages.item ?? {})) {
      for (const npc of i.skinned ?? []) add("skinning", npc, Number(sid));
      for (const obj of i.mined ?? []) add("object", obj, Number(sid));
    }
  })();
  log(`gathering: ${requirements} missing requirements, ${added} missing material sources from frozen Wowhead pages`);
}
