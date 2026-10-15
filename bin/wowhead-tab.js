// Wowhead's pages for wow-data, fetched from inside a Wowhead tab: Wowhead
// refuses scripts its pages, so a real tab on https://www.wowhead.com fetches
// them, one at a time (two at once drew 403s), into its own IndexedDB
// ("wowdata-pages": a closed tab or a reload loses nothing, it resumes).
// Paste this file into such a tab (its console, or the app's JavaScript tool),
// then:
//   await __wd.addJobs(keys)      the jobs, "<kind>/<locale>/<id>", from
//                                 `bun bin/wowhead-pages.ts queue --keys`
//                                 ({ front: true } to fetch them first)
//   await __wd.start(1)           fetch, a page every 1.5 s or so
//   await __wd.stop()             let the page in flight finish, then stop
//   await __wd.status()           done / total by kind and language
//   await __wd.export(n)          up to n fetched pages not handed over yet,
//                                 for `bun bin/wowhead-pages.ts import FILE`
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
          if (!r.ok) await W.put("pages", key, { missing: String(r.status) });
          else await W.put("pages", key, W.x[kind](await r.text(), id, loc) || { missing: "none" });
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
  W.addJobs = async (keys, { front = false } = {}) => {
    const jobs = (await W.get("meta", "jobs")) || [];
    const known = new Set(jobs);
    const fresh = keys.filter((k) => !known.has(k));
    await W.put("meta", "jobs", front ? [...fresh, ...jobs] : [...jobs, ...fresh]);
    return fresh.length;
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
  const LABEL = {
    "quest enUS": "Quests EN", "npc enUS": "Creatures EN", "object enUS": "Objects EN",
    "itembook enUS": "Books EN", "itembook frFR": "Books FR", "itembook deDE": "Books DE",
    "objbook frFR": "Plaques FR", "objbook deDE": "Plaques DE",
    "quest deDE": "Quests DE", "quest frFR": "Quests FR",
    "itembook esES": "Books ES", "objbook esES": "Plaques ES", "quest esES": "Quests ES",
    "itembook esMX": "Books MX", "objbook esMX": "Plaques MX", "quest esMX": "Quests MX",
  };
  const fmt = (s) => (!isFinite(s) ? "?" : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`);
  W.samples = W.samples || [];
  W.panel = () => {
    document.getElementById("wd-panel")?.remove();
    if (W.panelTimer) clearInterval(W.panelTimer);
    const panel = document.createElement("div");
    panel.id = "wd-panel";
    panel.style.cssText = "position:fixed;top:8px;right:8px;z-index:2147483647;width:330px;max-height:calc(100vh - 16px);overflow-y:auto;background:#16130ff2;color:#e8dcc2;border:1px solid #d4a843;border-radius:10px;padding:9px 12px;font:11px/1.35 system-ui,sans-serif;box-shadow:0 6px 24px #000a";
    document.body.appendChild(panel);
    const draw = async () => {
      const jobs = await W.get("meta", "jobs");
      const have = new Set(await W.keys("pages"));
      const sent = new Set(await W.keys("sent"));
      const by = {};
      for (const k of jobs) {
        const g = k.split("/").slice(0, 2).join(" ");
        by[g] = by[g] || [0, 0];
        by[g][1]++;
        if (have.has(k)) by[g][0]++;
      }
      const now = Date.now();
      const done = jobs.filter((k) => have.has(k)).length;
      W.samples.push([now, done]);
      while (W.samples.length > 1 && now - W.samples[0][0] > 10 * 60000) W.samples.shift();
      const [t0, d0] = W.samples[0];
      const rate = now > t0 + 120000 && done > d0 ? (done - d0) / ((now - t0) / 1000) : null;
      const left = jobs.length - done;
      const leftEn = jobs.filter((k) => k.includes("/enUS/") && !have.has(k)).length;
      const unsaved = [...have].filter((k) => !sent.has(k)).length;
      const total = Math.floor((100 * done) / jobs.length);
      const rows = Object.keys(LABEL)
        .filter((g) => by[g])
        .map((g) => {
          const [d, t] = by[g];
          const pct = Math.floor((100 * d) / t);
          return `<div style="display:grid;grid-template-columns:78px 1fr 92px;align-items:center;gap:6px;margin:2px 0"><span>${LABEL[g]}</span><div style="height:5px;background:#3a3127;border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${pct === 100 ? "#9fd18b" : "#d4a843"}"></div></div><span style="text-align:right;color:#a99c84">${d.toLocaleString()}/${t.toLocaleString()}</span></div>`;
        })
        .join("");
      panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-family:Georgia,serif;color:#d4a843;font-size:13px">Wowhead fetch · ${total}%</b><span style="color:${W.state.running ? "#9fd18b" : "#e08a6e"}">${W.state.running ? "● running" : "● stopped"}</span></div>
      <div style="color:#a99c84;margin:3px 0 5px">${rate === null ? "measuring speed (two minutes)…" : `${(rate * 60).toFixed(0)} pages/min`} · English done in ${rate ? fmt(leftEn / rate) : "?"} · all in ${rate ? fmt(left / rate) : "?"}<br>Waiting to be saved into wow-data: <b style="color:#e8dcc2">${unsaved.toLocaleString()}</b> · last error: ${(W.state.err.slice(-1)[0] || "none").replace(/^\/forever\//, "")}</div>
      ${rows}`;
      document.title = `${total}% · Wowhead fetch`;
    };
    draw();
    W.panelTimer = setInterval(() => draw().catch(() => {}), 5000);
  };
})();
