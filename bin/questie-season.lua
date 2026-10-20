-- What Season of Discovery has that Classic Era hasn't, and what Forever's
-- players met, from QuestieDB at its pin, as one JSON document for
-- src/questie.ts: Questie's SoD base (src/corrections/Sod/sodBase*.lua) and
-- its Forever traces (src/corrections/Forever/traces/, its players' own,
-- gathered in the game), each by its ids. Run with real Lua 5.1 from a
-- checkout of QuestieDB at its pin:
--   cd <QuestieDB> && lua5.1 <wow-data>/bin/questie-season.lua
-- The files are loaded as Questie loads them: a module each, its Load
-- function called. Their keys stand for the fields' names; the enums
-- (races, classes, zones) are only read as numbers.
local modules = {}
local function module(_, name)
  modules[name] = modules[name] or {}
  return modules[name]
end
_G.QuestieLoader = { CreateModule = module, ImportModule = module }
local fields = setmetatable({}, { __index = function(_, k) return k end })
local numbers = setmetatable({}, { __index = function() return 0 end })
local db = module(nil, "QuestieDB")
db.npcKeys, db.objectKeys, db.questKeys, db.itemKeys = fields, fields, fields, fields
db.raceKeys, db.classKeys, db.sortKeys = numbers, numbers, numbers
module(nil, "ZoneDB").zoneIDs = numbers

local function load(file, name, fn)
  dofile(file)
  return modules[name][fn](modules[name])
end
local sets = { sod = {}, traced = {} }
for _, k in ipairs({ "creature", "object", "quest", "item" }) do
  sets.sod[k], sets.traced[k] = {}, {}
end
local function add(set, kind, ids)
  for _, id in pairs(type(ids) == "table" and ids or { ids }) do
    if type(id) == "number" then set[kind][id] = true end
  end
end

-- ── Season of Discovery's base ──────────────────────────────────────────────
local SOD = "src/corrections/Sod/"
for _, f in ipairs({
  { "sodBaseNPCs.lua", "LoadBaseNPCs", "creature" },
  { "sodBaseObjects.lua", "LoadBaseObjects", "object" },
  { "sodBaseQuests.lua", "LoadBaseQuests", "quest" },
  { "sodBaseItems.lua", "LoadBaseItems", "item" },
}) do
  for id in pairs(load(SOD .. f[1], "SeasonOfDiscovery", f[2])) do
    sets.sod[f[3]][id] = true
  end
end

-- ── what Forever's traces saw ───────────────────────────────────────────────
-- (a creature or an object, and the quests it starts and ends; a quest, and
-- the creatures and objects that start and end it; an item, and what it was
-- looted from)
local TRACES = "src/corrections/Forever/traces/"
local traced = sets.traced
for _, f in ipairs({ { "foreverNpcTraces.lua", "ForeverNpcTraces", "creature" }, { "foreverObjectTraces.lua", "ForeverObjectTraces", "object" } }) do
  for id, r in pairs(load(TRACES .. f[1], f[2], "Load")) do
    add(traced, f[3], id)
    add(traced, "quest", r.questStarts_add)
    add(traced, "quest", r.questEnds_add)
  end
end
for id, r in pairs(load(TRACES .. "foreverQuestTraces.lua", "ForeverQuestTraces", "Load")) do
  add(traced, "quest", id)
  for _, by in ipairs({ r.startedBy_add or {}, r.finishedBy_add or {} }) do
    add(traced, "creature", by[1])
    add(traced, "object", by[2])
  end
end
for id, r in pairs(load(TRACES .. "foreverItemTraces.lua", "ForeverItemTraces", "Load")) do
  add(traced, "item", id)
  add(traced, "creature", r.npcDrops_add)
  add(traced, "object", r.objectDrops_add)
end

-- ── out, each set as its sorted ids ─────────────────────────────────────────
local out = {}
for _, group in ipairs({ "sod", "traced" }) do
  local kinds = {}
  for _, k in ipairs({ "creature", "object", "quest", "item" }) do
    local ids = {}
    for id in pairs(sets[group][k]) do
      ids[#ids + 1] = id
    end
    table.sort(ids)
    for i, id in ipairs(ids) do
      ids[i] = ("%d"):format(id)
    end
    kinds[#kinds + 1] = ('"%s":[%s]'):format(k, table.concat(ids, ","))
  end
  out[#out + 1] = ('"%s":{%s}'):format(group, table.concat(kinds, ","))
end
io.write("{", table.concat(out, ","), "}\n")
