// What a spell costs, how long it casts, waits and reaches, which form it needs and its icon
// (schema.sql "spell_info", docs/spell-info.md): the client's spell tables folded into one row a spell.
import { Database } from "bun:sqlite";

const log = (s: string) => console.log(`  ${s}`);

// SpellMisc.Attributes_0 bit 6: a passive spell (SPELL_ATTR0_PASSIVE)
export const ATTR_PASSIVE = 0x40;
// the power types whose cost the client keeps in tenths (rage: 150 is 15 rage)
export const TENTHS = [1];
// SpellCategories.StartRecoveryCategory of the global cooldown
export const GCD_CATEGORY = 133;

export function spellInfo(db: Database) {
  db.run(`
    INSERT INTO spell_info
    SELECT m.SpellID,
      NULLIF(m.SpellIconFileDataID, 0),
      (SELECT replace(i.FilePath, '/', '\\') || replace(replace(i.FileName, '.blp', ''), '.BLP', '')
         FROM client_ManifestInterfaceData i WHERE i.ID = m.SpellIconFileDataID),
      m.SchoolMask,
      (m.Attributes_0 & ${ATTR_PASSIVE}) <> 0,
      m.Attributes_0,
      (SELECT t.Base FROM client_SpellCastTimes t WHERE t.ID = m.CastingTimeIndex),
      r.RangeMin_0, r.RangeMax_0, r.RangeMin_1, r.RangeMax_1,
      (SELECT d.Duration FROM client_SpellDuration d WHERE d.ID = m.DurationIndex),
      NULLIF(MAX(cd.RecoveryTime, cd.CategoryRecoveryTime), 0),
      NULLIF(cd.RecoveryTime, 0),
      NULLIF(c.Category, 0),
      NULLIF(cd.CategoryRecoveryTime, 0),
      NULLIF(cd.StartRecoveryTime, 0),
      NULLIF(c.StartRecoveryCategory, 0),
      p.PowerType,
      CASE WHEN p.PowerType IN (${TENTHS.join(", ")}) THEN p.ManaCost / 10.0 ELSE p.ManaCost END,
      NULLIF(p.PowerCostPct, 0),
      NULLIF(p.ManaPerSecond, 0),
      s.ShapeshiftMask_0, s.ShapeshiftMask_1, s.ShapeshiftExclude_0, s.ShapeshiftExclude_1,
      e.EquippedItemClass, e.EquippedItemSubclass, e.EquippedItemInvTypes,
      'client'
    FROM client_SpellMisc m
    LEFT JOIN client_SpellRange r ON r.ID = m.RangeIndex
    LEFT JOIN client_SpellCooldowns cd ON cd.SpellID = m.SpellID AND cd.DifficultyID = 0
    LEFT JOIN client_SpellCategories c ON c.SpellID = m.SpellID AND c.DifficultyID = 0
    LEFT JOIN client_SpellPower p ON p.SpellID = m.SpellID AND p.OrderIndex = 0
    LEFT JOIN client_SpellShapeshift s ON s.SpellID = m.SpellID
    LEFT JOIN client_SpellEquippedItems e ON e.SpellID = m.SpellID
    WHERE m.DifficultyID = 0
    GROUP BY m.SpellID`);
  const n = (db.query("SELECT count(*) n FROM spell_info").get() as { n: number }).n;
  const icons = (db.query("SELECT count(icon_path) n FROM spell_info").get() as { n: number }).n;
  log(`spell_info: ${n} (${icons} with an icon path)`);
}
