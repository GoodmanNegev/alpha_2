// Procedurally drawn terrain tiles (walls, doors, stairs, lava…).  Everything
// is rendered once into small offscreen canvases and cached; animated tiles
// have two frames.

import { T } from '../data/tiles.js';
import { TILE, SCALE } from './sprites.js';

const S = TILE * SCALE; // 32

const px = (ctx, x, y, w, h, color) => {
  ctx.fillStyle = color;
  ctx.fillRect(x * SCALE, y * SCALE, w * SCALE, h * SCALE);
};

function floor(ctx, variant = 0) {
  px(ctx, 0, 0, 16, 16, '#222c32');
  px(ctx, 1, 1, 15, 15, ['#3b484e', '#3d4b50', '#39464c', '#3c494d'][variant]);
  px(ctx, 1, 1, 15, 1, '#526067');
  px(ctx, 1, 2, 1, 13, '#46555b');
  px(ctx, 2, 15, 14, 1, '#303e44');
  const x = 3 + variant * 2;
  px(ctx, x, 4, 2, 1, '#47565b');
  px(ctx, 12 - variant, 11, 1, 1, '#303e44');
  if (variant === 2) {
    px(ctx, 2, 10, 3, 1, '#303e44');
    px(ctx, 5, 11, 1, 2, '#303e44');
  }
}

function wall(ctx, variant = 0) {
  px(ctx, 0, 0, 16, 16, '#252528');
  for (let row = 0; row < 3; row++) {
    const off = row % 2 ? 4 : 0;
    for (let c = -1; c < 3; c++) {
      const x = c * 8 + off;
      const y = row * 5;
      px(ctx, x + 1, y + 1, 7, 4, ['#746550', '#6d6051', '#796954', '#706350'][(row + variant) % 4]);
      px(ctx, x + 1, y + 1, 7, 1, '#958269');
      px(ctx, x + 1, y + 2, 1, 2, '#82725c');
      px(ctx, x + 2, y + 4, 6, 1, '#4c443b');
    }
  }
  px(ctx, 0, 15, 16, 1, '#181f25');
  if (variant === 1) {
    px(ctx, 2, 12, 3, 1, '#56614b');
    px(ctx, 3, 13, 1, 1, '#627054');
  }
}

function door(ctx, main, dark, light) {
  floor(ctx);
  px(ctx, 1, 0, 14, 16, '#2a2118');
  px(ctx, 2, 1, 12, 15, main);
  px(ctx, 2, 1, 12, 1, light);
  px(ctx, 2, 1, 1, 15, light);
  px(ctx, 13, 1, 1, 15, dark);
  px(ctx, 2, 15, 12, 1, dark);
  px(ctx, 4, 3, 3, 4, dark);
  px(ctx, 9, 3, 3, 4, dark);
  px(ctx, 4, 9, 3, 5, dark);
  px(ctx, 9, 9, 3, 5, dark);
  px(ctx, 7, 8, 2, 2, '#14121a');
  px(ctx, 7, 10, 2, 1, '#14121a');
  for (const y of [4, 12]) {
    px(ctx, 2, y, 3, 1, '#343234');
    px(ctx, 11, y, 3, 1, '#343234');
    px(ctx, 3, y, 1, 1, '#c6b494');
    px(ctx, 12, y, 1, 1, '#c6b494');
  }
}

function ironDoor(ctx) {
  floor(ctx);
  px(ctx, 1, 0, 14, 16, '#2a2a30');
  px(ctx, 2, 1, 12, 15, '#7d8190');
  px(ctx, 2, 1, 12, 1, '#a9adba');
  px(ctx, 2, 1, 1, 15, '#a9adba');
  px(ctx, 13, 1, 1, 15, '#555964');
  px(ctx, 2, 5, 12, 1, '#555964');
  px(ctx, 2, 10, 12, 1, '#555964');
  for (const [x, y] of [[3, 2], [12, 2], [3, 7], [12, 7], [3, 12], [12, 12]]) px(ctx, x, y, 1, 1, '#c9ced8');
  px(ctx, 7, 7, 2, 2, '#14121a');
}

function fence(ctx, gate) {
  floor(ctx);
  const bar = gate ? '#8a6a2a' : '#3a3a48';
  const hi = gate ? '#e0b23c' : '#8b8f99';
  px(ctx, 0, 3, 16, 1, bar);
  px(ctx, 0, 12, 16, 1, bar);
  for (let x = 1; x < 16; x += 3) {
    px(ctx, x, 1, 1, 14, bar);
    px(ctx, x, 1, 1, 1, hi);
  }
  if (gate) {
    px(ctx, 6, 6, 4, 4, '#14121a');
    px(ctx, 7, 7, 2, 2, '#f2c94c');
  }
}

function stairs(ctx, up) {
  floor(ctx);
  px(ctx, 2, 1, 12, 14, '#1a252b');
  px(ctx, 2, 1, 1, 14, '#708189');
  px(ctx, 13, 1, 1, 14, '#253038');
  for (let i = 0; i < 4; i++) {
    const y = 3 + i * 3;
    px(ctx, 3, y, 10, 1, up ? '#b2b8ac' : '#647d89');
    px(ctx, 3, y + 1, 10, 2, up ? '#68766f' : '#354953');
  }
  const ay = up ? 2 : 10;
  const color = up ? '#f4d584' : '#8ed5ed';
  px(ctx, 6, ay, 4, 5, '#1a252b');
  px(ctx, 7, ay, 2, 5, color);
  px(ctx, 6, ay + (up ? 1 : 3), 4, 1, color);
  px(ctx, 5, ay + 2, 6, 1, color);
}

