import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi } from "./api";
import { type Route, useRoute } from "./route";
import type { Game, GameInfo, Info, Ref } from "./types";

// What every page shares: the route (and its game), the reader's language,
// what the server told of the databases, the things lately opened.
type App = {
  route: Route;
  game: Game;
  info: Info | undefined;
  gameInfo: GameInfo | undefined;
  locale: string;
  setLocale: (l: string) => void;
  recent: Ref[];
  remember: (r: Ref) => void;
  kindLabel: (kind: string) => string;
};
const Ctx = createContext<App | null>(null);

const load = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // (a private window: forgotten, no harm)
  }
};

export function AppProvider({ children }: { children: ReactNode }) {
  const route = useRoute();
  const { data: info } = useApi<Info>("/api/info");
  const [locale, setLocaleState] = useState(() => load("explorer.locale", "enUS"));
  const [recent, setRecent] = useState<Ref[]>(() => load("explorer.recent", []));
  const setLocale = useCallback((l: string) => {
    setLocaleState(l);
    save("explorer.locale", l);
  }, []);
  const remember = useCallback((r: Ref) => {
    setRecent((list) => {
      const next = [{ kind: r.kind, id: r.id, name: r.name, quality: r.quality }, ...list.filter((x) => x.kind !== r.kind || x.id !== r.id)].slice(0, 8);
      save("explorer.recent", next);
      return next;
    });
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale.slice(0, 2);
  }, [locale]);
  const value = useMemo<App>(
    () => ({
      route,
      game: route.game,
      info,
      gameInfo: info?.games.find((g) => g.game === route.game),
      locale,
      setLocale,
      recent,
      remember,
      kindLabel: (k) => info?.kinds[k] ?? k,
    }),
    [route, info, locale, setLocale, recent, remember],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): App {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}
