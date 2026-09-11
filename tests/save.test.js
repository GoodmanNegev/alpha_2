import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, dispatch } from '../src/engine/reducer.js';
import { serialize, deserialize, createSaveStore } from '../src/engine/save.js';
import { setTile } from '../src/engine/state.js';
import { T } from '../src/data/tiles.js';

function playedState() {
  let s = newGame(1234).state;
  while (s.pending) s = dispatch(s, { type: 'CONFIRM' }).state;
  s = setTile(s, 3, 2, 2, T.FLOOR);
  s = { ...s, hero: { ...s.hero, hp: 777, atk: 42 }, floor: 3, visited: { ...s.visited, 3: true }, items: { manual: true }, flags: { ...s.flags, thiefFreed: true }, tier: 1 };
  return s;
}

test('serialize/deserialize round-trips the game state', () => {
  const s = playedState();
  const json = serialize(s);
  assert.ok(json.length < 4000, `save is compact (${json.length} bytes)`);
  const back = deserialize(json);
  assert.deepEqual(back, { ...s, pending: null });
  assert.notEqual(back.maps, s.maps);
});

test('hero identity survives save/load while legacy saves remain readable', () => {
  const legacy = playedState();
  assert.equal(deserialize(serialize(legacy)).heroName, undefined);
  const named = { ...legacy, heroName: '星河勇者', adventurerId: '10000000-1000-4000-8000-000000000001' };
  assert.equal(deserialize(serialize(named)).heroName, '星河勇者');
  assert.equal(deserialize(serialize(named)).adventurerId, named.adventurerId);
  assert.throws(() => deserialize(serialize({ ...named, heroName: {} })), /名称/);
  assert.throws(() => deserialize(serialize({ ...named, adventurerId: 'invalid' })), /编号/);
});

test('deserialize rejects garbage and wrong versions', () => {
  assert.throws(() => deserialize('not json'));
  assert.throws(() => deserialize(JSON.stringify({ version: 0 })), /版本/);
  const s = playedState();
  const bad = JSON.parse(serialize(s));
  bad.hero.hp = 'lots';
  assert.throws(() => deserialize(JSON.stringify(bad)), /hero/);
  const badTile = JSON.parse(serialize(s));
  badTile.diff.push([3, 1, 1, 999999]);
  assert.throws(() => deserialize(JSON.stringify(badTile)), /tile/);
});

test('save store keeps slots with metadata in the provided storage', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const store = createSaveStore(storage);
  const s = playedState();
  store.save(2, s, { now: 5000 });
  const slots = store.list();
  assert.equal(slots[2].floor, 3);
  assert.equal(slots[2].hp, 777);
  assert.equal(slots[2].mode, 'classic');
  assert.equal(slots[2].savedAt, 5000);
  assert.equal(slots[1], null);
  const loaded = store.load(2);
  assert.equal(loaded.hero.atk, 42);
  store.remove(2);
  assert.equal(store.list()[2], null);
  assert.equal(store.load(2), null);
});