function lava(ctx, frame) {
  px(ctx, 0, 0, 16, 16, '#6d2c24');
  const blobs = frame ? [[2, 3, 4, 2], [9, 6, 5, 3], [3, 11, 6, 2], [11, 12, 3, 2]] : [[3, 2, 5, 2], [10, 5, 4, 3], [2, 10, 5, 3], [9, 12, 5, 2]];
  for (const [x, y, w, h] of blobs) {
    px(ctx, x - 1, y - 1, w + 2, h + 2, '#a5472b');
    px(ctx, x, y, w, h, '#e68a3a');
    px(ctx, x + 1, y, w - 2, 1, '#f7ce72');
  }
  px(ctx, 1, 6, 3, 2, '#452b2a');
  px(ctx, 7, 14, 4, 2, '#452b2a');
}

function sky(ctx, frame, variant = 0) {
  px(ctx, 0, 0, 16, 16, '#101d29');
  const stars = [[[3, 4], [12, 13]], [[8, 2]], [[2, 12], [11, 5]], [[6, 9]]][variant];
  for (const [x, y] of stars) px(ctx, x, y, 1, 1, '#4d6373');
  if (variant === 2) px(ctx, 11, 5, 1, 1, frame ? '#bdd2ce' : '#7b9aab');
}

function shopSide(ctx, left) {
  floor(ctx);
  px(ctx, 2, 2, 12, 12, '#7a5ad6');
  px(ctx, 3, 3, 10, 10, '#4a3a7a');
  px(ctx, 5, 5, 6, 6, '#e0b23c');
  px(ctx, 6, 6, 4, 4, '#fff0a6');
  px(ctx, left ? 12 : 0, 0, 4, 16, '#7a5ad6');
}

function portal(ctx, frame) {
  floor(ctx);
  const rings = frame ? ['#8a2be2', '#c9a6ff', '#4a1a8a'] : ['#c9a6ff', '#8a2be2', '#4a1a8a'];
  px(ctx, 3, 3, 10, 10, rings[0]);
  px(ctx, 4, 4, 8, 8, rings[1]);
  px(ctx, 6, 6, 4, 4, rings[2]);
  px(ctx, 7, 7, 2, 2, '#ffffff');
  px(ctx, 2, 7, 1, 2, rings[1]); px(ctx, 13, 7, 1, 2, rings[1]);
  px(ctx, 7, 2, 2, 1, rings[1]); px(ctx, 7, 13, 2, 1, rings[1]);
}

const DRAWERS = {
  [T.FLOOR]: (c, f, v) => floor(c, v),
  [T.TRIGGER_16F]: (c, f, v) => floor(c, v),
  [T.TRIGGER_19F]: (c, f, v) => floor(c, v),
  [T.WALL]: (c, f, v) => wall(c, v),
  [T.YELLOW_DOOR]: (c) => door(c, '#d9a441', '#8a5a1a', '#f2d16b'),
  [T.BLUE_DOOR]: (c) => door(c, '#3f6fd6', '#1f3a80', '#7aa0ff'),
  [T.RED_DOOR]: (c) => door(c, '#d9453d', '#7a1a1a', '#ff8a7a'),
  [T.IRON_DOOR]: (c) => ironDoor(c),
  [T.GATE]: (c) => fence(c, true),
  [T.FENCE]: (c) => fence(c, false),
  [T.STAIR_UP]: (c) => stairs(c, true),
  [T.STAIR_DOWN]: (c) => stairs(c, false),
  [T.LAVA]: (c, f) => lava(c, f),
  [T.SKY]: (c, f, v) => sky(c, f, v),
  [T.SHOP_LEFT]: (c) => shopSide(c, true),
  [T.SHOP_RIGHT]: (c) => shopSide(c, false),
  [T.PORTAL]: (c, f) => portal(c, f),
};

export function isTerrain(tile) {
  return Boolean(DRAWERS[tile]);
}

export class TerrainAtlas {
  constructor(makeCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h })) {
    this.makeCanvas = makeCanvas;
    this.cache = new Map();
  }

  get(tile, frame = 0, variant = 0) {
    // Only animated terrain needs separate frames; keep this atlas bounded.
    if (![T.LAVA, T.SKY, T.PORTAL].includes(tile)) frame = 0;
    if (![T.FLOOR, T.WALL, T.SKY, T.TRIGGER_16F, T.TRIGGER_19F].includes(tile)) variant = 0;
    const draw = DRAWERS[tile] ?? DRAWERS[T.FLOOR];
    const key = `${tile}/${frame}/${variant}`;
    let c = this.cache.get(key);
    if (!c) {
      c = this.makeCanvas(S, S);
      draw(c.getContext('2d'), frame, variant);
      this.cache.set(key, c);
    }
    return c;
  }
}

export const TILE_PX = S;
