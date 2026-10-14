import { SearchBar } from "@/components/SearchBar";
import { Sidebar } from "@/components/Sidebar";
import { ErrorBox } from "@/components/ui";
import { useApp } from "@/lib/app";
import { Entity } from "@/pages/Entity";
import { Home } from "@/pages/Home";
import { Search } from "@/pages/Search";
import { Sql } from "@/pages/Sql";
import { Table, Tables } from "@/pages/Tables";

/** The window: the sidebar, the search on top, one page (it alone scrolls). */
export function App() {
  const { route, info, kindLabel } = useApp();
  const { page, parts } = route;
  let body;
  if (page === "home") body = <Home />;
  else if (page === "search") body = <Search />;
  else if (page === "tables") body = <Tables />;
  else if (page === "table" && parts[0]) body = <Table name={parts[0]} />;
  else if (page === "sql") body = <Sql />;
  else if (Number.isInteger(Number(parts[0])) && (!info || info.kinds[page])) body = <Entity kind={page} id={Number(parts[0])} />;
  else body = <ErrorBox message={`No page here: ${location.hash} (a ${kindLabel(page)}?)`} />;
  const key = `${route.game}/${page}/${parts.join("/")}`;
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="z-20 flex h-16 shrink-0 items-center gap-4 border-b border-white/[0.04] bg-night/80 px-8 backdrop-blur">
          <SearchBar />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div key={key} className={`fade-in mx-auto px-8 pt-7 pb-12 ${page === "table" || page === "sql" ? "max-w-[96rem]" : "max-w-6xl"}`}>
            {body}
          </div>
        </div>
      </main>
    </div>
  );
}
