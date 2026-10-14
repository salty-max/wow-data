-- Reads Forever's sources (src/forever.ts gives the folders, in the cache)
-- and prints them as one JSON document for it (moved from Hearthtale):
--   luajit bin/forever-read.lua <att dir> <questiedb traces dir>
-- AllTheThings' Forever database (MIT): Lua files run with stand-ins for its
-- functions and constants, each line's trailing comment kept as a field
-- first (the comments carry the quest's title, the giver's name and calling,
-- an objective's line in the quest log). QuestieDB's traces (what Questie's
-- recorder saw on the beta): modules loaded with stand-ins for their loader.
-- (wow-data's cache: AllTheThings' Forever folder, QuestieDB's traces folder)
local attDir = assert(arg[1], "usage: luajit bin/forever-read.lua <att dir> <questiedb traces dir>")
local questieDir = assert(arg[2], "usage: luajit bin/forever-read.lua <att dir> <questiedb traces dir>")

-- ── JSON ────────────────────────────────────────────────────────────────────
local function isArray(t)
  local n = 0
  for k in pairs(t) do
    if type(k) ~= "number" or k < 1 or k % 1 ~= 0 then return false end
    n = n + 1
  end
  for i = 1, n do
    if t[i] == nil then return false end
  end
  return true
end
local function json(v)
  local t = type(v)
  if t == "nil" then return "null" end
  if t == "boolean" then return tostring(v) end
  if t == "number" then return (v % 1 == 0 and ("%d"):format(v)) or ("%.4f"):format(v) end
  if t == "string" then
    return '"' .. v:gsub('[%c"\\]', function(c)
      if c == '"' then return '\\"' end
      if c == "\\" then return "\\\\" end
      return ("\\u%04x"):format(c:byte())
    end) .. '"'
  end
  if t == "table" then
    if next(v) == nil then return "[]" end
    if isArray(v) then
      local out = {}
      for i = 1, #v do
        out[i] = json(v[i])
      end
      return "[" .. table.concat(out, ",") .. "]"
    end
    local keys = {}
    for k in pairs(v) do
      table.insert(keys, tostring(k))
    end
    table.sort(keys)
    local out = {}
    for _, k in ipairs(keys) do
      local x = v[k]
      if x == nil then x = v[tonumber(k)] end
      table.insert(out, json(k) .. ":" .. json(x))
    end
    return "{" .. table.concat(out, ",") .. "}"
  end
  return "null"
end

-- ── AllTheThings ────────────────────────────────────────────────────────────
-- A name ATT's files use without defining it: a constant (MAP.DUN_MOROGH,
-- HORDE_ONLY, DWARF) or a function (q, n, i, objective...). Called, it is a
-- node: { fn = its name, args = { ... } }.
local Sym = {}
local function sym(name) return setmetatable({ sym = name }, Sym) end
Sym.__index = function(s, k) return sym(rawget(s, "sym") .. "." .. tostring(k)) end
Sym.__call = function(s, ...) return { fn = rawget(s, "sym"), args = { ... }, n = select("#", ...) } end
-- (a constant in arithmetic, "NEUTRAL + 1", or joined to a string: an expression, by name)
local function nameOf(v) return type(v) == "table" and (rawget(v, "sym") or "?") or tostring(v) end
for op, s in pairs({ __add = "+", __sub = "-", __mul = "*", __div = "/", __mod = "%", __pow = "^", __concat = ".." }) do
  Sym[op] = function(a, b) return sym(nameOf(a) .. s .. nameOf(b)) end
end
Sym.__unm = function(a) return sym("-" .. nameOf(a)) end
Sym.__lt = function() return false end
Sym.__le = function() return false end
local LIB = {
  pairs = pairs,
  ipairs = ipairs,
  table = table,
  string = string,
  math = math,
  select = select,
  type = type,
  tostring = tostring,
  tonumber = tonumber,
  unpack = unpack,
  next = next,
  setmetatable = setmetatable,
  rawget = rawget,
  print = function() end,
}

-- A line's trailing comment, kept: after "{" it names what opens there
-- ("q(93746, {  -- A Firm Response": the title); after "key = value," it
-- names the value ("qg = 251968,  -- Ayessa Dawnsinger").
local function keepComments(src)
  local out = {}
  for line in (src .. "\n"):gmatch("(.-)\r?\n") do
    local code, comment = line:match("^(.-)%-%-%s*(.-)%s*$")
    if code and not code:find("^%s*$") and not code:find('"[^"]*$') and comment ~= "" then
      local q = ("%q"):format(comment):gsub("\\\n", "\\n")
      if code:find("{%s*$") then
        line = code .. " _c = " .. q .. ","
      else
        local key = code:match('^%s*%[?"?([%w_]+)"?%]?%s*=%s*.-,%s*$')
        if key then
          line = code .. " _c_" .. key .. " = " .. q .. ","
        else
          line = code
        end
      end
    end
    table.insert(out, line)
  end
  return table.concat(out, "\n")
end

local function readATT(path)
  local f = assert(io.open(path, "rb"))
  local src = keepComments(f:read("*a"))
  f:close()
  local env = setmetatable({}, {
    __index = function(_, k)
      if LIB[k] ~= nil then return LIB[k] end
      return sym(k)
    end,
  })
  local chunk, err = loadstring(src, "@" .. path)
  if not chunk then error(path .. ": " .. err) end
  setfenv(chunk, env)
  local roots = {}
  -- (each file calls root(...) or maproot(...) once or more: kept as nodes)
  env.root = function(...) table.insert(roots, { fn = "root", args = { ... } }) end
  env.maproot = function(...) table.insert(roots, { fn = "maproot", args = { ... } }) end
  local ok, e = pcall(chunk)
  if not ok then error(path .. ": " .. tostring(e)) end
  return roots
end

local function symName(v) return type(v) == "table" and rawget(v, "sym") or nil end
local function list(v)
  if v == nil then return nil end
  if type(v) ~= "table" or symName(v) then return { v } end
  return v
end
-- A value as data: symbols by name, nodes by function and arguments.
local function plain(v, depth)
  depth = depth or 0
  if depth > 6 then return nil end
  if type(v) ~= "table" then return v end
  if symName(v) then return symName(v) end
  if v.fn then
    local args = {}
    for i = 1, v.n or #v.args do
      args[i] = plain(v.args[i], depth + 1)
    end
    return { fn = v.fn, args = args }
  end
  local out = {}
  for k, x in pairs(v) do
    if k ~= "groups" then out[k] = plain(x, depth + 1) end
  end
  return out
end

-- Every quest of a file, with where it is (the map of the root it sits
-- under, or its own coordinates'), what it asks (objectives), what it gives
-- and what is found for it (items under objects or creatures in its groups).
local quests, npcs = {}, {}
local function walk(node, map, file)
  if type(node) ~= "table" or symName(node) then return end
  if node.fn then
    local fn, args = node.fn, node.args
    if (fn == "maproot" or fn == "m" or fn == "inst") and symName(args[1]) then map = symName(args[1]) end
    if fn == "inst" and type(args[1]) == "number" then map = "INSTANCE." .. args[1] end
    if fn == "q" and type(args[1]) == "number" and type(args[2]) == "table" then
      local t, id = args[2], args[1]
      -- (coord = { x, y, map }; coords = { { x, y, map }, ... })
      local coord = type(t.coord) == "table" and t.coord or nil
      if not coord and type(t.coords) == "table" then
        coord = type(t.coords[1]) == "table" and t.coords[1] or t.coords
      end
      local q = {
        id = id,
        file = file,
        title = t._c,
        map = (coord and symName(coord[3])) or map,
        qg = list(t.qg) or list(t.qgs),
        qgNames = t._c_qg,
        provider = t.provider and plain(t.provider),
        races = t.races and plain(t.races),
        classes = t.classes and plain(t.classes),
        lvl = t.lvl and plain(t.lvl),
        prev = list(t.sourceQuest) or list(t.sourceQuests),
        repeatable = t.repeatable or nil,
        objectives = {},
        rewards = {},
        found = {},
      }
      for _, g in ipairs(t.groups or {}) do
        if type(g) == "table" and g.fn == "objective" then
          local o = g.args[2] or {}
          table.insert(q.objectives, {
            index = g.args[1],
            text = o._c,
            provider = o.provider and plain(o.provider),
            cr = o.cr,
            crs = o.crs and plain(o.crs),
          })
        elseif type(g) == "table" and g.fn == "i" then
          table.insert(q.rewards, g.args[1])
        elseif type(g) == "table" and (g.fn == "o" or g.fn == "n") then
          local holder = g.args[2] or {}
          for _, x in ipairs(holder.groups or holder) do
            if type(x) == "table" and x.fn == "i" then
              table.insert(q.found, { item = x.args[1], from = g.fn, id = g.args[1], name = holder._c })
            end
          end
        end
      end
      quests[id] = quests[id] or q
    end
    if fn == "n" and type(args[1]) == "number" and type(args[2]) == "table" and args[2]._c then
      npcs[args[1]] = npcs[args[1]] or { name = args[2]._c, map = map }
    end
    for _, a in ipairs(args) do
      if type(a) == "table" and not symName(a) then
        walk(a, map, file)
        for _, g in ipairs(a.groups or {}) do
          walk(g, map, file)
        end
      end
    end
    return
  end
  for _, x in ipairs(node) do
    walk(x, map, file)
  end
end

local att = io.popen('find "' .. attDir .. '" -name "*.lua" | sort')
for path in att:lines() do
  local file = path:sub(#attDir + 2) -- ("zones/Durotar.lua")
  for _, r in ipairs(readATT(path)) do
    walk(r, nil, file)
  end
end
att:close()

-- ── QuestieDB's traces ──────────────────────────────────────────────────────
local function keys() return setmetatable({}, { __index = function(_, k) return k end }) end
local QuestieDB = { questKeys = keys(), npcKeys = keys(), objectKeys = keys(), itemKeys = keys() }
local modules = {}
QuestieLoader = {
  CreateModule = function(_, name)
    local m = {}
    modules[name] = m
    return m
  end,
  ImportModule = function(_, name) return name == "QuestieDB" and QuestieDB or {} end,
}
local traces = {}
for _, f in ipairs({ "foreverQuestTraces", "foreverNpcTraces", "foreverObjectTraces", "foreverItemTraces" }) do
  dofile(questieDir .. "/" .. f .. ".lua")
end
for name, m in pairs(modules) do
  traces[name] = m:Load()
end
-- (an "_add" field adds to what the base data has: here, the same field)
local function fields(t)
  local out = {}
  for k, v in pairs(t) do
    out[(tostring(k):gsub("_add$", ""))] = v
  end
  return out
end
local function byId(t)
  local out = {}
  for id, v in pairs(t or {}) do
    out[tostring(id)] = fields(v)
  end
  return out
end

io.write(json({
  att = { quests = quests, npcs = npcs },
  traces = {
    quests = byId(traces.ForeverQuestTraces),
    npcs = byId(traces.ForeverNpcTraces),
    objects = byId(traces.ForeverObjectTraces),
    items = byId(traces.ForeverItemTraces),
  },
}))
