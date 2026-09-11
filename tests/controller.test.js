import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { newGame, dispatch } from '../src/engine/reducer.js';
import { createSaveStore } from '../src/engine/save.js';

function readyState() {
  let state = newGame(1).state;
  while (state.pending) state = dispatch(state, { type: 'CONFIRM' }).state;
  return { ...state, heroName: '勇者甲', adventurerId: '10000000-1000-4000-8000-000000000001' };
}

function controller() {
  const data = new Map();
  return Object.assign(Object.create(Game.prototype), {
    state: readyState(), session: 1, api: false, settings: { battleAnim: true, clickMove: true, moveMs: 100 },
    overlay: { close() {}, mode: null, open: false },
    audio: { play() {} }, hud: { update() {} }, message() {},
    renderer: { highlight() {} }, input: { held: null },
    saves: createSaveStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }),
  });
}

test('loading a manual save becomes the adventure restored after refresh', () => {
  const game = controller();
  game.autosave();
  const loaded = { ...game.state, heroName: '勇者乙', hero: { ...game.state.hero, hp: 777 } };
  game.saves.save(2, loaded);
  game.loadSlot(2);
  assert.equal(game.saves.load(0).heroName, '勇者乙');
  assert.equal(game.saves.load(0).hero.hp, 777);
});

test('old battle effects cannot modify a replacement adventure', async () => {
  const game = controller();
  let finish;
  game.overlay.battle = () => new Promise(resolve => { finish = resolve; });
  game.overlay.close = () => finish?.();
  const messages = [];
  game.message = text => messages.push(text);
  const effects = game.handleEffects([{ type: 'battle' }, { type: 'msg', text: 'old result' }]);
  assert.equal(game.busy, true);
  game.setState(readyState());
  game.busy = true; // A new adventure may already be in another battle.
  await effects;
  assert.equal(game.busy, true);
  assert.deepEqual(messages, []);
});

test('replacing state cancels delayed ending and automatic movement', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const game = controller();
  await game.handleEffects([{ type: 'ending', ending: 'normal' }]);
  let moved = false;
  game.autoTimer = setTimeout(() => { moved = true; }, 100);
  game.autoPath = ['up'];
  game.input.held = 'up';
  game.setState(readyState());
  t.mock.timers.tick(1000); // A stale ending would try to construct a DOM panel.
  assert.equal(moved, false);
  assert.equal(game.autoPath, null);
  assert.equal(game.input.held, null);
});

test('a second map click cancels the previous path timer', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const game = controller();
  let steps = 0;
  game.autoTimer = setTimeout(() => { steps++; }, 100);
  game.autoPath = ['up'];
  game.clickCell(game.state.hero.x, game.state.hero.y);
  t.mock.timers.tick(200);
  assert.equal(steps, 0);
  assert.equal(game.autoPath, null);
});

test('completing the prologue persists hero identity before first floor change', () => {
  const game = controller();
  game.state = { ...newGame(1).state, adventurerId: game.state.adventurerId, heroName: '新勇者' };
  game.showPending = () => {};
  while (game.state.pending) game.apply({ type: 'CONFIRM' });
  assert.equal(game.saves.load(0).heroName, '新勇者');
  assert.equal(game.saves.load(0).flags.fairyIntro, true);
});

test('progress synchronization preserves rename order across slow requests', async t => {
  const game = controller();
  const names = [];
  let release;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    names.push(JSON.parse(init.body).name);
    if (names.length === 1) await new Promise(resolve => { release = resolve; });
    return { ok: true, json: async () => ({ success: true }) };
  });
  const first = game.syncProgress();
  game.renameHero('勇者乙');
  const second = game.syncProgress();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(names, ['勇者甲']);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(names, ['勇者甲', '勇者乙']);
});
