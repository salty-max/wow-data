export const num = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("en-US"));

export function ago(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.round(m)} min ago`;
  const h = m / 60;
  if (h < 36) return `${Math.round(h)} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export const LOCALE_NAMES: Record<string, string> = {
  enUS: "English",
  deDE: "Deutsch",
  esES: "Español (EU)",
  esMX: "Español (AL)",
  frFR: "Français",
  itIT: "Italiano",
  koKR: "한국어",
  ptBR: "Português",
  ruRU: "Русский",
  zhCN: "简体中文",
  zhTW: "繁體中文",
};

export const GAME_NAMES = { classic: "Classic Era", forever: "Forever" } as const;

export const short = (version: string) => (/^[0-9a-f]{40}$/.test(version) ? version.slice(0, 12) : version);
