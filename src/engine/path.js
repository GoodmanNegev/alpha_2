// Breadth-first path finding for click-to-move.  The route only crosses cells
// the hero can walk through without side effects (floor, items, triggers);
// doors, monsters, NPCs, gates and stairs are acceptable only as the final
// cell, which the hero then bumps into.

import { T, isItem, isMonster, isNpc, isSolid, isStair, isWalkable } from '../data/tiles.js';
import { DIRS } from './move.js';

function passThrough(tile) {
  return (tile === T.FLOOR || tile === T.TRIGGER_16F || tile === T.TRIGGER_19F || isItem(tile));
}

function canBeTarget(tile) {
  return !isSolid(tile) && tile !== T.SHOP_LEFT && tile !== T.SHOP_RIGHT && (isWalkable(tile) || isItem(tile) || isMonster(tile) || isNpc(tile) || tile === T.SHOP || tile === T.GATE || tile === T.IRON_DOOR || tile === T.PORTAL || tile === T.YELLOW_DOOR || tile === T.BLUE_DOOR || tile === T.RED_DOOR || isStair(tile));
}

/** @returns {string[]|null} list of directions, [] if already there, null if unreachable */
export function findPath(state, tx, ty) {
  const rows = state.maps[state.floor];
  const { x: sx, y: sy } = state.hero;
  if (sx === tx && sy === ty) return [];
  if (tx < 0 || ty < 0 || tx > 10 || ty > 10) return null;
  if (!canBeTarget(rows[ty][tx])) return null;

  const prev = new Map();
  const key = (x, y) => y * 11 + x;
  const queue = [[sx, sy]];
  prev.set(key(sx, sy), null);
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 10 || ny > 10) continue;
      const k = key(nx, ny);
      if (prev.has(k)) continue;
      const isTarget = nx === tx && ny === ty;
      const tile = rows[ny][nx];
      if (!isTarget && !passThrough(tile)) continue;
      prev.set(k, { from: key(x, y), dir });
      if (isTarget) return rebuild(prev, k);
      queue.push([nx, ny]);
    }
  }
  return null;
}

function rebuild(prev, k) {
  const dirs = [];
  for (let cur = prev.get(k); cur; cur = prev.get(cur.from)) dirs.push(cur.dir);
  return dirs.reverse();
}
