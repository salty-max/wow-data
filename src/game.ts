// The game's numbers the database keeps as numbers, worded for a page or a card (the
// 1.x client's own enums; the client has no table for these).
export const NPC_FLAGS: [number, string][] = [
  [1, "Gossip"],
  [2, "Quest giver"],
  [4, "Vendor"],
  [8, "Flight master"],
  [16, "Trainer"],
  [32, "Spirit healer"],
  [64, "Spirit guide"],
  [128, "Innkeeper"],
  [256, "Banker"],
  [512, "Petitioner"],
  [1024, "Tabard designer"],
  [2048, "Battlemaster"],
  [4096, "Auctioneer"],
  [8192, "Stable master"],
  [16384, "Repairs"],
];
export const RANKS = ["Normal", "Elite", "Rare elite", "Boss", "Rare"];
export const UNIT_CLASSES: Record<number, string> = { 1: "Warrior", 2: "Paladin", 4: "Rogue", 8: "Mage" };

export const OBJECT_TYPES = [
  "Door", "Button", "Quest giver", "Chest", "Binder", "Generic", "Trap", "Chair", "Spell focus", "Text", "Goober",
  "Transport", "Area damage", "Camera", "Map object", "Mo transport", "Duel arbiter", "Fishing node", "Ritual",
  "Mailbox", "Auction house", "Guard post", "Spell caster", "Meeting stone", "Flag stand", "Fishing hole",
  "Flag drop", "Mini game", "Lottery kiosk", "Capture point", "Aura generator", "Dungeon difficulty",
];
export const LOCK_TYPES: Record<number, string> = {
  1: "Lockpicking", 2: "Herbalism", 3: "Mining", 4: "Disarm trap", 5: "Open", 6: "Treasure", 7: "Calcified elven gems",
  8: "Close", 9: "Arm trap", 10: "Quick open", 11: "Quick close", 12: "Open tinkering", 13: "Open kneeling",
  14: "Open attacking", 15: "Gahz'ridian", 16: "Blasting", 17: "Slow open", 18: "Slow close", 19: "Fishing",
};

export const QUALITIES = ["Poor", "Common", "Uncommon", "Rare", "Epic", "Legendary", "Artifact", "Heirloom"];
export const ITEM_CLASSES: Record<number, [string, Record<number, string>?]> = {
  0: ["Consumable"],
  1: ["Container", { 0: "Bag", 1: "Soul bag", 2: "Herb bag", 3: "Enchanting bag", 4: "Engineering bag" }],
  2: ["Weapon", {
    0: "One-handed axe", 1: "Two-handed axe", 2: "Bow", 3: "Gun", 4: "One-handed mace", 5: "Two-handed mace",
    6: "Polearm", 7: "One-handed sword", 8: "Two-handed sword", 10: "Staff", 13: "Fist weapon", 14: "Miscellaneous",
    15: "Dagger", 16: "Thrown", 17: "Spear", 18: "Crossbow", 19: "Wand", 20: "Fishing pole",
  }],
  3: ["Gem"],
  4: ["Armor", { 0: "Miscellaneous", 1: "Cloth", 2: "Leather", 3: "Mail", 4: "Plate", 5: "Buckler", 6: "Shield", 7: "Libram", 8: "Idol", 9: "Totem" }],
  5: ["Reagent"],
  6: ["Projectile", { 2: "Arrow", 3: "Bullet" }],
  7: ["Trade goods", { 0: "Trade goods", 1: "Parts", 2: "Explosives", 3: "Devices" }],
  9: ["Recipe", { 0: "Book", 1: "Leatherworking", 2: "Tailoring", 3: "Engineering", 4: "Blacksmithing", 5: "Cooking", 6: "Alchemy", 7: "First aid", 8: "Enchanting", 9: "Fishing" }],
  11: ["Quiver", { 2: "Quiver", 3: "Ammo pouch" }],
  12: ["Quest"],
  13: ["Key"],
  15: ["Miscellaneous", { 0: "Junk", 1: "Reagent", 2: "Pet", 3: "Holiday", 4: "Other", 5: "Mount" }],
};
export const SLOTS: Record<number, string> = {
  1: "Head", 2: "Neck", 3: "Shoulder", 4: "Shirt", 5: "Chest", 6: "Waist", 7: "Legs", 8: "Feet", 9: "Wrist",
  10: "Hands", 11: "Finger", 12: "Trinket", 13: "One-hand", 14: "Shield", 15: "Ranged", 16: "Back", 17: "Two-hand",
  18: "Bag", 19: "Tabard", 20: "Chest", 21: "Main hand", 22: "Off hand", 23: "Held in off-hand", 24: "Ammo",
  25: "Thrown", 26: "Ranged", 28: "Relic",
};

// the bits of a mask set, low to high
export function bits(mask: number | null | undefined): number[] {
  const out: number[] = [];
  if (!mask) return out;
  for (let b = 0; b < 64; b++) if (Math.floor(mask / 2 ** b) % 2 === 1) out.push(b);
  return out;
}
export const flagWords = (mask: number | null | undefined, flags: [number, string][]) =>
  flags.filter(([bit]) => mask != null && (mask & bit) !== 0).map(([, word]) => word);
