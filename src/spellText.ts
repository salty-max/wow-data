// A spell's description with its `$` tokens put in (schema.sql "spell_text", docs/spell-info.md):
// $s1 the first effect's points, $d the duration, $t1 a tick, $o1 the total over time, $a1 a
// radius, ${$m1/10} a sum, $l1:2; a plural, $@spelldesc123 another spell's text. A token that
// needs the player (a known spell, an aura, the character's attack power, a gender) or a name
// defined elsewhere in the text ($<ticks>) stays as written and the row is not `complete`.
import { Database } from "bun:sqlite";

const log = (s: string) => console.log(`  ${s}`);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));

export type Effect = {
  points: number; // the effect's value as the client shows it (Classic Era: BasePoints, plus 1 when it has a die)
  die: number; // the highest value is points + die - 1 (1: no range)
  period: number; // ms
  radius: number; // yards
  chain: number;
  misc: number;
  amplitude: number;
  perResource: number; // EffectPointsPerResource ($b, a combo point's points)
  perLevel: number; // EffectRealPointsPerLevel: the points grow with the player's level
};
export type Facts = {
  effects: Effect[]; // by EffectIndex
  duration: number | null; // ms, -1 until cancelled
  procChance: number;
  procCharges: number;
  maxTargets: number;
  stacks: number;
  range: number;
};
export type Lookup = (spell: number) => Facts | null;
export type Words = { desc: (spell: number) => string | null; name: (spell: number) => string | null };

const shown = (n: number) => String(Math.round(n * 100) / 100);

export function duration(ms: number): string {
  if (ms < 0) return "until cancelled";
  const s = ms / 1000;
  if (s < 60) return `${shown(s)} sec`;
  if (s < 3600) return `${shown(s / 60)} min`;
  return `${shown(s / 3600)} hour`;
}

const range = (e: Effect) => {
  const lo = Math.abs(e.points);
  const hi = Math.abs(e.points + e.die - 1);
  return lo === hi ? shown(lo) : `${shown(Math.min(lo, hi))} to ${shown(Math.max(lo, hi))}`;
};

// the value of one token, or null when this table can not say
function value(kind: string, i: number, f: Facts): string | null {
  const e = f.effects[i - 1];
  // (points that grow with the player's level are the player's to say)
  if (e?.perLevel && "smMSoO".includes(kind)) return null;
  switch (kind) {
    case "s":
    case "S":
      return e ? range(e) : null;
    case "m":
      return e ? shown(Math.abs(e.points)) : null;
    case "M":
      return e ? shown(Math.abs(e.points + e.die - 1)) : null;
    case "t":
    case "T":
      return e && e.period ? shown(e.period / 1000) : null;
    case "o":
    case "O":
      return e && e.period && f.duration && f.duration > 0 ? shown((Math.abs(e.points) * f.duration) / e.period) : null;
    case "a":
    case "A":
      return e && e.radius ? shown(e.radius) : null;
    case "x":
    case "X":
      return e && e.chain ? String(e.chain) : null;
    case "q":
    case "Q":
      return e ? String(e.misc) : null;
    case "e":
    case "E":
      return e ? shown(e.amplitude) : null;
    case "b":
    case "B":
      return e && e.perResource ? shown(e.perResource) : null;
    case "d":
    case "D":
      return f.duration ? duration(f.duration) : null;
    case "h":
    case "H":
      return f.procChance ? String(f.procChance) : null;
    case "n":
    case "N":
      return f.procCharges ? String(f.procCharges) : null;
    case "i":
      return f.maxTargets ? String(f.maxTargets) : null;
    case "u":
    case "U":
      return f.stacks ? String(f.stacks) : null;
    case "r":
    case "R":
      return f.range ? shown(f.range) : null;
  }
  return null;
}

// a number the text gives as a sum: m, M, s (whole), o, a, t
const NUMERIC = /^[-+*/().\d\s]+$/;

export function resolve(text: string, spell: number, look: Lookup, words: Words, depth = 0): { text: string; complete: boolean } {
  let complete = true;
  const own = look(spell);
  const facts = (id: number | null) => (id === null ? own : look(id));
  let last = 0; // the number before a $l
  const token = /\$(?:@(spelldesc|spellname)(\d+)|(\d+)?([smMSotTOaAxXqQeEbBdDhHnNiuUrR])(\d*)|\{([^{}]*)\}|(?:l)([^:;]*):([^;]*);|\/(\d+);(\d*)([smMSotTaAxXqQeEbB])(\d*)|\*(\d+);(\d*)([smMSotTaAxXqQeEbB])(\d*))/g;
  const out = text.replace(token, (whole, ref, refId, other, kind, idx, expr, one, many, divBy, dOther, dKind, dIdx, mulBy, mOther, mKind, mIdx) => {
    // (a plural after the number just written)
    if (one !== undefined) return last === 1 ? one : many;
    if (ref) {
      if (depth > 3) return (complete = false), whole;
      const t = ref === "spelldesc" ? words.desc(Number(refId)) : words.name(Number(refId));
      if (t === null) return (complete = false), whole;
      const inner = resolve(t, Number(refId), look, words, depth + 1);
      if (!inner.complete) complete = false;
      return inner.text;
    }
    if (kind) {
      const v = value(kind, idx ? Number(idx) : 1, facts(other ? Number(other) : null) ?? emptyFacts);
      if (v === null) return (complete = false), whole;
      last = Number.parseFloat(v);
      return v;
    }
    if (divBy || mulBy) {
      const [by, o, k, ix, op] = divBy ? [divBy, dOther, dKind, dIdx, "/"] : [mulBy, mOther, mKind, mIdx, "*"];
      const v = value(k, ix ? Number(ix) : 1, facts(o ? Number(o) : null) ?? emptyFacts);
      const n = v === null ? NaN : Number.parseFloat(v);
      if (Number.isNaN(n)) return (complete = false), whole;
      last = op === "/" ? n / Number(by) : n * Number(by);
      return shown(last);
    }
    if (expr !== undefined) {
      // ${$m1/10}: every token in it numeric, then the sum
      let bad = false;
      const flat = expr.replace(/\$(\d+)?([smMSotTOaAxXqQeEbBdDhHnNiuUrR])(\d*)/g, (_: string, o: string | undefined, k: string, ix: string) => {
        const v = value(k, ix ? Number(ix) : 1, facts(o ? Number(o) : null) ?? emptyFacts);
        if (v === null || !/^-?[\d.]+$/.test(v)) bad = true;
        return v ?? "0";
      });
      if (bad || !NUMERIC.test(flat)) return (complete = false), whole;
      try {
        const n = Function(`"use strict"; return (${flat})`)() as number;
        if (!Number.isFinite(n)) return (complete = false), whole;
        last = n;
        return shown(n);
      } catch {
        return (complete = false), whole;
      }
    }
    return (complete = false), whole;
  });
  // (what is left of a `$`: a token that needs the player, or a name set elsewhere in the text)
  return { text: out, complete: complete && !out.includes("$") };
}

