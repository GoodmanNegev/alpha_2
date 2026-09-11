import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patchHero, setTile } from '../src/engine/state.js';
import { dispatch, newGame } from '../src/engine/reducer.js';
import { T, SHADOW_CORE } from '../src/data/tiles.js';
import { collectedEquipment } from '../src/ui/player.js';

/** Press through every pending dialogue; `picks` supplies answers for choices. */
function drain(state, picks = []) {
  let s = state;
  const effects = [];
  let guard = 0;
  while (s.pending && guard++ < 200) {
    const k = s.pending.kind;
    const action = k === 'say' ? { type: 'CONFIRM' } : k === 'choices' ? { type: 'CHOOSE', index: picks.shift() ?? 0 } : { type: 'CLOSE' };
    const r = dispatch(s, action);
    s = r.state;
    effects.push(...r.effects);
  }
  return { state: s, effects };
}

function fresh() {
  return drain(newGame(0).state).state;
}

function at(state, floor, x, y, patch = {}) {
  return patchHero({ ...state, floor, visited: { ...state.visited, [floor]: true } }, { x, y, ...patch });
}

const bump = (state, dir) => dispatch(state, { type: 'MOVE', dir });

test('the thief opens the 2F iron door, and repairs 18F once he gets his hammer', () => {
  let s = at(fresh(), 4, 5, 1);
  let r = drain(bump(s, 'up').state);
  assert.equal(r.state.flags.thiefFreed, true);
  assert.equal(r.state.maps[2][6][1], T.FLOOR);
  assert.equal(r.state.maps[4][0][5], T.THIEF);
  // without the hammer he just asks about it
  r = drain(bump(r.state, 'up').state);
  assert.equal(r.state.maps[18][8][5], T.SKY);
  // with the hammer
  r = drain(bump({ ...r.state, items: { hammer: true } }, 'up').state);
  assert.equal(r.state.flags.thiefHammer, true);
  assert.equal(r.state.items.hammer, false);
  assert.equal(r.state.maps[18][8][5], T.FLOOR);
  assert.equal(r.state.maps[18][9][5], T.FLOOR);
  assert.equal(r.state.maps[4][0][5], T.FLOOR);
});

test('bringing the cross to the fairy boosts all stats by a third and opens 20F', () => {
  let s = at(fresh(), 0, 4, 9, { hp: 3000, atk: 300, def: 150 });
  s = { ...s, items: { cross: true } };
  const r = drain(bump(s, 'up').state);
  assert.deepEqual([r.state.hero.hp, r.state.hero.atk, r.state.hero.def], [4000, 400, 200]);
  assert.equal(r.state.flags.crossGiven, true);
  assert.equal(r.state.items.cross, false);
  assert.equal(r.state.maps[20][7][5], T.STAIR_UP);
  // talking again does not boost twice
  const again = drain(bump(r.state, 'up').state);
  assert.equal(again.state.hero.atk, 400);
});

test('the princess reveals the stairs to 19F', () => {
  let s = at(fresh(), 18, 5, 5);
  const r = drain(bump(s, 'up').state);
  assert.equal(r.state.flags.princessTalked, true);
  assert.equal(r.state.maps[18][10][10], T.STAIR_UP);
  assert.equal(r.state.maps[18][4][5], T.PRINCESS);
});

test('boss kills upgrade the monsters and the 21F kill ends the main story', () => {
  let s = at(fresh(), 16, 5, 4, { hp: 99999, atk: 3000, def: 3000 });
  let r = drain(bump(s, 'down').state); // 红衣魔王 at (5,5)
  assert.equal(r.state.tier, 1);
  assert.equal(r.state.flags.boss16Killed, true);
  assert.equal(r.state.maps[16][5][5], T.FLOOR);

  s = at(r.state, 21, 5, 2, { hp: 999999, atk: 9000, def: 9000 });
  r = drain(bump(s, 'up').state); // true form at (5,1)
  assert.equal(r.state.tier, 2);
  assert.equal(r.state.ending, 'normal');
  assert.equal(r.state.maps[21][7][4], T.FLOOR);
  assert.equal(r.state.maps[21][7][6], T.FLOOR);
  assert.equal(r.state.maps[18][4][5], T.FLOOR); // princess rescued
  assert.ok(r.effects.some((e) => e.type === 'ending' && e.ending === 'normal'));
  // the way to the hidden floors is right above
  const up = bump(r.state, 'up');
  assert.equal(up.state.floor, 22);
});

