// Sprite catalogue: which shape + palette every tile / speaker uses, plus a
// rasteriser that turns the text art into cached canvases.

import { T, DRAGON_CORE, DRAGON_PARTS, SHADOW_CORE, SHADOW_PARTS } from '../data/tiles.js';
import { MONSTERS } from '../data/monsters.js';
import { SHAPES, PALETTES } from './shapes.js';
import { DRAGON, SHADOW, BIG_PALETTES } from './bigShapes.js';

export const TILE = 16; // logical pixels per tile
export const SCALE = 2; // rasterisation scale (32px tiles)

const ITEM_SPRITES = {
  [T.YELLOW_KEY]: ['key', 'yellowKey'],
  [T.BLUE_KEY]: ['key', 'blueKey'],
  [T.RED_KEY]: ['key', 'redKey'],
  [T.BLUE_GEM]: ['gem', 'blueGem'],
  [T.RED_GEM]: ['gem', 'redGem'],
  [T.RED_POTION]: ['potion', 'redPotion'],
  [T.BLUE_POTION]: ['potion', 'bluePotion'],
  [T.SMALL_FEATHER]: ['feather', 'smallFeather'],
  [T.BIG_FEATHER]: ['feather', 'bigFeather'],
  [T.CROSS]: ['cross', 'cross'],
  [T.HOLY_WATER]: ['holyWater', 'holyWater'],
  [T.HOLY_BADGE]: ['badge', 'badge'],
  [T.WIND_COMPASS]: ['compass', 'compass'],
  [T.KEY_BOX]: ['keyBox', 'keyBox'],
  [T.STAR_HAMMER]: ['hammer', 'hammer'],
  [T.GOLD_NUGGET]: ['nugget', 'nugget'],
  [T.IRON_SWORD]: ['sword', 'ironSword'],
  [T.KNIGHT_SWORD]: ['sword', 'knightSword'],
  [T.HOLY_SWORD]: ['sword', 'holySword'],
  [T.IRON_SHIELD]: ['shield', 'ironShield'],
  [T.KNIGHT_SHIELD]: ['shield', 'knightShield'],
  [T.HOLY_SHIELD]: ['shield', 'holyShield'],
  [T.FIRE_STAFF]: ['staff', 'fireStaff'],
  [T.HEART_STAFF]: ['staff', 'heartStaff'],
};

const NPC_SPRITES = {
  [T.FAIRY]: ['fairy', 'fairy'],
  [T.THIEF]: ['thief', 'thief'],
  [T.OLD_MAN]: ['oldman', 'oldman'],
  [T.MERCHANT]: ['merchant', 'merchant'],
  [T.PRINCESS]: ['princess', 'princess'],
  [T.SHOP]: ['shop', 'shop'],
};

/** shape+palette for a tile id, or null for terrain. */
export function spriteFor(tile) {
  if (ITEM_SPRITES[tile]) return ITEM_SPRITES[tile];
  if (NPC_SPRITES[tile]) return NPC_SPRITES[tile];
  const m = MONSTERS[tile];
  if (m && !m.big) return [m.sprite, m.palette];
  return null;
}

/** Named sprites used outside the map (portraits, inventory, hero). */
export const NAMED = {
  heroDown: ['heroDown', 'hero'],
  heroUp: ['heroUp', 'hero'],
  heroLeft: ['heroLeft', 'hero'],
  heroRight: ['heroRight', 'hero'],
  fairy: ['fairy', 'fairy'],
  thief: ['thief', 'thief'],
  oldman: ['oldman', 'oldman'],
  merchant: ['merchant', 'merchant'],
  princess: ['princess', 'princess'],
  shop: ['shop', 'shop'],
  iceStaff: ['staff', 'iceStaff'],
  cross: ['cross', 'cross'],
  manual: ['badge', 'badge'],
  fly: ['compass', 'compass'],
  hammer: ['hammer', 'hammer'],
  fireStaff: ['staff', 'fireStaff'],
  heartStaff: ['staff', 'heartStaff'],
};

/** All (shape, palette) pairs the game can ask for — used by the validation test. */
export function allCombos() {
  const combos = [];
  for (const [shape, palette] of Object.values(ITEM_SPRITES)) combos.push([shape, palette]);
  for (const [shape, palette] of Object.values(NPC_SPRITES)) combos.push([shape, palette]);
  for (const [shape, palette] of Object.values(NAMED)) combos.push([shape, palette]);
  for (const [id, m] of Object.entries(MONSTERS)) if (!m.big) combos.push([m.sprite, m.palette, `m${id}`]);
  return combos;
}

/** Rasterise text art into an ImageData-compatible canvas. */
export function rasterise(rows, palette, scale, makeCanvas) {
  const h = rows.length;
  const w = rows[0].length;
  const canvas = makeCanvas(w * scale, h * scale);
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const color = palette[ch];
      if (!color) throw new Error(`no colour for '${ch}' in palette`);
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return canvas;
}

export class SpriteAtlas {
  constructor(makeCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h })) {
    this.makeCanvas = makeCanvas;
    this.cache = new Map();
  }

  get(shape, palette) {
    const key = `${shape}/${palette}`;
    let c = this.cache.get(key);
    if (!c) {
      const rows = SHAPES[shape];
      const pal = PALETTES[palette];
      if (!rows) throw new Error(`unknown shape ${shape}`);
      if (!pal) throw new Error(`unknown palette ${palette}`);
      c = rasterise(rows, pal, SCALE, this.makeCanvas);
      this.cache.set(key, c);
    }
    return c;
  }

  named(name) {
    const [shape, palette] = NAMED[name];
    return this.get(shape, palette);
  }

  tile(tileId) {
    const sp = spriteFor(tileId);
    return sp ? this.get(sp[0], sp[1]) : null;
  }

  /** The 48x48 boss art, keyed by its core tile id. */
  big(coreId) {
    const key = `big/${coreId}`;
    let c = this.cache.get(key);
    if (!c) {
      const rows = coreId === DRAGON_CORE ? DRAGON : SHADOW;
      const pal = coreId === DRAGON_CORE ? BIG_PALETTES.dragon : BIG_PALETTES.blood;
      c = rasterise(rows, pal, SCALE, this.makeCanvas);
      this.cache.set(key, c);
    }
    return c;
  }
}

/** Which big boss a body-part tile belongs to (and its offset within the 3x3). */
export function bigPart(tile) {
  const di = DRAGON_PARTS.indexOf(tile);
  if (tile === DRAGON_CORE) return { core: DRAGON_CORE, dx: 1, dy: 2 };
  if (di >= 0) return { core: DRAGON_CORE, ...PART_OFFSETS[di] };
  const si = SHADOW_PARTS.indexOf(tile);
  if (tile === SHADOW_CORE) return { core: SHADOW_CORE, dx: 1, dy: 2 };
  if (si >= 0) return { core: SHADOW_CORE, ...PART_OFFSETS[si] };
  return null;
}

// order of the 8 body parts: top row, middle row, bottom-left, bottom-right
const PART_OFFSETS = [
  { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 },
  { dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 },
  { dx: 0, dy: 2 }, { dx: 2, dy: 2 },
];
