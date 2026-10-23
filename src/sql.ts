// The Classic database dump (cmangos classic-db, src/github.ts classicDump),
// read table by table. (Hearthtale's scripts/sql.ts, moved here.)

// One table's rows from the dump, by column name: its CREATE TABLE gives the
// order, its INSERT statements the values (MySQL quoting).
// (atLeast: a table the build can't do without; a dump of another shape,
// its INSERTs gone, would otherwise read as an empty table and a quiet loss)
export function rows(sql: string, table: string, atLeast = 0): Record<string, string | number | null>[] {
  const create = sql.match(new RegExp("CREATE TABLE `" + table + "` \\(([\\s\\S]*?)\\n\\)"));
  if (!create) throw new Error(`no table ${table}`);
  const cols = [...create[1].matchAll(/^\s+`(\w+)`/gm)].map((m) => m[1]);
  const out: Record<string, string | number | null>[] = [];
  const head = "INSERT INTO `" + table + "` VALUES ";
  let at = sql.indexOf(head);
  while (at !== -1) {
    let i = at + head.length;
    for (;;) {
      if (sql[i] !== "(") break;
      i++;
      const values: (string | number | null)[] = [];
      for (;;) {
        if (sql[i] === "'") {
          let s = "";
          i++;
          while (sql[i] !== "'" || sql[i + 1] === "'") {
            if (sql[i] === "\\") { s += ({ n: "\n", r: "", t: "\t", "0": "" } as Record<string, string>)[sql[i + 1]] ?? sql[i + 1]; i += 2; continue }
            if (sql[i] === "'") { s += "'"; i += 2; continue }
            s += sql[i++];
          }
          i++;
          values.push(s);
        } else {
          let j = i;
          while (sql[j] !== "," && sql[j] !== ")") j++;
          const raw = sql.slice(i, j);
          values.push(raw === "NULL" ? null : Number(raw));
          i = j;
        }
        if (sql[i] === ",") { i++; continue }
        i++; // )
        break;
      }
      const row: Record<string, string | number | null> = {};
      cols.forEach((c, k) => (row[c] = values[k] ?? null));
      out.push(row);
      if (sql[i] === ",") { i++; continue }
      break;
    }
    at = sql.indexOf(head, i);
  }
  if (out.length < atLeast) throw new Error(`${table}: ${out.length} rows in the dump, ${atLeast} at least wanted`);
  return out;
}
