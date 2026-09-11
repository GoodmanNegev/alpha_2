// Tile IDs mirror the numbering recovered from the original Flash game
// (魔塔 v1.12 / 24层) so the generated floor data can be diffed against
// the reference 1:1.  Anything ≥ 300 is our own addition.

export const T = Object.freeze({
  FLOOR: 0,
  WALL: 1,
  YELLOW_DOOR: 2,
  BLUE_DOOR: 3,
  RED_DOOR: 4,
  IRON_DOOR: 5,        // locked until a story event opens it (2F)
  YELLOW_KEY: 6,
  BLUE_KEY: 7,
  RED_KEY: 8,
  BLUE_GEM: 9,
  RED_GEM: 10,
  RED_POTION: 11,
  BLUE_POTION: 12,
  STAIR_UP: 13,
  STAIR_DOWN: 14,
  FENCE: 15,
  LAVA: 19,
  SKY: 20,
  SHOP_LEFT: 21,
  SHOP: 22,
  SHOP_RIGHT: 23,
  FAIRY: 24,
  THIEF: 25,
  OLD_MAN: 26,
  MERCHANT: 27,
  PRINCESS: 28,
  SMALL_FEATHER: 30,
  BIG_FEATHER: 31,
  CROSS: 32,
  HOLY_WATER: 33,
  HOLY_BADGE: 34,      // 圣光徽 – monster manual
  WIND_COMPASS: 35,    // 风之罗盘 – floor teleport
  KEY_BOX: 36,
  STAR_HAMMER: 38,     // 星光神榔 – the thief's hammer
  GOLD_NUGGET: 39,
  IRON_SWORD: 71,
  KNIGHT_SWORD: 73,
  HOLY_SWORD: 75,
  IRON_SHIELD: 76,
  KNIGHT_SHIELD: 78,
  HOLY_SHIELD: 80,
  GATE: 115,           // iron gate – opens when walked into
  TRIGGER_16F: 119,    // invisible trigger: boss dialogue on 16F
  TRIGGER_19F: 129,    // invisible trigger: boss dialogue on 19F
  FIRE_STAFF: 202,     // 炎之灵杖
  HEART_STAFF: 203,    // 心之灵杖
  PORTAL: 300,         // one-way portal to the final hidden floor
  // upgraded boss variants placed by the map (not in the reference numbering)
  RED_KING_2: 153,     // 红衣魔王 (19F guards)
  VAMPIRE_2: 159,      // 冥灵魔王 true form (21F)
  VAMPIRE_3: 259,      // 冥灵魔王 phantoms (hidden floors)
});

export const MONSTER_MIN = 40;
export const MONSTER_MAX = 70;

// 3x3 boss sprites on the final hidden floor.  Only the centre-bottom cell
// is the actual enemy; the other eight are impassable body parts.
export const DRAGON_PARTS = [181, 182, 183, 184, 185, 186, 187, 189];
export const DRAGON_CORE = 188;
export const SHADOW_PARTS = [191, 192, 193, 194, 195, 196, 197, 199];
export const SHADOW_CORE = 198;

export function isMonster(tile) {
  return (
    (tile >= MONSTER_MIN && tile <= MONSTER_MAX) ||
    tile === T.RED_KING_2 ||
    tile === T.VAMPIRE_2 ||
    tile === T.VAMPIRE_3 ||
    tile === DRAGON_CORE ||
    tile === SHADOW_CORE
  );
}

export function isDoor(tile) {
  return tile === T.YELLOW_DOOR || tile === T.BLUE_DOOR || tile === T.RED_DOOR;
}

export function isNpc(tile) {
  return tile >= T.FAIRY && tile <= T.PRINCESS;
}

export function isStair(tile) {
  return tile === T.STAIR_UP || tile === T.STAIR_DOWN;
}

const SOLID = new Set([
  T.WALL, T.FENCE, T.LAVA, T.SKY, T.SHOP_LEFT, T.SHOP_RIGHT,
  ...DRAGON_PARTS, ...SHADOW_PARTS,
]);

// Tiles the hero simply walks over / onto with no interaction.
export function isWalkable(tile) {
  return tile === T.FLOOR || isStair(tile) || tile === T.TRIGGER_16F || tile === T.TRIGGER_19F;
}

export function isSolid(tile) {
  return SOLID.has(tile);
}

// Item tiles: picked up by walking into them.
export const ITEM_TILES = new Set([
  T.YELLOW_KEY, T.BLUE_KEY, T.RED_KEY, T.BLUE_GEM, T.RED_GEM, T.RED_POTION,
  T.BLUE_POTION, T.SMALL_FEATHER, T.BIG_FEATHER, T.CROSS, T.HOLY_WATER,
  T.HOLY_BADGE, T.WIND_COMPASS, T.KEY_BOX, T.STAR_HAMMER, T.GOLD_NUGGET,
  T.IRON_SWORD, T.KNIGHT_SWORD, T.HOLY_SWORD, T.IRON_SHIELD, T.KNIGHT_SHIELD,
  T.HOLY_SHIELD, T.FIRE_STAFF, T.HEART_STAFF,
]);

export function isItem(tile) {
  return ITEM_TILES.has(tile);
}

// Every tile id the renderer / validator must know about.
export const KNOWN_TILES = new Set([
  ...Object.values(T),
  ...Array.from({ length: MONSTER_MAX - MONSTER_MIN + 1 }, (_, i) => MONSTER_MIN + i),
  ...DRAGON_PARTS, DRAGON_CORE, ...SHADOW_PARTS, SHADOW_CORE,
]);
