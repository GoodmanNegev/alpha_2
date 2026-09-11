import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLOORS, FLOOR_COUNT } from '../src/data/floors.js';
import { T, KNOWN_TILES, isMonster, isStair } from '../src/data/tiles.js';
import { MONSTERS } from '../src/data/monsters.js';
import { ITEMS } from '../src/data/items.js';
import { resolveExit } from '../src/engine/floor.js';

test('all 27 floors are 11x11 grids of known tiles', () => {
  assert.equal(FLOORS.length, FLOOR_COUNT);
  for (const fl of FLOORS) {
    assert.equal(fl.map.length, 11, `floor ${fl.id} rows`);
    for (const row of fl.map) {
      assert.equal(row.length, 11, `floor ${fl.id} cols`);
      for (const tile of row) assert.ok(KNOWN_TILES.has(tile), `floor ${fl.id} unknown tile ${tile}`);
    }
  }
});

test('every monster and item tile on the maps has a definition', () => {
  for (const fl of FLOORS) {
    for (const row of fl.map) {
      for (const tile of row) {
        if (isMonster(tile)) assert.ok(MONSTERS[tile], `monster ${tile} on floor ${fl.id}`);
        if (tile >= 6 && tile <= 12) assert.ok(ITEMS[tile]);
      }
    }
  }
});

test('every staircase leads to a floor with a matching arrival cell', () => {
  for (const fl of FLOORS) {
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        if (!isStair(fl.map[y][x])) continue;
        const exit = resolveExit(fl, x, y, fl.map[y][x]);
        assert.ok(exit, `floor ${fl.id} stair at ${x},${y} has no exit`);
        const dest = FLOORS[exit.floor];
        assert.ok(dest, `floor ${fl.id} -> missing floor ${exit.floor}`);
        const pos = exit.arrive === 'up' ? dest.arriveUp : dest.arriveDown;
        assert.ok(pos, `floor ${exit.floor} has no ${exit.arrive} arrival for stair from ${fl.id}`);
        const cell = dest.map[pos[1]][pos[0]];
        // 21F's arrival cell is the boss itself: it is only reachable once he is dead.
        assert.ok(cell === T.FLOOR || isMonster(cell), `arrival cell on ${exit.floor} must be walkable`);
      }
    }
  }
});

test('the story landmarks are where the original puts them', () => {
  const at = (f, x, y) => FLOORS[f].map[y][x];
  assert.deepEqual(FLOORS[0].start, [5, 9]);
  assert.equal(at(0, 5, 8), T.FAIRY);
  assert.equal(at(2, 1, 6), T.IRON_DOOR);
  assert.equal(at(3, 0, 0), T.IRON_SWORD);
  assert.equal(at(4, 5, 0), T.THIEF);
  assert.equal(at(5, 4, 3), T.IRON_SHIELD);
  assert.equal(at(7, 5, 4), T.CROSS);
  assert.equal(at(12, 10, 0), T.STAR_HAMMER);
  assert.equal(at(16, 5, 4), T.TRIGGER_16F);
  assert.equal(at(16, 5, 5), 53);
  assert.equal(at(18, 5, 4), T.PRINCESS);
  assert.equal(at(19, 5, 6), 59);
  assert.equal(at(19, 2, 5), T.RED_KING_2);
  assert.equal(at(20, 5, 7), T.FLOOR); // stairs appear after the fairy's blessing
  assert.equal(at(21, 5, 1), T.VAMPIRE_2);
  assert.equal(at(24, 5, 6), T.PORTAL);
  assert.equal(at(26, 5, 3), 188);
});
