// Game controller: owns the state, feeds actions to the pure engine and turns
// the resulting effects into rendering, sound and UI.

import { dispatch, newGame } from './engine/reducer.js';
import { createSaveStore, deserialize, serialize } from './engine/save.js';
import { findPath } from './engine/path.js';
import { Renderer } from './render/renderer.js';
import { Hud } from './ui/hud.js';
import { Overlay } from './ui/overlay.js';
import { showEnding, showFly, showHelp, showLeaderboard, showModeSelect, showManual, showSaveMenu, showSettings, showSystemMenu } from './ui/menus.js';
import { detectApi, submitProgress } from './leaderboard.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { h } from './ui/dom.js';
import { showBag, showProfile } from './ui/player.js';

const SETTINGS_KEY = 'mota24.settings';
const DEFAULT_SETTINGS = { sfx: true, bgm: true, battleAnim: true, showDamage: true, clickMove: true, moveMs: 100 };
const ONE_WAY_FLOORS = new Set([21, 26]);

export class Game {
  constructor(root) {
    this.root = root;
    this.settings = loadSettings();
    this.audio = new Audio();
    this.audio.setSfx(this.settings.sfx);
    this.audio.setBgm(this.settings.bgm);
    this.saves = createSaveStore(safeStorage());

    this.canvas = root.querySelector('#map');
    this.renderer = new Renderer(this.canvas);
    this.hud = new Hud(root.querySelector('#hud'), this.renderer.sprites);
    this.overlay = new Overlay(root.querySelector('#overlay'), this.renderer.sprites);
    this.msgEl = root.querySelector('#msg');
    this.logEl = root.querySelector('#log');
    this.input = new Input(this, this.canvas, document.getElementById('dpad'));

    for (const btn of root.querySelectorAll('[data-cmd]')) {
      btn.addEventListener('click', () => { this.audio.unlock(); this.command(btn.dataset.cmd); });
    }

    this.state = null;
    this.viewState = null;
    this.busy = false; // an async effect (battle animation) is playing
    this.queue = [];
    this.autoPath = null;
    this.frame = 0;
    this.dirty = true;
    this.lastTick = performance.now();
    this.msgTimer = null;

    this.api = false;
    this.playerName = '';
    detectApi().then((ok) => {
      this.api = ok;
      this.queueProgress();
    });

    this.boot();
    setInterval(() => { this.frame ^= 1; this.dirty = true; }, 500);
    setInterval(() => this.tickClock(), 1000);
    const loop = () => { this.render(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // -------------------------------------------------------------- lifecycle --
  boot() {
    let restored = null;
    try {
      restored = this.saves.load(0);
    } catch {
      restored = null;
    }
    if (restored) {
      this.setState(restored);
      this.autosave(); // Persist identity assigned when migrating an older save.
      this.message('已恢复自动存档。按 H 查看帮助。');
    } else {
      this.promptMode({ required: true });
    }
  }

  startNew(identity = {}) {
    const r = newGame(Date.now(), identity.mode);
    this.setState({ ...r.state, ...identity });
    this.handleEffects(r.effects);
  }

  promptMode({ required = false } = {}) {
    showModeSelect(this, { required });
  }

  restart(confirmed = false) {
    if (this.mustPickMode) return;
    if (!this.state) {
      this.promptMode({ required: true });
      return;
    }
    if (!confirmed && !window.confirm('确定要从头开始吗？将选择模式并回到序章。选定后自动存档会被清除，手动存档不会删除。')) return;
    this.promptMode({ required: false });
  }

  setState(state) {
    this.session = (this.session ?? 0) + 1;
    clearTimeout(this.endingTimer);
    clearTimeout(this.progressTimer);
    this.stopAutoMove();
    if (this.input) this.input.held = null;
    this.overlay.close();
    this.busy = false;
    this.mustPickMode = false;
    state = { ...state, heroName: state.heroName || '无名勇士', adventurerId: state.adventurerId || newAdventurerId() };
    this.state = state;
    this.viewState = state;
    this.dirty = true;
    this.queueProgress();
  }

  renameHero(value) {
    const heroName = [...value.replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, 16).join('') || '无名勇士';
    this.state = { ...this.state, heroName };
    this.viewState = this.state;
    this.dirty = true;
    this.queueProgress();
    this.autosave();
    this.hud.update(this.state);
  }

  queueProgress() {
    if (!this.api || !this.state?.flags.fairyIntro) return;
    clearTimeout(this.progressTimer);
    this.progressTimer = setTimeout(() => {
      this.syncProgress().catch(() => { /* Retried at the next floor change or board visit. */ });
    }, 1500);
  }

  syncProgress() {
    clearTimeout(this.progressTimer);
    if (!this.state?.flags.fairyIntro) return Promise.resolve();
    // Serialize requests so an older rename cannot arrive after a newer one.
    const state = this.state;
    const request = (this.progressRequest ?? Promise.resolve()).catch(() => {}).then(() => submitProgress(state));
    this.progressRequest = request;
    return request;
  }

  // ---------------------------------------------------------------- actions --
  apply(action) {
    if (!this.state || this.busy) return;
    const before = this.state;
    const r = dispatch(before, action);
    if (r.state === before && r.effects.length === 0) return;
    this.state = r.state;
    if (!before.flags.fairyIntro && r.state.flags.fairyIntro) {
      this.autosave();
      this.queueProgress();
    }
    if (r.state.maxFloor !== before.maxFloor) this.queueProgress();
    this.dirty = true;
    this.handleEffects(r.effects, before).catch((err) => this.message(`出错了：${err.message}`));
  }

  move(dir) {
    if (!this.state || this.overlay.open || this.busy) return;
    this.apply({ type: 'MOVE', dir });
  }

  command(cmd) {
    if (this.mustPickMode && cmd !== 'confirm' && cmd !== 'mute') return;
    switch (cmd) {
      case 'confirm': if (this.overlay.open) this.overlay.handleKey({ key: 'Enter' }); break;
      case 'manual': this.openMenu(() => showManual(this)); break;
      case 'fly': this.openMenu(() => showFly(this)); break;
      case 'save': this.openMenu(() => showSaveMenu(this, 'save')); break;
      case 'load': this.openMenu(() => showSaveMenu(this, 'load')); break;
      case 'settings': this.openMenu(() => showSettings(this)); break;
      case 'help': this.openMenu(() => showHelp(this)); break;
      case 'board': this.openMenu(() => showLeaderboard(this)); break;
      case 'bag': this.openMenu(() => showBag(this)); break;
      case 'menu': this.openMenu(() => showSystemMenu(this)); break;
      case 'profile': this.openMenu(() => showProfile(this)); break;
      case 'mute': this.toggleSetting('sfx'); this.settings.bgm = this.settings.sfx; this.audio.setBgm(this.settings.bgm); saveSettings(this.settings); this.message(this.settings.sfx ? '声音：开' : '声音：关'); break;
      case 'restart': this.restart(); break;
      default: break;
    }
  }

  openMenu(fn) {
    if (this.busy || this.mustPickMode || !this.state) return;
    if (this.overlay.open) { this.closeMenu(); return; }
    if (this.state.pending) return; // never cover a running dialogue
    this.stopAutoMove();
    fn();
  }

  closeMenu() {
    this.overlay.close();
    if (this.mustPickMode) {
      this.promptMode({ required: true });
      return;
    }
    this.showPending(); // a dialogue may still be waiting underneath
  }

  toggleSetting(key) {
    const s = this.settings;
    if (key === 'moveMs') s.moveMs = s.moveMs <= 80 ? 140 : s.moveMs <= 120 ? 80 : 100;
    else s[key] = !s[key];
    this.audio.setSfx(s.sfx);
    this.audio.setBgm(s.bgm);
    saveSettings(s);
    this.dirty = true;
  }

  // --------------------------------------------------------------- effects --
  async handleEffects(effects, before = this.state) {
    const session = this.session;
    try {
      for (const fx of effects) {
        if (session !== this.session) return;
        switch (fx.type) {
          case 'msg': this.message(fx.text); break;
          case 'sfx': this.audio.play(fx.name); break;
          case 'step': this.audio.play('step'); break;
          case 'door': this.renderer.highlight(fx.x, fx.y, performance.now()); break;
          case 'floor':
            this.viewState = this.state;
            // one-way trips (21F, the abyss) autosave the state *before* the step, so a
            // reload never strands an under-levelled hero
            this.autosave(ONE_WAY_FLOORS.has(fx.to) && !this.state.flags.abyssCleared ? before : this.state);
            break;
          case 'battle': await this.playBattle(fx); break;
          case 'fx': this.flashScreen(fx.name); break;
          case 'ending':
            this.stopAutoMove();
            this.autosave();
            clearTimeout(this.endingTimer);
            this.endingTimer = setTimeout(() => {
              if (session === this.session) showEnding(this, fx.ending);
            }, 400);
            break;
          default: break;
        }
      }
    } finally {
      if (session === this.session) {
        this.viewState = this.state;
        this.dirty = true;
        this.showPending();
      }
    }
  }

  async playBattle(fx) {
    if (!this.settings.battleAnim) { this.audio.play('win'); return; }
    this.busy = true;
    const session = this.session;
    this.stopAutoMove();
    try {
      await this.overlay.battle(fx, { audio: this.audio });
    } finally {
      if (session === this.session) {
        this.busy = false;
        this.viewState = this.state;
        this.dirty = true;
      }
    }
  }

  /** Reflect state.pending (dialogue / choices / shop) in the overlay. */
  showPending() {
    const p = this.state?.pending;
    if (!p) {
      if (['say', 'choices', 'shop'].includes(this.overlay.mode)) this.overlay.close();
      return;
    }
    if (this.overlay.mode === 'battle' || this.overlay.mode === 'panel' || this.overlay.mode === 'menu') return;
    // keep the box away from the hero: talk at the top when he stands in the lower rows
    this.overlay.root.classList.toggle('top', this.state.hero.y >= 7);
    if (p.kind === 'say') this.overlay.showSay(p.step, () => this.apply({ type: 'CONFIRM' }));
    else if (p.kind === 'choices') this.overlay.showChoices(p.step, (i) => this.apply({ type: 'CHOOSE', index: i }));
    else if (p.kind === 'shop') {
      if (this.overlay.mode === 'shop' && this.overlay.shopId === p.step.id) { this.overlay.updateShop(this.state.hero); return; }
      this.overlay.showShop(p.step.id, this.state.hero, (i) => this.apply({ type: 'SHOP_BUY', index: i }), () => this.apply({ type: 'CLOSE' }));
    }
  }

  flashScreen(name) {
    const stage = this.root.querySelector('.stage');
    stage.classList.remove('flash-levelup', 'flash-seal');
    void stage.offsetWidth;
    stage.classList.add(name === 'seal' ? 'flash-seal' : 'flash-levelup');
  }

  message(text) {
    this.msgEl.textContent = text;
    this.msgEl.classList.add('show');
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => this.msgEl.classList.remove('show'), 3500);
    if (this.logEl) {
      this.logEl.textContent = text;
      this.logEl.title = text;
    }
  }

  // ------------------------------------------------------------- auto move --
  clickCell(x, y) {
    if (!this.settings.clickMove || this.overlay.open || this.busy || this.state.pending) return;
    this.stopAutoMove();
    const path = findPath(this.state, x, y);
    if (!path || path.length === 0) { this.renderer.highlight(x, y, performance.now(), 150); return; }
    this.autoPath = path;
    this.autoStep();
  }

  autoStep() {
    if (!this.autoPath) return;
    const dir = this.autoPath.shift();
    const before = this.state;
    this.move(dir);
    const moved = this.state.hero.x !== before.hero.x || this.state.hero.y !== before.hero.y;
    const interrupted = this.state.pending || this.state.floor !== before.floor || this.busy;
    if (!this.autoPath || !this.autoPath.length || interrupted || !moved) { this.autoPath = null; return; }
    this.autoTimer = setTimeout(() => this.autoStep(), this.settings.moveMs);
  }

  stopAutoMove() {
    this.autoPath = null;
    clearTimeout(this.autoTimer);
  }

  // ------------------------------------------------------------- save/load --
  autosave(state = this.state) {
    if (!state || state.pending) return;
    try { this.saves.save(0, state); } catch { /* storage full or unavailable: ignore */ }
  }

  saveSlot(slot) {
    try {
      this.saves.save(slot, this.state);
      this.message(`已保存到存档 ${slot}。`);
      this.audio.play('confirm');
    } catch (err) {
      this.message(`保存失败：${err.message}`);
    }
    this.closeMenu();
  }

  loadSlot(slot) {
    try {
      const s = this.saves.load(slot);
      if (!s) { this.message('该存档为空。'); return; }
      this.closeMenu();
      this.setState(s);
      this.autosave();
      this.message(slot === 0 ? '已读取自动存档。' : `已读取存档 ${slot}。`);
      this.audio.play('confirm');
    } catch (err) {
      this.message(`读取失败：${err.message}`);
    }
  }

  exportText() {
    const text = serialize(this.state);
    this.closeMenu();
    const ta = h('input', { class: 'export', readonly: true, value: text, 'aria-label': '存档备份文本' });
    const content = h('div', {}, [
      h('p', { text: '复制下面的文本即可备份进度；在“读取进度 → 从文本导入”里粘贴即可恢复。' }),
      ta,
      h('button', { class: 'btn', text: '复制到剪贴板', onClick: async () => {
        try { await navigator.clipboard.writeText(text); this.message('已复制。'); } catch { ta.select(); this.message('请手动复制（Ctrl+C）。'); }
      } }),
    ]);
    this.overlay.showPanel('导出进度', content, () => this.closeMenu());
    ta.select();
  }

  importText() {
    this.closeMenu();
    const ta = h('input', { class: 'export', placeholder: '在此粘贴存档文本', 'aria-label': '导入存档文本' });
    const content = h('div', {}, [
      ta,
      h('button', { class: 'btn', text: '导入', onClick: () => {
        try {
          const s = deserialize(ta.value.trim());
          this.closeMenu();
          this.setState(s);
          this.autosave();
          this.message('导入成功。');
        } catch (err) {
          this.message(`导入失败：${err.message}`);
        }
      } }),
    ]);
    this.overlay.showPanel('导入进度', content, () => this.closeMenu());
    ta.focus();
  }

  syncTools(state) {
    if (!this.toolButtons) {
      this.toolButtons = {
        manual: this.root.querySelector('[data-cmd="manual"]'),
        fly: this.root.querySelector('[data-cmd="fly"]'),
      };
    }
    const lock = (btn, locked, wait, ready) => {
      if (!btn) return;
      btn.classList.toggle('locked', locked);
      const label = locked ? wait : ready;
      btn.title = label;
      btn.setAttribute('aria-label', label);
    };
    lock(this.toolButtons.manual, !state.items.manual, '尚未获得圣光徽', '怪物手册（X）');
    lock(this.toolButtons.fly, !state.items.fly, '尚未获得风之罗盘', '楼层传送（F）');
  }

  // ----------------------------------------------------------------- clock --
  tickClock() {
    if (!this.state || this.state.ending === 'true' || document.hidden) return;
    const r = dispatch(this.state, { type: 'TICK', ms: 1000 });
    this.state = r.state;
    if (!this.busy) this.viewState = this.state;
    this.hud.update(this.viewState);
  }

  // ---------------------------------------------------------------- render --
  render() {
    if (!this.dirty || !this.viewState) return;
    this.dirty = false;
    const s = this.viewState;
    this.renderer.draw(s, this.frame, {
      showDamage: this.settings.showDamage && Boolean(s.items.manual),
      now: performance.now(),
    });
    this.hud.update(s);
    this.syncTools(s);
    if (this.renderer.flash && performance.now() < this.renderer.flash.until) this.dirty = true;
  }
}

function loadSettings() {
  try {
    const raw = safeStorage().getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s) {
  try { safeStorage().setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

const memoryStorage = new Map();
function newAdventurerId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // getRandomValues remains available when the game is served over plain HTTP.
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
}
function safeStorage() {
  try {
    const t = '__mota_probe__';
    window.localStorage.setItem(t, '1');
    window.localStorage.removeItem(t);
    return window.localStorage;
  } catch {
    return {
      getItem: (k) => memoryStorage.get(k) ?? null,
      setItem: (k, v) => memoryStorage.set(k, v),
      removeItem: (k) => memoryStorage.delete(k),
    };
  }
}
