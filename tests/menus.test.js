import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { showSaveMenu, showSystemMenu } from '../src/ui/menus.js';
import { createSaveStore } from '../src/engine/save.js';

function menuGame() {
  const shown = [];
  const data = new Map();
  return {
    shown,
    overlay: { showMenu(opts) { shown.push(opts); } },
    closeMenu() {},
    saves: createSaveStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }),
  };
}

test('system menu keeps save, load, board, settings and help off the toolbar', () => {
  const game = menuGame();
  showSystemMenu(game);
  assert.equal(game.shown[0].title, '菜单');
  assert.equal(game.shown[0].pageSize, 0);
  assert.deepEqual(game.shown[0].entries.map(e => e.value), ['save', 'load', 'board', 'settings', 'help', 'restart']);
});

test('picking restart from the system menu starts over', () => {
  let restarts = 0;
  const game = menuGame();
  game.restart = () => { restarts++; };
  showSystemMenu(game);
  game.shown[0].onPick('restart');
  assert.equal(restarts, 1);
});

test('picking save from the system menu opens the save slots', () => {
  const game = menuGame();
  showSystemMenu(game);
  game.shown[0].onPick('save');
  assert.equal(game.shown[1].title, '保存进度');
});

test('leaving a submenu from the system menu returns to the menu', () => {
  const game = menuGame();
  showSystemMenu(game);
  game.shown[0].onPick('save');
  game.shown[1].onClose();
  assert.equal(game.shown[2].title, '菜单');
});

test('save opened from a shortcut still closes completely', () => {
  let closed = false;
  const game = menuGame();
  game.closeMenu = () => { closed = true; };
  showSaveMenu(game, 'save');
  game.shown[0].onClose();
  assert.equal(closed, true);
});

test('menu command opens the system menu', () => {
  const shown = [];
  const game = Object.assign(Object.create(Game.prototype), {
    busy: false, state: {},
    overlay: { open: false, showMenu(opts) { shown.push(opts.title); } },
    stopAutoMove() {},
  });
  game.command('menu');
  assert.equal(shown[0], '菜单');
});

test('manual and fly stay dim until the matching items are found', () => {
  const makeBtn = () => {
    const btn = { classList: { locked: null, toggle(_n, on) { this.locked = on; } }, attrs: {} };
    btn.setAttribute = (k, v) => { btn.attrs[k] = v; };
    return btn;
  };
  const buttons = { manual: makeBtn(), fly: makeBtn() };
  const game = Object.assign(Object.create(Game.prototype), {
    root: { querySelector(sel) { return sel.includes('manual') ? buttons.manual : buttons.fly; } },
  });
  game.syncTools({ items: {} });
  assert.equal(buttons.manual.classList.locked, true);
  assert.equal(buttons.fly.classList.locked, true);
  assert.equal(buttons.manual.title, '尚未获得圣光徽');
  assert.equal(buttons.manual.attrs['aria-label'], '尚未获得圣光徽');
  assert.equal(buttons.fly.title, '尚未获得风之罗盘');
  game.syncTools({ items: { manual: true, fly: true } });
  assert.equal(buttons.manual.classList.locked, false);
  assert.equal(buttons.fly.classList.locked, false);
  assert.equal(buttons.manual.title, '怪物手册（X）');
  assert.equal(buttons.manual.attrs['aria-label'], '怪物手册（X）');
});
