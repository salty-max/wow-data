import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { clientGathering, materialSources } from "../src/gathering";
import { compactPage } from "../src/wowheadPages";

const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
function fixture() {
  const db = new Database(":memory:");
  db.exec(schema);
  db.exec(`CREATE TABLE client_Lock (ID INTEGER, Type_0 INTEGER, _Index_0 INTEGER, Skill_0 INTEGER,
            Type_7 INTEGER, _Index_7 INTEGER, Skill_7 INTEGER);
    INSERT INTO client_Lock VALUES (1,2,3,0,NULL,NULL,NULL),(2,NULL,NULL,NULL,2,2,25);
    INSERT INTO object (id,type,lock_id,loot_id,source) VALUES (1731,3,1,1502,'classicdb'),
      (2042,3,2,1731,'classicdb'),(562111,3,NULL,NULL,'questie');
    INSERT INTO creature (id,skin_loot_id,source) VALUES (3474,100,'classicdb');
    INSERT INTO item (id,source) VALUES (2770,'client'),(249391,'client'),(249427,'client');
    INSERT INTO loot (kind,source_id,item_id,ref_id,source) VALUES
      ('object',1502,NULL,7,'classicdb'),('reference',7,2770,NULL,'classicdb'),
      ('object',1731,249391,NULL,'questie'),('creature',3474,249427,NULL,'questie');`);
  return db;
}

describe("gathering source normalization", () => {
  test("client requirements preserve zero and inspect the last slot", () => {
    const db = fixture();
    clientGathering(db);
    materialSources(db, { object: { 1731: { gathering: [186, 99] }, 562111: { gathering: [186, 1], added: '1.60.1.69893' } } }, () => {});
    materialSources(db, { object: { 1731: { gathering: [182, 99] } } }, () => {});
    expect(db.query("SELECT * FROM gathering_node ORDER BY object_id").all()).toEqual([
      { object_id: 1731, skill_line_id: 186, min_skill: 0, source: "client", introduced_build: null },
      { object_id: 2042, skill_line_id: 182, min_skill: 25, source: "client", introduced_build: null },
      { object_id: 562111, skill_line_id: 186, min_skill: 1, source: "wowhead", introduced_build: "1.60.1.69893" },
    ]);
    db.close();
  });

  test("loot uses each provider's namespace, retains primary references, separates skinning and remains idempotent", () => {
    const db = fixture();
    const pages = {
      object: { 1731: { yields: [2770, 249391] }, 2042: { yields: [249391] }, 562111: { yields: [2770] } },
      item: { 249427: { skinned: [3474, 999] }, 999: { skinned: [3474] } },
    };
    materialSources(db, pages, () => {});
    materialSources(db, pages, () => {});
    expect(db.query("SELECT kind,source_id,item_id,chance,min_count,max_count FROM loot WHERE source='wowhead' ORDER BY kind,source_id").all()).toEqual([
      { kind: "object", source_id: 2042, item_id: 249391, chance: null, min_count: null, max_count: null },
      { kind: "object", source_id: 562111, item_id: 2770, chance: null, min_count: null, max_count: null },
      { kind: "skinning", source_id: 3474, item_id: 249427, chance: null, min_count: null, max_count: null },
    ]);
    db.close();
  });
});

describe("the browser fetcher's material extraction", () => {
  const window: any = {};
  runInNewContext(readFileSync(new URL("../bin/wowhead-tab.js", import.meta.url), "utf8"), { window });
  const x = window.__wd.x;
  test("mining data parses bare keys and quoted delimiters without executing page code", () => {
    const html = `$.extend(g_objects[562111], {"name":"Poor Copper Vein","type":-4,"skill":0});
      new Listview({template:'item', id:'mining', data:[{"id":2770,"name":"a } [ count: string",count:3,stack:[1,2]}, {"id":2770}]});
      new Listview({id:'same-model-as', data:[{"id":999}]});`;
    expect(compactPage("object", "enUS", x.object(html, 562111))).toEqual({
      name: "Poor Copper Vein", type: 3, gathering: [186, 0], yields: [2770],
    });
    const withBox = html + 'WH.markup.printHtml("[ul][li]Added in patch [acronym=\\"1.15.2.54067\\"]1.15.2[/acronym][/li][/ul]", "infobox");';
    expect(compactPage("object", "enUS", x.object(withBox, 562111))).toMatchObject({ added: "1.15.2.54067" });
    expect(compactPage("object", "enUS", x.object(html.replace('count:3', 'count:runEvilCode()'), 562111))).toEqual({
      name: "Poor Copper Vein", type: 3, gathering: [186, 0],
    });
  });
  test("only explicit skinning/mining lists become item acquisition facts", () => {
    const html = `new Listview({id:'dropped-by',data:[{"id":999}]});
      new Listview({id:'skinned-from',data:[{"id":3474,"count":2,"outof":343}]});
      new Listview({id:'mined-from-object',data:[{"id":1731}]});`;
    expect(compactPage("item", "enUS", x.item(html))).toEqual({ skinned: [3474], mined: [1731] });
    expect(compactPage("item", "deDE", x.item(html))).toBeNull();
    expect(compactPage("object", "enUS", { info: { name: 'Mining Vein', type: -2, skill: 25 }, mining: [{ id: 2770 }] })).toEqual({ name: 'Mining Vein' });
  });
});
