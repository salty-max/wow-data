// Wowhead's pages for wow-data, fetched from inside a Wowhead tab: Wowhead
// refuses scripts its pages, so a real tab on https://www.wowhead.com fetches
// them, one at a time (two at once drew 403s), into its own IndexedDB
// ("wowdata-pages": a closed tab or a reload loses nothing, it resumes).
// Paste this file into such a tab (its console, or the app's JavaScript tool),
// then:
//   await __wd.addJobs(keys)      the jobs, "<kind>/<locale>/<id>", from
//                                 `bun bin/wowhead-pages.ts queue --keys`
//                                 ({ front: true } to fetch them first;
//                                 { refetch: true } with `queue --refresh`:
//                                 the pages fetched again, had or not)
//   await __wd.addLatest(since)   what Wowhead added since a date ("2026-10-15",
//                                 else since the last call), which the
//                                 databases may not know yet: its Latest
//                                 Additions' quests and NPCs (first) and
//                                 objects (last), in English, those the tab
//                                 hasn't
//   await __wd.start(1)           fetch, a page every 1.5 s or so
//   await __wd.stop()             let the page in flight finish, then stop
//   await __wd.status()           done / total by kind and language
//   await __wd.saveTo()           the panel's button (the browser asks it of a
//                                 click): wow-data's .cache/wowhead/forever/pages
//                                 picked once, every page then written there
//                                 as it comes, as `import` would (the ones
//                                 waiting too): nothing to export
//   await __wd.export(n)          without that folder: up to n fetched pages
//                                 not handed over yet, for
//                                 `bun bin/wowhead-pages.ts import FILE`
//   await __wd.ack()              the last export handed over
//   __wd.panel()                  a live progress panel on the page, and the
//                                 tab's title its percentage
// Kinds: quest (texts; in English also its info box: giver, ender, level,
// zone), npc (type, level, rank, model, quotes), object (type), itembook and
// objbook (a book's or a plaque's pages, as the page's book viewer has them).
// Languages: enUS, deDE, frFR, esES (Spain's), esMX (Latin America's).
(async () => {
  const W = (window.__wd = window.__wd || {});
  W.open = () =>
    new Promise((res, rej) => {
      const r = indexedDB.open("wowdata-pages", 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const s of ["pages", "meta", "sent"]) d.createObjectStore(s);
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  W.req = (r) => new Promise((res, rej) => ((r.onsuccess = () => res(r.result)), (r.onerror = () => rej(r.error))));
  W.get = async (store, key) => W.req((await W.open()).transaction(store).objectStore(store).get(key));
  W.put = async (store, key, v) => W.req((await W.open()).transaction(store, "readwrite").objectStore(store).put(v, key));
  W.keys = async (store) => W.req((await W.open()).transaction(store).objectStore(store).getAllKeys());
  W.del = async (store, key) => W.req((await W.open()).transaction(store, "readwrite").objectStore(store).delete(key));

  W.LP = { enUS: "/forever/", deDE: "/forever/de/", frFR: "/forever/fr/", esES: "/forever/es/", esMX: "/forever/mx/" };
  W.PATH = { itembook: "item", objbook: "object" };

  // ── what a page holds ──────────────────────────────────────────────────────
  const jsonAfter = (h, re) => {
    const m = h.match(re);
    if (!m) return null;
    let i = m.index + m[0].length, depth = 0;
    const s = i;
    for (; i < h.length; i++) {
      const c = h[i];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) { i++; break; }
      } else if (c === '"') for (i++; i < h.length && h[i] !== '"'; i++) if (h[i] === "\\") i++;
    }
    try { return JSON.parse(h.slice(s, i)); } catch { return null; }
  };
  const box = (h) => {
    const m = h.match(/WH\.markup\.printHtml\("(\[ul\][^"]*(?:\\.[^"]*)*)"/);
    return m ? m[1].replace(/\\\//g, "/").replace(/\\"/g, '"') : null;
  };
  const book = (h) => {
    const m = h.match(/new Book\(\{[^}]*pages: (\[.*?\])\}\)/s);
    if (!m) return null;
    let pages;
    try { pages = JSON.parse(m[1]); } catch { return null; }
    const d = new DOMParser().parseFromString(h, "text/html");
    const h1 = d.querySelector("h1.heading-size-1") || d.querySelector("h1");
    return { title: h1 ? h1.textContent.trim() : null, pages };
  };
  W.x = {
    quest: (h, id, loc) => {
      const d = new DOMParser().parseFromString(h, "text/html");
      const t = d.querySelector(".text");
      const h1 = t && t.querySelector("h1");
      if (!h1) return null;
      const html = (start) => {
        let s = "";
        for (let n = start.nextSibling; n && !(n.nodeType === 1 && n.tagName === "H2"); n = n.nextSibling) {
          if (n.nodeType === 1 && (["SCRIPT", "TABLE", "STYLE"].includes(n.tagName) || (n.tagName === "DIV" && !n.textContent.trim()))) continue;
          s += n.nodeType === 3 ? n.textContent : n.outerHTML;
        }
        return s.trim();
      };
      const out = { title: h1.textContent.trim(), objectives: html(h1) };
      const first = t.querySelector("h2.heading-size-3");
      const next = first && first.nextElementSibling;
      if (first && !(next && /-(progress|completion)$/.test(next.id || ""))) {
        const s = html(first);
        if (s) out.details = s;
      }
      const p = d.querySelector('[id$="-progress"]'), c = d.querySelector('[id$="-completion"]');
      if (p && p.innerHTML.trim()) out.request = p.innerHTML.trim();
      if (c && c.innerHTML.trim()) out.reward = c.innerHTML.trim();
      if (loc === "enUS") {
        out.info = jsonAfter(h, new RegExp("g_quests\\[" + id + "\\],\\s*"));
        out.box = box(h);
      }
      return out;
    },
    npc: (h, id) => {
      const info = jsonAfter(h, new RegExp("g_npcs\\[" + id + "\\],\\s*"));
      if (!info) return null;
      const model = (h.match(new RegExp('"' + id + '":\\{"name_enus":"[^"]*","model":(\\d+)')) || h.match(/linksButton\.dataset\.displayId = (\d+)/) || [])[1];
      const d = new DOMParser().parseFromString(h, "text/html");
      const quotes = [...d.querySelectorAll("span.blizzard-ui-text")].map((s) => ({
        kind: s.parentElement.className,
        who: s.parentElement.firstChild && s.parentElement.firstChild.textContent,
        text: s.innerHTML,
      }));
      return { info, model: model ? Number(model) : null, box: box(h), quotes };
    },
    object: (h, id) => {
      const info = jsonAfter(h, new RegExp("g_objects\\[" + id + "\\],\\s*"));
      return info ? { info, box: box(h) } : null;
    },
    itembook: (h) => book(h),
    objbook: (h) => book(h),
  };

  // ── straight into wow-data ─────────────────────────────────────────────────
  // The folder picked once, its handle kept with the pages (after a reload
  // the browser may ask again: the button again). Only that folder: the
  // page's own scripts could reach the handle, and pages are data.
  W.folder = async () => {
    const dir = await W.get("meta", "dir");
    return dir && (await dir.queryPermission({ mode: "readwrite" })) === "granted" ? dir : null;
  };
  W.write = async (dir, key, page) => {
    const [kind, loc, id] = key.split("/");
    const at = await (await dir.getDirectoryHandle(kind, { create: true })).getDirectoryHandle(loc, { create: true });
    const out = await (await at.getFileHandle(id + ".json", { create: true })).createWritable();
    await out.write(JSON.stringify(page));
    await out.close();
    await W.put("sent", key, 1);
  };
  W.flush = async () => {
    const dir = await W.folder();
    if (!dir) return 0;
    const sent = new Set(await W.keys("sent"));
    let n = 0;
    for (const k of await W.keys("pages")) {
      if (sent.has(k)) continue;
      await W.write(dir, k, await W.get("pages", k));
      n++;
    }
    return n;
  };
  W.saveTo = async () => {
    navigator.storage.persist?.();
    let dir = await W.get("meta", "dir");
    if (dir && (await dir.requestPermission({ mode: "readwrite" })) !== "granted") dir = null;
    if (!dir) {
      dir = await showDirectoryPicker({ id: "wowdata-pages", mode: "readwrite" });
      if (dir.name !== "pages") throw new Error("pick wow-data/.cache/wowhead/forever/pages");
      await W.put("meta", "dir", dir);
    }
    return W.flush();
  };

  // ── the fetching ───────────────────────────────────────────────────────────
  W.state = W.state || { done: 0, err: [], stop: false, running: 0 };
  W.start = async (n = 1) => {
    const jobs = await W.get("meta", "jobs");
    const have = new Set(await W.keys("pages"));
    const todo = jobs.filter((k) => !have.has(k));
    let i = 0;
    W.state.stop = false;
    const worker = async (w) => {
      W.state.running++;
      await new Promise((s) => setTimeout(s, w * 750));
      while (!W.state.stop && i < todo.length) {
        const key = todo[i++];
        const [kind, loc, sid] = key.split("/");
        const id = Number(sid);
        const path = W.LP[loc] + (W.PATH[kind] || kind) + "=" + id;
        try {
          const r = await fetch(path);
          if (r.status === 403) {
            // (Wowhead's throttle: a minute's rest, the page again later)
            W.state.err.push(path + ":403");
            todo.push(key);
            await new Promise((s) => setTimeout(s, 60000));
            continue;
          }
          const page = r.ok ? W.x[kind](await r.text(), id, loc) || { missing: "none" } : { missing: String(r.status) };
          await W.put("pages", key, page);
          const dir = await W.folder();
          if (dir) await W.write(dir, key, page).catch((e) => W.state.err.push(key + ":unsaved " + e.name));
        } catch (e) {
          W.state.err.push(path + ":" + e);
          await new Promise((s) => setTimeout(s, 5000));
        }
        W.state.done++;
        await new Promise((s) => setTimeout(s, 1500));
      }
      W.state.running--;
    };
    for (let w = 0; w < n; w++) worker(w);
    return todo.length;
  };
  W.stop = async () => {
    W.state.stop = true;
    for (let i = 0; i < 90 && W.state.running > 0; i++) await new Promise((s) => setTimeout(s, 1000));
    return W.state.running;
  };
  W.addJobs = async (keys, { front = false, refetch = false } = {}) => {
    if (refetch) for (const k of keys) await Promise.all([W.del("pages", k), W.del("sent", k)]);
    const jobs = (await W.get("meta", "jobs")) || [];
    const known = new Set(jobs);
    const fresh = keys.filter((k) => !known.has(k));
    await W.put("meta", "jobs", front ? [...fresh, ...jobs] : [...jobs, ...fresh]);
    return refetch ? keys.length : fresh.length;
  };
  // Wowhead's Latest Additions: each day a heading, its additions linked
  // under it; a busy day only a link to its search, whose lists are the
  // page's JSON.
  W.addLatest = async (since) => {
    since = since || (await W.get("meta", "latest")) || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const found = { quest: new Set(), npc: new Set(), object: new Set() };
    const html = async (path) => new DOMParser().parseFromString(await (await fetch(path)).text(), "text/html");
    const day = (text) => {
      const t = new Date(text + " UTC");
      return isNaN(t) ? null : t.toISOString().slice(0, 10);
    };
    const d = await html("/forever/latest-additions");
    let date = null;
    const busy = [];
    for (const el of d.querySelectorAll("h2, a[href]")) {
      if (el.tagName === "H2") date = day(el.textContent.trim());
      else if (date && date >= since) {
        const href = el.getAttribute("href");
        const m = href.match(/\/forever\/(quest|npc|object)=(\d+)/);
        if (m) found[m[1]].add(Number(m[2]));
        else if (/search\?q=date/.test(href)) busy.push(href);
      }
    }
    for (const href of busy) {
      const s = await html(href);
      for (const script of s.querySelectorAll("script:not([src])")) {
        for (const m of script.textContent.matchAll(/template: "(quest|npc|object)",[^]*?data: WH\.getPageData\("([\w-]+)"\)/g)) {
          const data = s.getElementById("data." + m[2]);
          for (const row of data ? JSON.parse(data.textContent) : []) found[m[1]].add(row.id);
        }
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    // (new quests and NPCs first; new objects after the rest, mostly props:
    // a fire, a brazier, a mailbox, among them a quest's crate)
    const have = new Set(await W.keys("pages"));
    const keys = (kinds) => kinds.flatMap((kind) => [...found[kind]].map((id) => `${kind}/enUS/${id}`)).filter((k) => !have.has(k));
    const added = (await W.addJobs(keys(["quest", "npc"]), { front: true })) + (await W.addJobs(keys(["object"])));
    await W.put("meta", "latest", new Date().toISOString().slice(0, 10));
    return { since, found: Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.size])), added };
  };
  W.status = async () => {
    const jobs = await W.get("meta", "jobs");
    const have = new Set(await W.keys("pages"));
    const by = {};
    for (const k of jobs) {
      const g = k.split("/").slice(0, 2).join(" ");
      by[g] = by[g] || [0, 0];
      by[g][1]++;
      if (have.has(k)) by[g][0]++;
    }
    return { by, running: W.state.running, err: W.state.err.slice(-3), sent: (await W.keys("sent")).length };
  };
  W.export = async (limit = 1200) => {
    const sent = new Set(await W.keys("sent"));
    const out = {};
    const keys = (await W.keys("pages")).filter((k) => !sent.has(k)).slice(0, limit);
    for (const k of keys) out[k] = await W.get("pages", k);
    W.lastExport = keys;
    return out;
  };
  W.ack = async () => {
    for (const k of W.lastExport || []) await W.put("sent", k, 1);
    return (W.lastExport || []).length;
  };

  // ── the live panel ─────────────────────────────────────────────────────────
  // The whole at a glance (a bar, the speed, what is left), then a grid: a
  // row a kind, a column a language (its counts on hover), the one fetching
  // now outlined; Wowhead's throttling under it.
  const KINDS = [["quest", "Quests"], ["npc", "Creatures"], ["object", "Objects"], ["itembook", "Books"], ["objbook", "Plaques"]];
  const LANGS = [["enUS", "EN"], ["deDE", "DE"], ["frFR", "FR"], ["esES", "ES"], ["esMX", "MX"]];
  const LANG_NAMES = { enUS: "English", deDE: "German", frFR: "French", esES: "Spanish", esMX: "Latin American Spanish" };
  const fmt = (s) => (!isFinite(s) ? "?" : s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`);
  const MUTED = "#a99c84", GOLD = "#d4a843", GREEN = "#9fd18b", RED = "#e08a6e", TRACK = "#3a3127";
  const bar = (pct, h, color) => `<div style="height:${h}px;background:${TRACK};border-radius:${h}px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${color}"></div></div>`;
  W.samples = W.samples || [];
  W.panel = () => {
    document.getElementById("wd-panel")?.remove();
    if (W.panelTimer) clearInterval(W.panelTimer);
    const panel = document.createElement("div");
    panel.id = "wd-panel";
    panel.style.cssText = "position:fixed;top:8px;right:8px;z-index:2147483647;width:340px;max-height:calc(100vh - 16px);overflow-y:auto;box-sizing:border-box;background:#16130ff5;color:#e8dcc2;border:1px solid #d4a843;border-radius:10px;padding:12px 14px;font:11px/1.4 system-ui,sans-serif;font-variant-numeric:tabular-nums;box-shadow:0 6px 24px #000a";
    panel.innerHTML = `<div></div><div style="margin-top:10px"></div>`;
    const [body, save] = panel.children;
    document.body.appendChild(panel);
    // (its own place, drawn again only when it changes: a click lands)
    let saving = null;
    const drawSave = async () => {
      const dir = await W.folder();
      const state = dir ? "on" : (await W.get("meta", "dir")) ? "again" : "off";
      if (state === saving) return;
      saving = state;
      if (state === "on") {
        save.innerHTML = `<div style="color:${GREEN};font-size:10px">Each page saved into wow-data as it comes</div>`;
        return;
      }
      save.innerHTML = `<button style="width:100%;padding:6px;border-radius:6px;border:1px solid ${GOLD};background:#2a2218;color:${GOLD};font:600 11px system-ui,sans-serif;cursor:pointer">${state === "again" ? "Allow saving into wow-data again" : "Save into wow-data…"}</button><div style="color:${MUTED};font-size:10px;margin-top:4px">${state === "again" ? "The browser asks again after a reload." : "Pick wow-data/.cache/wowhead/forever/pages (⇧⌘G, then paste the path)."}</div>`;
      save.querySelector("button").onclick = () =>
        W.saveTo()
          .then(() => ((saving = null), drawSave()))
          .catch((e) => (save.lastChild.textContent = e.name === "AbortError" ? "No folder picked." : String(e.message || e)));
    };
    const draw = async () => {
      const jobs = await W.get("meta", "jobs");
      const have = new Set(await W.keys("pages"));
      const sent = new Set(await W.keys("sent"));
      const by = {};
      let done = 0, leftEn = 0, now = null;
      for (const k of jobs) {
        const [kind, loc] = k.split("/");
        const g = (by[kind + " " + loc] = by[kind + " " + loc] || [0, 0]);
        g[1]++;
        if (have.has(k)) {
          g[0]++;
          done++;
        } else {
          now = now || [kind, loc];
          if (loc === "enUS") leftEn++;
        }
      }
      const t = Date.now();
      W.samples.push([t, done]);
      while (W.samples.length > 1 && t - W.samples[0][0] > 10 * 60000) W.samples.shift();
      const [t0, d0] = W.samples[0];
      const rate = t > t0 + 120000 && done > d0 ? (done - d0) / ((t - t0) / 1000) : null;
      const left = jobs.length - done;
      const unsaved = [...have].filter((k) => !sent.has(k)).length;
      const pct = Math.floor((100 * done) / jobs.length);
      const running = W.state.running > 0;
      const stat = (label, value) =>
        `<div><div style="color:${MUTED};font-size:9px;letter-spacing:.06em;text-transform:uppercase">${label}</div><div style="font-size:13px;font-weight:600;margin-top:1px">${value}</div></div>`;
      const cell = (kind, loc) => {
        const g = by[kind + " " + loc];
        if (!g) return `<div style="text-align:right;color:#5a5044">–</div>`;
        const [d, n] = g;
        const p = Math.floor((100 * d) / n);
        const current = running && now && now[0] === kind && now[1] === loc;
        const color = d === n ? GREEN : d > 0 || current ? GOLD : MUTED;
        return `<div title="${d.toLocaleString()} / ${n.toLocaleString()}" style="padding:2px 4px;margin:-2px -4px;border-radius:4px;${current ? `box-shadow:inset 0 0 0 1px ${GOLD};` : ""}"><div style="text-align:right;color:${color}">${d === n ? "✓" : p + "%"}</div>${bar(p, 3, d === n ? GREEN : GOLD)}</div>`;
      };
      const kinds = KINDS.filter(([k]) => LANGS.some(([l]) => by[k + " " + l]));
      const grid = `<div style="display:grid;grid-template-columns:64px repeat(5,1fr);gap:7px 10px;align-items:center">
        <div></div>${LANGS.map(([, l]) => `<div style="text-align:right;color:${MUTED};font-size:9px;letter-spacing:.06em">${l}</div>`).join("")}
        ${kinds.map(([k, label]) => `<div>${label}</div>${LANGS.map(([l]) => cell(k, l)).join("")}`).join("")}
      </div>`;
      const throttles = W.state.err.filter((e) => e.endsWith(":403"));
      const others = W.state.err.filter((e) => !e.endsWith(":403"));
      const page = (e) => e.replace(/^\/forever\/(\w\w\/)?/, "").replace(/:[^:]*$/, "");
      const nowLabel = now ? ` · now ${(KINDS.find(([k]) => k === now[0]) || [, now[0]])[1].toLowerCase()} in ${LANG_NAMES[now[1]] || now[1]}` : "";
      body.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <b style="font-family:Georgia,serif;color:${GOLD};font-size:14px">Wowhead fetch</b>
          <span style="color:${running ? GREEN : RED}">● ${running ? "running" : "stopped"}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin:9px 0 3px"><div style="flex:1">${bar(pct, 6, GOLD)}</div><b style="font-size:13px">${pct}%</b></div>
        <div style="color:${MUTED}">${done.toLocaleString()} of ${jobs.length.toLocaleString()} pages${running ? nowLabel : ""}</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0 12px;padding:8px 0;border-top:1px solid ${TRACK};border-bottom:1px solid ${TRACK}">
          ${stat("Speed", rate ? `${Math.round(rate * 60)}/min` : "…")}
          ${stat("English in", leftEn ? (rate ? fmt(leftEn / rate) : "…") : "done")}
          ${stat("All in", left ? (rate ? fmt(left / rate) : "…") : "done")}
          ${stat("To save", unsaved.toLocaleString())}
        </div>
        ${grid}
        <div style="color:${MUTED};margin-top:12px;padding-top:7px;border-top:1px solid ${TRACK};font-size:10px">${
          throttles.length ? `Throttled ${throttles.length}× by Wowhead, last at ${page(throttles[throttles.length - 1])}` : "Not throttled yet"
        }${others.length ? `<br>${others.length} failed, last ${page(others[others.length - 1])}` : ""}</div>`;
      document.title = `${pct}% · Wowhead fetch`;
      await drawSave();
    };
    draw();
    W.panelTimer = setInterval(() => draw().catch(() => {}), 5000);
  };
})();
