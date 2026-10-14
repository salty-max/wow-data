// What the API answers (server.ts, api/): the shapes the pages draw.
export type Game = "classic" | "forever";
export type Ref = {
  kind: string;
  id: number;
  name: string | null;
  locale?: string;
  quality?: number;
  level?: string;
  subname?: string;
  removed?: boolean;
  note?: string;
};
export type Tone = "dim" | "gold" | "ok" | "blood";
export type Cell = string | number | null | Ref | { text: string; tone?: Tone; mono?: boolean };
export type Column = { label: string; align?: "right"; mono?: boolean };
export type Point = { x: number; y: number; source: string; spawn?: number };
export type MapGroup = { ref: Ref; points: Point[]; paths: { source: string; label: string; points: [number, number][] }[] };
export type Section = { title: string; count?: number } & (
  | { type: "table"; columns: Column[]; rows: { cells: Cell[]; group?: string }[]; more?: number }
  | { type: "refs"; refs: Ref[]; more?: number }
  | { type: "map"; maps: MapGroup[]; unplaced: number }
  | { type: "texts"; fields: { label: string; texts: Record<string, string> }[] }
  | { type: "pages"; pages: Record<string, string[]> }
  | { type: "chain"; steps: Ref[]; current: number }
);
export type Fact = { label: string; value: string | number | Ref | Ref[]; mono?: boolean };
export type Row = Record<string, unknown>;
export type Entity = {
  ref: Ref;
  kindLabel: string;
  badges: { text: string; tone?: Tone }[];
  facts: Fact[];
  names: { locale: string; name: string; female: string | null; subname?: string; source: string }[];
  sections: Section[];
  raw: { table: string; key: string; rows: Row[] }[];
  sql: string;
};
export type Hit = Ref & { match?: string; matchLocale?: string; byId?: boolean };
export type SearchResult = { hits: Hit[]; counts: Record<string, number>; ms: number };
export type GameInfo =
  | { game: Game; built: false }
  | {
      game: Game;
      built: true;
      builtAt: string;
      sources: { name: string; version: string; url: string | null; license: string | null }[];
      counts: Record<string, number>;
    };
export type Info = { locales: string[]; kinds: Record<string, string>; games: GameInfo[] };
export type TableInfo = { name: string; type: "table" | "view"; rows: number | null; columns: { name: string; type: string; pk: boolean }[] };
export type Rows = { sql: string; columns: string[]; rows: unknown[][]; total: number; ms: number };
export type SqlResult = { columns: string[]; rows: unknown[][]; truncated: boolean; ms: number } | { error: string; ms?: number };
export type SavedQuery = { id: string; title: string; sql: string };

export const isRef = (v: unknown): v is Ref => typeof v === "object" && v !== null && "kind" in v && "id" in v;
