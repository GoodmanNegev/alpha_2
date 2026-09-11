import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, setTile, patchHero } from '../src/engine/state.js';
import { dispatch, newGame } from '../src/engine/reducer.js';
import { T } from '../src/data/tiles.js';

// A hero standing at (x,y) on `floor` with no pending dialogue.
function place(state, floor, x, y, heroPatch = {}) {
  let s = { ...state, floor, pending: null, visited: { ...state.visited, [floor]: true } };
  s = patchHero(s, { x, y, ...heroPatch });
  return s;
}

const base = () => {
  const { state } = newGame(0);
  // skip the prologue so tests start with a free hero
  let s = { ...state, pending: null, flags: { fairyIntro: true } };
  s = patchHero(s, { keys: { yellow: 1, blue: 1, red: 1 } });
  s = setTile(setTile(s, 0, 5, 8, T.FLOOR), 0, 4, 8, T.FAIRY);
  return s;
};

test('new game starts with the prologue dialogue pending', () => {
  const { state } = newGame(0);
  assert.equal(state.pending.kind, 'say');
  assert.deepEqual([state.hero.x, state.hero.y, state.floor], [5, 9, 0]);
  // confirming through the whole prologue yields three keys and moves the fairy
  let s = state;
  let guard = 0;
  while (s.pending && guard++ < 100) s = dispatch(s, { type: 'CONFIRM' }).state;
  assert.equal(s.pending, null);
  assert.deepEqual(s.hero.keys, { yellow: 1, blue: 1, red: 1 });
  assert.equal(s.maps[0][8][5], T.FLOOR);
  assert.equal(s.maps[0][8][4], T.FAIRY);
  assert.equal(s.flags.fairyIntro, true);
});

test('walking onto floor moves the hero and counts steps; walls block', () => {
  let s = place(base(), 1, 5, 9); // 1F arrival cell
  const r = dispatch(s, { type: 'MOVE', dir: 'right' }); // (6,9) is floor
  assert.deepEqual([r.state.hero.x, r.state.hero.y], [6, 9]);
  assert.equal(r.state.stats.steps, 1);
  const blocked = dispatch(r.state, { type: 'MOVE', dir: 'up' }); // (6,8) is a wall
  assert.deepEqual([blocked.state.hero.x, blocked.state.hero.y], [6, 9]);
  assert.equal(blocked.state.hero.dir, 'up'); // still turns
  assert.equal(blocked.state.stats.steps, 1);
});

test('doors consume the matching key and the hero stays put', () => {
  let s = place(base(), 1, 5, 9); // (5,8) above is a red door
  const noKey = dispatch(patchHero(s, { keys: { yellow: 0, blue: 0, red: 0 } }), { type: 'MOVE', dir: 'up' });
  assert.equal(noKey.state.maps[1][8][5], T.RED_DOOR);
  assert.ok(noKey.effects.some((e) => e.type === 'msg'));
  const r = dispatch(s, { type: 'MOVE', dir: 'up' });
  assert.equal(r.state.maps[1][8][5], T.FLOOR);
  assert.equal(r.state.hero.keys.red, 0);
  assert.deepEqual([r.state.hero.x, r.state.hero.y], [5, 9]);
  assert.ok(r.effects.some((e) => e.type === 'door'));
});

test('items are picked up and applied', () => {
  let s = place(base(), 1, 5, 9);
  s = setTile(s, 1, 5, 8, T.RED_GEM);
  const r = dispatch(s, { type: 'MOVE', dir: 'up' });
  assert.equal(r.state.hero.atk, 13);
  assert.equal(r.state.maps[1][8][5], T.FLOOR);
  assert.deepEqual([r.state.hero.x, r.state.hero.y], [5, 8]);
  const s2 = setTile(place(base(), 1, 5, 9), 1, 5, 8, T.HOLY_BADGE);
  const r2 = dispatch(s2, { type: 'MOVE', dir: 'up' });
  assert.equal(r2.state.items.manual, true);
});

