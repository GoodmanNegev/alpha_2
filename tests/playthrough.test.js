// Structural completability: a "god mode" hero walks the real maps through
// the real engine, following the intended story order, and must reach both
// endings.  This guards the map data, stair wiring and every story trigger.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, newGame } from '../src/engine/reducer.js';
import { patchHero } from '../src/engine/state.js';
import { DIRS } from '../src/engine/move.js';
import { T, isSolid } from '../src/data/tiles.js';

function drain(state, picks = []) {
  let s = state;
  let guard = 0;
  while (s.pending && guard++ < 300) {
    const k = s.pending.kind;
    const action = k === 'say' ? { type: 'CONFIRM' } : k === 'choices' ? { type: 'CHOOSE', index: picks.length ? picks.shift() : 0 } : { type: 'CLOSE' };
    s = dispatch(s, action).state;
  }
  return s;
}

/** BFS that treats doors, gates and monsters as passable (god mode). */
function route(state, tx, ty) {
  const rows = state.maps[state.floor];
  const { x: sx, y: sy } = state.hero;
  const key = (x, y) => y * 11 + x;
  const prev = new Map([[key(sx, sy), null]]);
  const queue = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === tx && y === ty) {
      const dirs = [];
      for (let cur = prev.get(key(x, y)); cur; cur = prev.get(cur.from)) dirs.push(cur.dir);
      return dirs.reverse();
    }
    for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 10 || ny > 10 || prev.has(key(nx, ny))) continue;
      const tile = rows[ny][nx];
      const isTarget = nx === tx && ny === ty;
      if (!isTarget && (isSolid(tile) || tile === T.STAIR_UP || tile === T.STAIR_DOWN || tile === T.PORTAL || tile === T.IRON_DOOR)) continue;
      if (!isTarget && (tile === T.FAIRY || tile === T.THIEF || tile === T.OLD_MAN || tile === T.MERCHANT || tile === T.PRINCESS || tile === T.SHOP)) continue;
      prev.set(key(nx, ny), { from: key(x, y), dir });
      queue.push([nx, ny]);
    }
  }
  return null;
}

/** Walk to (x,y) on the current floor, bumping through doors and monsters. */
function goto(state, x, y, picks = []) {
  const path = route(state, x, y);
  assert.ok(path, `no route on floor ${state.floor} from ${state.hero.x},${state.hero.y} to ${x},${y}`);
  let s = state;
  const target = s.maps[s.floor][y][x];
  const interactive = [T.FAIRY, T.THIEF, T.OLD_MAN, T.MERCHANT, T.PRINCESS, T.SHOP, T.PORTAL].includes(target);
  path.forEach((dir, i) => {
    if (interactive && i === path.length - 1) {
      s = drain(dispatch(s, { type: 'MOVE', dir }).state, picks);
      return;
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = s;
      s = drain(dispatch(s, { type: 'MOVE', dir }).state, picks);
      if (s.floor !== before.floor) return; // stairs / portal
      if (s.hero.x !== before.hero.x || s.hero.y !== before.hero.y) break;
      // a door or gate opened but the hero stayed: bump again
      if (attempt === 3) assert.fail(`stuck on floor ${s.floor} at ${s.hero.x},${s.hero.y} heading ${dir}`);
    }
  });
  return s;
}

const godMode = (s) => patchHero(s, { hp: 1e9, atk: 1e6, def: 1e6, gold: 1e6, exp: 1e6, keys: { yellow: 99, blue: 99, red: 99 } });

/** Climb from the current floor to `target` using the default staircases. */
function climb(state, target, upStairs) {
  let s = state;
  while (s.floor !== target) {
    const f = s.floor;
    const [x, y] = upStairs[f];
    s = goto(s, x, y);
    assert.equal(s.floor, f + 1, `stairs on ${f} should lead to ${f + 1}`);
  }
  return s;
}

// position of the up-staircase on each main floor
const UP = {
  0: [5, 0], 1: [0, 0], 2: [0, 10], 3: [10, 10], 4: [0, 10], 5: [9, 10], 6: [4, 10], 7: [0, 0], 8: [6, 4], 9: [6, 6],
  10: [0, 10], 11: [10, 10], 12: [0, 10], 13: [5, 10], 14: [4, 0], 15: [6, 0], 16: [5, 7], 17: [0, 10], 18: [10, 10], 19: [5, 3], 20: [5, 7],
};

