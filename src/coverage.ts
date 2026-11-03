// What the class guide's tables hold for each class and each talent tree, from a built database
// (bin/coverage.ts prints it, test/coverage.test.ts holds it to a floor, docs/class-coverage.md).
import { Database } from "bun:sqlite";

type Q = Record<string, number | string | null>;
const all = (db: Database, sql: string): Q[] => db.query(sql).all() as Q[];

export type ClassRow = { class_id: number; name: string; races: number; spells: Q; talents: Q };
export type TreeRow = Q;

export function classCoverage(db: Database): ClassRow[] {
  const classes = all(db, "SELECT DISTINCT class_id FROM talent ORDER BY class_id");
  return classes.map(({ class_id }) => {
    const spells = all(
      db,
      `SELECT count(*) total,
         sum(kind = 'trainer') trainer, sum(kind = 'quest') quest, sum(kind = 'talent') talent, sum(kind = 'start') start, sum(kind = 'other') other,
         sum(level IS NOT NULL) with_level,
         sum(EXISTS (SELECT 1 FROM name n WHERE n.kind = 'spell' AND n.id = c.spell_id AND n.locale = 'enUS')) named,
         sum(EXISTS (SELECT 1 FROM spell_info i WHERE i.spell_id = c.spell_id)) with_info,
         sum(EXISTS (SELECT 1 FROM spell_info i WHERE i.spell_id = c.spell_id AND i.icon_path IS NOT NULL)) with_icon,
         sum(EXISTS (SELECT 1 FROM spell_text t WHERE t.spell_id = c.spell_id AND t.kind = 'description' AND t.complete = 1)) text_complete,
         sum(EXISTS (SELECT 1 FROM spell_text t WHERE t.spell_id = c.spell_id AND t.kind = 'description' AND t.complete = 0)) text_open,
         sum(EXISTS (SELECT 1 FROM trainer_spell ts WHERE ts.spell_id = c.lesson_spell_id)) with_trainer
       FROM class_spell c WHERE class_id = ? AND kind <> 'rune'`.replace("class_id = ?", `class_id = ${class_id}`),
    )[0];
    const talents = all(
      db,
      `SELECT count(*) total, count(DISTINCT tab_id) trees, sum(era_talent_id IS NULL) new, sum(era_tab_id <> tab_id) moved,
         (SELECT count(*) FROM talent_prereq p JOIN talent x ON x.id = p.talent_id WHERE x.class_id = ${class_id}) prereqs,
         (SELECT count(*) FROM talent_prereq p JOIN talent x ON x.id = p.talent_id WHERE x.class_id = ${class_id} AND p.rank IS NULL) prereqs_no_rank,
         (SELECT count(*) FROM talent_rank r JOIN talent x ON x.id = r.talent_id WHERE x.class_id = ${class_id}) rank_spells,
         sum(EXISTS (SELECT 1 FROM name n WHERE n.kind = 'spell' AND n.id = t.spell_id AND n.locale = 'enUS')) named,
         sum(EXISTS (SELECT 1 FROM spell_info i WHERE i.spell_id = t.spell_id)) with_info,
         sum(EXISTS (SELECT 1 FROM spell_text x WHERE x.spell_id = t.spell_id AND x.kind = 'description')) with_text
       FROM talent t WHERE class_id = ${class_id}`,
    )[0];
    return {
      class_id: Number(class_id),
      name: String((db.query("SELECT name FROM name WHERE kind = 'class' AND id = ? AND locale = 'enUS'").get(class_id) as Q | null)?.name ?? class_id),
      races: Number((db.query("SELECT count(*) n FROM class_race WHERE class_id = ?").get(class_id) as Q).n),
      spells,
      talents,
    };
  });
}

export function treeCoverage(db: Database): TreeRow[] {
  return all(
    db,
    `SELECT t.class_id, (SELECT name FROM name WHERE kind = 'class' AND id = t.class_id AND locale = 'enUS') class_name, t.tab_id, (SELECT name FROM name WHERE kind = 'talent_tab' AND id = t.tab_id AND locale = 'enUS') tree,
       count(*) talents, max(row) + 1 rows, sum(max_rank) points, sum(era_talent_id IS NULL) new, sum(era_tab_id <> tab_id) moved,
       (SELECT count(*) FROM talent_prereq p JOIN talent x ON x.id = p.talent_id WHERE x.tab_id = t.tab_id) prereqs
     FROM talent t GROUP BY t.class_id, t.tab_id ORDER BY t.class_id, t.tab_id`,
  );
}
