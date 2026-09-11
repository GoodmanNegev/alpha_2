import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPath } from '../src/engine/path.js';
import { newGame, dispatch } from '../src/engine/reducer.js';
import { patchHero, setTile } from '../src/engine/state.js';
import { T } from '../src/data/tiles.js';

function at(floor, x, y) {
  let s = newGame(0).state;
  while (s.pending) s = dispatch(s, { type: 'CONFIRM' }).state;
  return patchHero({ ...s, floor }, { x, y });
}

test('finds the shortest route over floor tiles', () => {
  // 1F with the red door at (5,8) already open: arrival (5,9) -> (10,0)
  const s = setTile(at(1, 5, 9), 1, 5, 8, T.FLOOR);
  const path = findPath(s, 10, 0);
  assert.ok(path);
  assert.equal(path.length, 14);
  assert.deepEqual(path.slice(0, 2), ['up', 'up']);
});

test('routes stop next to blocking targets (doors, monsters) and bump into them', () => {
  const s = at(1, 5, 9);
  assert.deepEqual(findPath(s, 5, 8), ['up']); // red door directly above
  assert.equal(findPath(s, 7, 5), null); // 绿头怪 behind a yellow door: unreachable
  const open = setTile(s, 1, 5, 8, T.FLOOR);
  const toMonster = findPath(open, 6, 5); // 初级法师 at (6,5) is reached via the yellow door (5,5)? no: via (6,4)? wall
  assert.equal(toMonster, null);
  const toSoldier = findPath(open, 1, 8); // 骷髅士兵 at (1,8) via the yellow door (1,7): blocked
  assert.equal(toSoldier, null);
});

test('returns null for unreachable or solid targets and an empty path for the current cell', () => {
  const s = at(1, 5, 9);
  assert.equal(findPath(s, 3, 9), null); // wall
  assert.deepEqual(findPath(s, 5, 9), []);
});

test('items along the way are walked over, the last step may bump a monster', () => {
  let s = setTile(at(1, 5, 9), 1, 5, 8, T.FLOOR);
  s = setTile(s, 1, 5, 7, 40); // put a slime in the corridor
  assert.deepEqual(findPath(s, 5, 7), ['up', 'up']);
  assert.deepEqual(findPath(s, 4, 9), ['left']); // the red key
});