test('the 16F and 19F triggers play the boss dialogue once', () => {
  let s = at(fresh(), 16, 5, 3);
  const r = bump(s, 'down');
  assert.equal(r.state.pending.kind, 'say');
  assert.equal(r.state.maps[16][4][5], T.FLOOR);
  const done = drain(r.state).state;
  assert.equal(done.pending, null);
  assert.deepEqual([done.hero.x, done.hero.y], [5, 4]);
});

test('the 15F old man trades 500 exp for +120 attack via a choice', () => {
  let s = at(fresh(), 15, 4, 4, { exp: 600 });
  let r = drain(bump(s, 'up').state, [1]); // decline
  assert.equal(r.state.hero.atk, 10);
  r = drain(bump(r.state, 'up').state, [0]);
  assert.equal(r.state.hero.atk, 130);
  assert.equal(r.state.hero.exp, 100);
  assert.equal(r.state.maps[15][3][4], T.FLOOR);
});

test('the hidden storyline: three staffs, the seal and the true ending', () => {
  let s = at(fresh(), 16, 5, 4);
  let r = drain(bump(s, 'left').state); // 16F old man at (4,4)
  assert.equal(r.state.items.iceStaff, true);
  // fairy explains the staffs
  s = at(r.state, 0, 4, 9);
  r = drain(bump(s, 'up').state);
  assert.equal(r.state.flags.staffExplained, true);
  // 22F fairy without all staffs
  s = at(r.state, 22, 6, 3);
  r = drain(bump(s, 'up').state);
  assert.equal(r.state.flags.sealed, undefined);
  // with all staffs
  s = { ...s, items: { ...s.items, fireStaff: true, heartStaff: true } };
  r = drain(bump(s, 'up').state);
  assert.equal(r.state.flags.sealed, true);
  assert.equal(r.state.maps[26][3][5], SHADOW_CORE);
  assert.equal(r.state.maps[22][2][6], T.FLOOR);
  // portal to the abyss
  s = at(r.state, 24, 5, 7);
  r = drain(bump(s, 'up').state, [0]);
  assert.equal(r.state.floor, 26);
  assert.deepEqual([r.state.hero.x, r.state.hero.y], [5, 10]);
  // slay 血影
  s = at(r.state, 26, 5, 4, { hp: 9999999, atk: 99999, def: 99999 });
  r = drain(bump(s, 'up').state);
  assert.equal(r.state.ending, 'true');
  assert.equal(r.state.maps[26][1][4], T.FLOOR);
});

test('a 2F rescue: the old man and the merchant hand over their gear', () => {
  let s = at(fresh(), 2, 7, 9);
  assert.deepEqual(collectedEquipment(s), []);
  let r = drain(bump(s, 'down').state);
  assert.equal(r.state.hero.atk, 80);
  assert.equal(r.state.maps[2][10][7], T.FLOOR);
  s = at(r.state, 2, 9, 9);
  r = drain(bump(s, 'down').state);
  assert.equal(r.state.hero.def, 40);
  assert.deepEqual(collectedEquipment(r.state).map(gear => gear.name), ['老人的宝剑', '商人的盾牌']);
});

test('first arrival on 21F warns that the compass is useless there', () => {
  let s = at(fresh(), 20, 5, 6);
  s = setTile(s, 20, 5, 7, T.STAIR_UP);
  const r = bump(s, 'down');
  assert.equal(r.state.floor, 21);
  assert.ok(r.effects.some((e) => e.type === 'msg' && e.text.includes('风之罗盘')));
});
