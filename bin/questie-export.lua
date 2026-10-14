-- QuestieDB's merged database for one game, and its translations, as one
-- JSON document for src/questie.ts. Run with real Lua 5.1 (LuaJIT caps a
-- chunk's constants below Questie's tables) from a checkout of QuestieDB at
-- its pin:
--   cd <QuestieDB> && lua5.1 <wow-data>/bin/questie-export.lua <Vanilla|Forever> <locale,...>
-- The merging is Questie's own (generator/flavor.lua: the raw base, every
-- Static Correction layer and the Derived Passes, as its generator does):
-- nothing of its layering is interpreted here. Each record by its fields'
-- names, nil fields left out.
local flavorName = assert(arg[1], "usage: questie-export.lua <Vanilla|Forever> <locales>")
local locales = {}
for l in (arg[2] or ""):gmatch("[^,]+") do
  table.insert(locales, l)
end

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
local buffer = {}
local function emit(s) buffer[#buffer + 1] = s end
local function json(v)
  local t = type(v)
  if t == "nil" then return emit("null") end
  if t == "boolean" then return emit(tostring(v)) end
  if t == "number" then return emit((v % 1 == 0 and ("%d"):format(v)) or ("%.4f"):format(v)) end
  if t == "string" then
    return emit('"' .. v:gsub('[%c"\\]', function(c)
      local map = { ['"'] = '\\"', ["\\"] = "\\\\", ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t" }
      return map[c] or ("\\u%04x"):format(c:byte())
    end) .. '"')
  end
  if isArray(v) then
    emit("[")
    for i = 1, #v do
      if i > 1 then emit(",") end
      json(v[i])
    end
    return emit("]")
  end
  emit("{")
  local first = true
  for k, x in pairs(v) do
    if not first then emit(",") end
    first = false
    json(tostring(k))
    emit(":")
    json(x)
  end
  emit("}")
end

-- ── the merged database, Questie's own way ──────────────────────────────────
local config = dofile("src/config.lua")
local flavor = assert(config.flavorByName[flavorName], "no flavor " .. flavorName)
local loaded = dofile("generator/flavor.lua").load(flavor)
local out = { flavor = flavorName, l10n = {} }
for _, kind in ipairs({ { "Quest", "quests" }, { "Npc", "npcs" }, { "Object", "objects" }, { "Item", "items" } }) do
  local entry = assert(loaded[kind[1]], "no " .. kind[1])
  local names = entry.meta.names -- (field index -> name)
  local records = {}
  for id, row in pairs(entry.entities) do
    local rec = {}
    for i, name in pairs(names) do
      if row[i] ~= nil then rec[name] = row[i] end
    end
    records[tostring(id)] = rec
  end
  out[kind[2]] = records
end

-- ── the translations: { quests: { id: [ title, objectivesText ] }, npcs: { id:
-- [ name, title ] }, objects: { id: name }, items: { id: name } }
local l10n = { questLookup = {}, npcNameLookup = {}, objectLookup = {}, itemLookup = {} }
local lookups = { { "Quests", "quests" }, { "Npcs", "npcs" }, { "Objects", "objects" }, { "Items", "items" } }
for _, locale in ipairs(locales) do
  local tables = {}
  for _, kind in ipairs(lookups) do
    local file = ("l10n/%s/lookup%s/%s.lua"):format(flavor.expansion, kind[1], locale)
    local f = io.open(file)
    if f then
      local text = f:read("*a")
      f:close()
      local body = text:match("loadstring%(%[%[(.*)%]%]%)")
      local records = {}
      if body then
        for id, v in pairs(assert(loadstring(body))()) do
          records[tostring(id)] = v
        end
      end
      tables[kind[2]] = records
    end
  end
  out.l10n[locale] = tables
end
json(out)
io.write(table.concat(buffer))