const emptyFacts: Facts = { effects: [], duration: null, procChance: 0, procCharges: 0, maxTargets: 0, stacks: 0, range: 0 };

type Q = Record<string, unknown>;
const all = (db: Database, sql: string): Q[] => db.query(sql).all() as Q[];

export function spellText(db: Database) {
  const cols = new Set(all(db, "PRAGMA table_info(client_SpellEffect)").map((c) => String(c.name)));
  const radius = new Map(all(db, "SELECT ID, Radius FROM client_SpellRadius").map((r) => [num(r.ID), num(r.Radius)]));
  const dur = new Map(all(db, "SELECT ID, Duration FROM client_SpellDuration").map((r) => [num(r.ID), num(r.Duration)]));
  const rng = new Map(all(db, "SELECT ID, RangeMax_0 m FROM client_SpellRange").map((r) => [num(r.ID), num(r.m)]));
  const facts = new Map<number, Facts>();
  const get = (id: number) => {
    let f = facts.get(id);
    if (!f) facts.set(id, (f = { effects: [], duration: null, procChance: 0, procCharges: 0, maxTargets: 0, stacks: 0, range: 0 }));
    return f;
  };
  for (const r of all(db, "SELECT * FROM client_SpellEffect WHERE DifficultyID = 0 ORDER BY SpellID, EffectIndex")) {
    // (Classic Era keeps the points less one and a die; Forever the value, as a float)
    const era = cols.has("EffectDieSides");
    const die = num(r.EffectDieSides);
    const points = era ? num(r.EffectBasePoints) + (die > 0 ? 1 : 0) : num(r.EffectBasePointsF);
    get(num(r.SpellID)).effects[num(r.EffectIndex)] = {
      points,
      die: era ? Math.max(die, 1) : 1,
      period: num(r.EffectAuraPeriod),
      radius: radius.get(num(r.EffectRadiusIndex_0)) || radius.get(num(r.EffectRadiusIndex_1)) || 0,
      chain: num(r.EffectChainTargets),
      misc: num(r.EffectMiscValue_0),
      amplitude: num(r.EffectAmplitude),
      perResource: num(r.EffectPointsPerResource),
      perLevel: num(r.EffectRealPointsPerLevel),
    };
  }
  for (const r of all(db, "SELECT SpellID, DurationIndex, RangeIndex FROM client_SpellMisc WHERE DifficultyID = 0 GROUP BY SpellID")) {
    const f = get(num(r.SpellID));
    f.duration = dur.get(num(r.DurationIndex)) ?? null;
    f.range = rng.get(num(r.RangeIndex)) ?? 0;
  }
  for (const r of all(db, "SELECT SpellID, ProcChance, ProcCharges, CumulativeAura FROM client_SpellAuraOptions WHERE DifficultyID = 0 GROUP BY SpellID")) {
    const f = get(num(r.SpellID));
    f.procChance = num(r.ProcChance);
    f.procCharges = num(r.ProcCharges);
    f.stacks = num(r.CumulativeAura);
  }
  for (const r of all(db, "SELECT SpellID, MaxTargets FROM client_SpellTargetRestrictions WHERE DifficultyID = 0 GROUP BY SpellID")) get(num(r.SpellID)).maxTargets = num(r.MaxTargets);
  for (const f of facts.values()) for (let i = 0; i < f.effects.length; i++) f.effects[i] ??= { points: 0, die: 1, period: 0, radius: 0, chain: 0, misc: 0, amplitude: 0, perResource: 0, perLevel: 0 };

  const text = (kind: string) => new Map(all(db, `SELECT id, name FROM name WHERE kind = '${kind}' AND locale = 'enUS'`).map((r) => [num(r.id), String(r.name)]));
  const desc = text("spell_description");
  const aura = text("aura_description");
  const names = text("spell");
  const words: Words = { desc: (s) => desc.get(s) ?? null, name: (s) => names.get(s) ?? null };
  const insert = db.prepare("INSERT INTO spell_text VALUES (?, ?, ?, ?, 'client')");
  let done = 0;
  let total = 0;
  db.transaction(() => {
    for (const [kind, map] of [["description", desc], ["aura", aura]] as const)
      for (const [id, t] of map) {
        const r = resolve(t, id, (s) => facts.get(s) ?? null, words);
        insert.run(id, kind, r.text, r.complete ? 1 : 0);
        total++;
        if (r.complete) done++;
      }
  })();
  log(`spell_text: ${total} (${done} complete)`);
}