test('winnable battles remove the monster and pay out; unwinnable ones block', () => {
  let s = place(base(), 1, 5, 9);
  s = setTile(s, 1, 5, 8, 40); // 绿头怪 50/20/1
  const r = dispatch(s, { type: 'MOVE', dir: 'up' });
  assert.equal(r.state.hero.hp, 950);
  assert.equal(r.state.hero.gold, 1);
  assert.equal(r.state.hero.exp, 1);
  assert.equal(r.state.stats.kills, 1);
  assert.equal(r.state.maps[1][8][5], T.FLOOR);
  assert.deepEqual([r.state.hero.x, r.state.hero.y], [5, 8]);
  const battle = r.effects.find((e) => e.type === 'battle');
  assert.equal(battle.monsterId, 40);
  assert.equal(battle.damage, 50);

  const s2 = setTile(place(base(), 1, 5, 9), 1, 5, 8, 45); // 骷髅士兵 def 20
  const r2 = dispatch(s2, { type: 'MOVE', dir: 'up' });
  assert.equal(r2.state.maps[1][8][5], 45);
  assert.equal(r2.state.hero.hp, 1000);
  assert.deepEqual([r2.state.hero.x, r2.state.hero.y], [5, 9]);
});

test('stairs change floors and place the hero at the arrival cell', () => {
  let s = place(base(), 1, 1, 0); // next to 1F up-stairs at (0,0)
  const r = dispatch(s, { type: 'MOVE', dir: 'left' });
  assert.equal(r.state.floor, 2);
  assert.deepEqual([r.state.hero.x, r.state.hero.y], [0, 1]);
  assert.equal(r.state.visited[2], true);
  assert.equal(r.state.maxFloor, 2);
  const back = dispatch(r.state, { type: 'MOVE', dir: 'up' }); // 2F (0,0) is the down-stairs
  assert.equal(back.state.floor, 1);
  assert.deepEqual([back.state.hero.x, back.state.hero.y], [1, 0]);
});

test('gates open on touch, the locked 2F iron door needs the thief', () => {
  let s = place(base(), 2, 0, 6); // left corridor, iron door at (1,6)
  const locked = dispatch(s, { type: 'MOVE', dir: 'right' });
  assert.equal(locked.state.maps[2][6][1], T.IRON_DOOR);
  assert.deepEqual([locked.state.hero.x, locked.state.hero.y], [0, 6]);
  s = setTile(place(base(), 7, 3, 4), 7, 4, 4, T.GATE); // 7F gate at (4,4)
  const r = dispatch(s, { type: 'MOVE', dir: 'right' });
  assert.equal(r.state.maps[7][4][4], T.FLOOR);
  assert.deepEqual([r.state.hero.x, r.state.hero.y], [3, 4]);
});

test('talking to an NPC starts its script; shops open and trade', () => {
  let s = place(base(), 3, 5, 1, { gold: 30 }); // below the 3F shop at (5,0)
  const r = dispatch(s, { type: 'MOVE', dir: 'up' });
  assert.equal(r.state.pending.kind, 'shop');
  const buy = dispatch(r.state, { type: 'SHOP_BUY', index: 1 });
  assert.equal(buy.state.hero.atk, 14);
  assert.equal(buy.state.hero.gold, 5);
  const poor = dispatch(buy.state, { type: 'SHOP_BUY', index: 0 });
  assert.equal(poor.state.hero.hp, 1000);
  assert.ok(poor.effects.some((e) => e.type === 'msg'));
  const closed = dispatch(poor.state, { type: 'CLOSE' });
  assert.equal(closed.state.pending, null);
});

test('movement is ignored while a dialogue is pending', () => {
  const { state } = newGame(0);
  const r = dispatch(state, { type: 'MOVE', dir: 'up' });
  assert.equal(r.state, state);
});

test('the wind compass flies between visited main-tower floors only', () => {
  let s = place(base(), 5, 1, 10, {});
  s = { ...s, items: { ...s.items, fly: true }, visited: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true } };
  const up = dispatch(s, { type: 'FLY', floor: 3 });
  assert.equal(up.state.floor, 3);
  assert.deepEqual([up.state.hero.x, up.state.hero.y], [10, 9]); // arriveDown of 3F
  const down = dispatch(up.state, { type: 'FLY', floor: 5 });
  assert.deepEqual([down.state.hero.x, down.state.hero.y], [0, 9]); // arriveUp of 5F
  const unvisited = dispatch(s, { type: 'FLY', floor: 9 });
  assert.equal(unvisited.state.floor, 5);
  const noCompass = dispatch({ ...s, items: {} }, { type: 'FLY', floor: 3 });
  assert.equal(noCompass.state.floor, 5);
  const top = { ...place(s, 21, 5, 5), visited: { ...s.visited, 21: true } };
  assert.equal(dispatch(top, { type: 'FLY', floor: 3 }).state.floor, 21);
});