test('the whole tower can be completed in the intended story order', () => {
  let s = godMode(drain(newGame(0).state));
  assert.deepEqual(s.hero.keys, { yellow: 99, blue: 99, red: 99 });

  // 3F: the shop works, and the iron sword is there
  s = climb(s, 3, UP);
  s = goto(s, 0, 0);
  assert.equal(s.maps[3][0][0], T.FLOOR);

  // 4F: free the thief -> 2F iron door opens
  s = climb(s, 4, UP);
  s = goto(s, 5, 1);
  s = goto(s, 5, 0);
  assert.equal(s.flags.thiefFreed, true);
  assert.equal(s.maps[2][6][1], T.FLOOR);

  // 7F: the cross
  s = climb(s, 7, UP);
  s = goto(s, 5, 4);
  assert.equal(s.items.cross, true);

  // 12F: the hammer, then back to the thief (fly is not required: walk)
  s = climb(s, 12, UP);
  s = goto(s, 10, 0);
  assert.equal(s.items.hammer, true);

  // 16F: old man's ice staff, boss dialogue and boss fight
  s = climb(s, 16, UP);
  s = goto(s, 5, 4); // trigger
  s = goto(s, 4, 4); // old man
  assert.equal(s.items.iceStaff, true);
  s = goto(s, 5, 5); // boss
  assert.equal(s.tier, 1);

  // give the hammer to the thief on 4F via the compass
  s = { ...s, items: { ...s.items, fly: true } };
  s = drain(dispatch(s, { type: 'FLY', floor: 4 }).state);
  assert.equal(s.floor, 4);
  s = goto(s, 5, 0);
  assert.equal(s.flags.thiefHammer, true);
  assert.equal(s.maps[18][8][5], T.FLOOR);

  // the cross to the fairy on 0F -> 20F stairs
  s = drain(dispatch(s, { type: 'FLY', floor: 0 }).state);
  s = goto(s, 4, 8);
  assert.equal(s.flags.crossGiven, true);
  assert.equal(s.maps[20][7][5], T.STAIR_UP);
  s = goto(s, 4, 8); // second talk: she explains the ice staff
  assert.equal(s.flags.staffExplained, true);

  // 18F: princess -> stairs to 19F
  s = drain(dispatch(s, { type: 'FLY', floor: 17 }).state);
  s = climb(s, 18, UP);
  s = goto(s, 5, 4);
  assert.equal(s.flags.princessTalked, true);
  assert.equal(s.maps[18][10][10], T.STAIR_UP);

  // 19F boss (through the trigger), 20F, 21F boss -> normal ending
  s = climb(s, 19, UP);
  s = goto(s, 5, 7);
  s = goto(s, 5, 6);
  assert.equal(s.flags.boss19Killed, true);
  s = climb(s, 21, UP);
  assert.equal(s.floor, 21);
  s = goto(s, 5, 1);
  assert.equal(s.ending, 'normal');
  assert.equal(s.tier, 2);

  // hidden floors: fairy hub, both staffs, the seal, the abyss
  s = goto(s, 5, 0);
  assert.equal(s.floor, 22);
  s = goto(s, 0, 5);
  assert.equal(s.floor, 23);
  s = goto(s, 4, 5);
  assert.equal(s.items.fireStaff, true);
  s = goto(s, 10, 5);
  assert.equal(s.floor, 22);
  s = goto(s, 10, 5);
  assert.equal(s.floor, 25);
  s = goto(s, 6, 5);
  assert.equal(s.items.heartStaff, true);
  s = goto(s, 0, 5);
  assert.equal(s.floor, 22);
  s = goto(s, 6, 2);
  assert.equal(s.flags.sealed, true);
  s = goto(s, 5, 10);
  assert.equal(s.floor, 24);
  s = goto(s, 5, 6, [0]);
  assert.equal(s.floor, 26);
  s = goto(s, 5, 3);
  assert.equal(s.ending, 'true');
});
