import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, newGame } from '../src/engine/reducer.js';
import { patchHero, setTile } from '../src/engine/state.js';
import { serialize, deserialize } from '../src/engine/save.js';
import { combatTier, killReward, MODE_CASUAL, MODE_CLASSIC } from '../src/data/mode.js';
import { MONSTERS } from '../src/data/monsters.js';
import { T } from '../src/data/tiles.js';

function drain(state) {
  let s = state;
  let guard = 0;
  while (s.pending && guard++ < 200) {
    const k = s.pending.kind;
    const action = k === 'say' ? { type: 'CONFIRM' } : k === 'choices' ? { type: 'CHOOSE', index: 0 } : { type: 'CLOSE' };
    s = dispatch(s, action).state;
  }
  return s;
}

test('new games default to classic stats and record the mode on the save', () => {
  const classic = newGame(0).state;
  assert.equal(classic.mode, MODE_CLASSIC);
  assert.equal(classic.hero.hp, 1000);
  assert.equal(classic.hero.atk, 10);
  const casual = newGame(0, MODE_CASUAL).state;
  assert.equal(casual.mode, MODE_CASUAL);
  assert.equal(casual.hero.hp, 1500);
  assert.equal(casual.hero.atk, 15);
  assert.equal(casual.hero.def, 15);
});

test('the prologue still gives three keys; casual adds a spare set', () => {
  const classic = drain(newGame(0).state);
  assert.deepEqual(classic.hero.keys, { yellow: 1, blue: 1, red: 1 });
  const casual = drain(newGame(0, MODE_CASUAL).state);
  assert.deepEqual(casual.hero.keys, { yellow: 2, blue: 3, red: 3 });
});

test('casual kills award double gold and experience', () => {
  assert.deepEqual(killReward(MONSTERS[40], MODE_CLASSIC), { gold: 1, exp: 1 });
  assert.deepEqual(killReward(MONSTERS[40], MODE_CASUAL), { gold: 2, exp: 2 });
  let s = drain(newGame(0, MODE_CASUAL).state);
  s = patchHero({ ...s, floor: 1, pending: null }, { x: 5, y: 9, hp: 1000, atk: 50, def: 50 });
  s = setTile(s, 1, 5, 8, 40);
  const r = dispatch(s, { type: 'MOVE', dir: 'up' });
  assert.equal(r.state.hero.gold, 2);
  assert.equal(r.state.hero.exp, 2);
  assert.ok(r.effects.some((e) => e.type === 'msg' && e.text.includes('2 金币')));
});

test('casual combat ignores monster upgrades after the bosses', () => {
  const classic = { mode: MODE_CLASSIC, tier: 1 };
  const casual = { mode: MODE_CASUAL, tier: 1 };
  assert.equal(combatTier(classic), 1);
  assert.equal(combatTier(casual), 0);
  let s = drain(newGame(0, MODE_CASUAL).state);
  s = { ...s, floor: 17, tier: 1, pending: null };
  s = patchHero(s, { x: 5, y: 9, hp: 99999, atk: 901, def: 9999 });
  s = setTile(s, 17, 5, 8, 58); // 灵武士, classic tier-1 def 1200 / base def 900
  const casualFight = dispatch(s, { type: 'MOVE', dir: 'up' });
  assert.equal(casualFight.state.maps[17][8][5], T.FLOOR);
  assert.equal(casualFight.state.hero.gold, 88 * 2);
  const classicFight = dispatch({ ...s, mode: MODE_CLASSIC }, { type: 'MOVE', dir: 'up' });
  assert.equal(classicFight.state.maps[17][8][5], 58);
  assert.ok(classicFight.effects.some((e) => e.type === 'msg' && e.text.includes('打不过')));
});

test('casual 16F boss kills do not raise the monster tier', () => {
  let s = drain(newGame(0, MODE_CASUAL).state);
  s = patchHero({ ...s, floor: 16, pending: null }, { x: 5, y: 4, hp: 99999, atk: 3000, def: 3000 });
  const r = drain(dispatch(s, { type: 'MOVE', dir: 'down' }).state);
  assert.equal(r.tier, 0);
  assert.equal(r.flags.boss16Killed, true);
});

test('casual mode survives save/load; legacy saves become classic', () => {
  const casual = drain(newGame(1234, MODE_CASUAL).state);
  const back = deserialize(serialize(casual));
  assert.equal(back.mode, MODE_CASUAL);
  assert.equal(back.hero.atk, 15);
  const payload = JSON.parse(serialize(casual));
  delete payload.mode;
  assert.equal(deserialize(JSON.stringify(payload)).mode, MODE_CLASSIC);
  payload.mode = 'hard';
  assert.throws(() => deserialize(JSON.stringify(payload)), /mode/);
});
