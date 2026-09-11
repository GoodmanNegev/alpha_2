// Everything drawn on top of the map: dialogue boxes, choice lists, shops,
// the battle window and generic menus/panels.  One overlay is visible at a
// time; keyboard input is routed here first while it is open.

import { SHOPS } from '../data/shops.js';
import { SPEAKERS } from '../data/story.js';
import { clear, h, spriteEl } from './dom.js';

export class Overlay {
  constructor(root, sprites) {
    this.root = root;
    this.sprites = sprites;
    this.mode = null;
    this.cursor = 0;
    this.items = [];
    this.handlers = {};
    this.root.addEventListener('click', (e) => this.onClick(e));
  }

  get open() { return this.mode !== null; }

  close() {
    this.cancelBattle?.();
    this.pageObserver?.disconnect();
    this.pageObserver = null;
    const focus = this.returnFocus;
    this.returnFocus = null;
    this.mode = null;
    this.allowClose = true;
    this.handlers = {};
    this.items = [];
    clear(this.root);
    this.root.classList.add('hidden');
    focus?.focus?.({ preventScroll: true });
  }

  show(mode, el) {
    this.cancelBattle?.();
    this.pageObserver?.disconnect();
    this.pageObserver = null;
    this.menuPage = null;
    if (!this.open) this.returnFocus = document.activeElement;
    clear(this.root);
    this.mode = mode;
    this.allowClose = true;
    this.root.dataset.mode = mode;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', el.querySelector('.panel-title, .dialog-name')?.textContent || '战斗');
    this.root.classList.remove('hidden');
    this.root.append(el);
    this.root.setAttribute('tabindex', '-1');
    this.root.focus({ preventScroll: true });
  }

  portrait(who) {
    const sp = SPEAKERS[who] ?? SPEAKERS.narr;
    if (!sp.sprite) return null;
    const canvas = sp.sprite.startsWith('m') ? this.sprites.tile(Number(sp.sprite.slice(1))) : this.sprites.named(sp.sprite);
    return canvas ? spriteEl(canvas, 'sprite portrait') : null;
  }

  // ------------------------------------------------------------- dialogue --
  showSay(step, onNext) {
    const sp = SPEAKERS[step.who] ?? SPEAKERS.narr;
    const box = h('div', { class: `dialog who-${step.who}` }, [
      this.portrait(step.who),
      h('div', { class: 'dialog-body' }, [
        sp.name ? h('div', { class: 'dialog-name', text: sp.name }) : null,
        h('div', { class: 'dialog-text', text: step.text }),
        h('div', { class: 'dialog-next', text: '▼' }),
      ]),
    ]);
    this.handlers = { next: onNext };
    this.show('say', box);
  }

  showChoices(step, onPick) {
    const sp = SPEAKERS[step.who] ?? SPEAKERS.narr;
    this.items = step.options.map((o, i) => h('li', { class: 'choice', dataset: { index: i }, text: o.label }));
    this.cursor = 0;
    const box = h('div', { class: 'dialog choices' }, [
      this.portrait(step.who),
      h('div', { class: 'dialog-body' }, [
        sp.name ? h('div', { class: 'dialog-name', text: sp.name }) : null,
        h('div', { class: 'dialog-text', text: step.text }),
        h('ul', { class: 'choice-list' }, this.items),
      ]),
    ]);
    this.handlers = { pick: onPick };
    this.show('choices', box);
    this.moveCursor(0);
  }

  // ----------------------------------------------------------------- shop --
  showShop(id, hero, onBuy, onClose) {
    const shop = SHOPS[id];
    this.shopId = id;
    this.items = [
      ...shop.choices.map((c, i) => h('li', { class: 'choice', dataset: { index: i }, text: c.label })),
      h('li', { class: 'choice leave', dataset: { index: 'close' }, text: '离开' }),
    ];
    this.cursor = 0;
    this.walletEl = h('div', { class: 'wallet' });
    const box = h('div', { class: 'dialog shop' }, [
      this.portrait(shop.speaker),
      h('div', { class: 'dialog-body' }, [
        h('div', { class: 'dialog-name', text: shop.name }),
        h('div', { class: 'dialog-text', text: shop.text }),
        h('ul', { class: 'choice-list' }, this.items),
        this.walletEl,
      ]),
    ]);
    this.handlers = { pick: onBuy, close: onClose };
    this.show('shop', box);
    this.updateShop(hero);
    this.moveCursor(0);
  }

  updateShop(hero) {
    if (this.mode !== 'shop') return;
    this.walletEl.textContent = `金币 ${hero.gold} · 经验 ${hero.exp} · 钥匙 ${hero.keys.yellow}/${hero.keys.blue}/${hero.keys.red}`;
  }

  // ----------------------------------------------------------------- menu --
  /**
   * Generic vertical list menu.
   * @param {{title:string, entries:{label:string, detail?:string, disabled?:boolean, value:any}[], onPick:(value:any)=>void, onClose:()=>void, footer?:string, pageSize?: number, closable?: boolean}} opts
   */
  showMenu(opts) {
    this.items = opts.entries.map((e, i) => h('li', {
      class: `choice${e.disabled ? ' disabled' : ''}`,
      dataset: { index: i },
    }, [h('span', { class: 'label', text: e.label }), e.detail ? h('span', { class: 'detail', text: e.detail }) : null]));
    this.menuEntries = opts.entries;
    this.cursor = Math.max(0, opts.entries.findIndex((e) => !e.disabled));
    const closeBtn = opts.closable === false ? null : h('button', { class: 'close', text: '✕', dataset: { index: 'close' } });
    const box = h('div', { class: 'panel-box menu' }, [
      h('div', { class: 'panel-title' }, [opts.title, closeBtn]),
      h('ul', { class: 'choice-list' }, this.items),
      opts.footer ? h('div', { class: 'panel-footer', text: opts.footer }) : null,
    ]);
    this.allowClose = true;
    this.handlers = { pick: (i) => opts.onPick(opts.entries[i].value), close: opts.onClose };
    this.show('menu', box);
    this.allowClose = opts.closable !== false;
    const pageSize = opts.pageSize ?? 4;
    if (pageSize > 0 && this.items.length > pageSize) {
      const label = h('span', { 'aria-live': 'polite' });
      const change = (delta) => {
        const page = (Math.floor(this.cursor / pageSize) + delta + Math.ceil(this.items.length / pageSize)) % Math.ceil(this.items.length / pageSize);
        this.cursor = page * pageSize;
        this.moveCursor(0);
      };
      box.append(h('div', { class: 'pager' }, [
        h('button', { class: 'btn', text: '上一页', onClick: () => change(-1) }), label,
        h('button', { class: 'btn', text: '下一页', onClick: () => change(1) }),
      ]));
      this.menuPage = () => {
        const page = Math.floor(this.cursor / pageSize);
        this.items.forEach((el, i) => { el.hidden = Math.floor(i / pageSize) !== page; });
        label.textContent = `${page + 1} / ${Math.ceil(this.items.length / pageSize)}`;
      };
      this.handlers.page = change;
    }
    this.moveCursor(0);
  }

  /** Generic panel with arbitrary content (manual, help, ending). */
  showPanel(title, content, onClose, extraClass = '') {
    const box = h('div', { class: `panel-box ${extraClass}` }, [
      h('div', { class: 'panel-title' }, [title, h('button', { class: 'close', text: '✕', dataset: { index: 'close' } })]),
      h('div', { class: 'panel-content' }, Array.isArray(content) ? content : [content]),
    ]);
    this.handlers = { close: onClose };
    this.show('panel', box);
  }

  /** Pack whole rows into pages according to the available modal height. */
  showCollection(title, nodes, onClose, extraClass = '') {
    const content = h('div', { class: `collection ${extraClass}` });
    const label = h('span', { 'aria-live': 'polite' });
    let page = 0;
    let pages = [nodes];
    const render = () => {
      content.replaceChildren(...pages[page]);
      label.textContent = `${page + 1} / ${pages.length}`;
      prev.disabled = page === 0;
      next.disabled = page === pages.length - 1;
    };
    const change = (delta) => { page = Math.max(0, Math.min(pages.length - 1, page + delta)); render(); };
    const prev = h('button', { class: 'btn', text: '上一页', onClick: () => change(-1) });
    const next = h('button', { class: 'btn', text: '下一页', onClick: () => change(1) });
    this.showPanel(title, [content, h('div', { class: 'pager' }, [prev, label, next])], onClose, 'collection-panel');
    this.handlers.page = change;
    const pack = () => {
      content.replaceChildren(...nodes);
      const available = content.clientHeight;
      const gap = parseFloat(getComputedStyle(content).rowGap) || 0;
      pages = [[]];
      let used = 0;
      for (const node of nodes) {
        const height = node.getBoundingClientRect().height + gap;
        if (used + height > available && pages.at(-1).length) { pages.push([]); used = 0; }
        pages.at(-1).push(node);
        used += height;
      }
      page = Math.min(page, pages.length - 1);
      render();
    };
    this.pageObserver = new ResizeObserver(pack);
    this.pageObserver.observe(content);
    pack();
  }

  // --------------------------------------------------------------- battle --
  /**
   * Animates a fight; resolves when done.  `skip()` finishes it immediately.
   * @param {object} fx battle effect from the engine
   * @param {{audio?: any, speedMs?: number}} opts
   */
  battle(fx, opts = {}) {
    const monsterSprite = this.sprites.tile(fx.monsterId) ?? this.sprites.big(fx.monsterId);
    const stat = (label, value) => h('div', { class: 'brow' }, [h('span', { class: 'blabel', text: label }), h('span', { class: 'bval', text: value })]);
    const mHp = h('span', { class: 'bval hp' });
    const hHp = h('span', { class: 'bval hp' });
    const box = h('div', { class: 'battle' }, [
      h('div', { class: 'fighter' }, [
        h('div', { class: 'fname', text: fx.monster.name }),
        spriteEl(monsterSprite, 'sprite big'),
        h('div', { class: 'brow' }, [h('span', { class: 'blabel', text: '生命' }), mHp]),
        stat('攻击', fx.monster.atk),
        stat('防御', fx.monster.def),
      ]),
      h('div', { class: 'vs', text: 'VS' }),
      h('div', { class: 'fighter' }, [
        h('div', { class: 'fname', text: '勇士' }),
        spriteEl(this.sprites.named('heroLeft'), 'sprite big'),
        h('div', { class: 'brow' }, [h('span', { class: 'blabel', text: '生命' }), hHp]),
        stat('攻击', fx.heroBefore.atk),
        stat('防御', fx.heroBefore.def),
      ]),
      h('div', { class: 'battle-hint', text: '按任意键跳过' }),
    ]);
    this.show('battle', box);

    const heroHit = fx.heroBefore.atk - fx.monster.def;
    let mhp = fx.monster.hp;
    let hhp = fx.heroBefore.hp - fx.drain;
    mHp.textContent = String(mhp);
    hHp.textContent = String(hhp);
    const totalTurns = fx.turns;
    const shown = Math.min(totalTurns, 14);
    const stride = totalTurns / shown;
    const stepMs = Math.max(40, Math.min(opts.speedMs ?? 90, 1100 / shown));

    return new Promise((resolve) => {
      let i = 0;
      let done = false;
      let holdTimer;
      const cancel = () => {
        if (done) return;
        done = true;
        clearInterval(timer);
        clearTimeout(holdTimer);
        this.cancelBattle = null;
        resolve();
      };
      const finish = () => {
        if (done) return;
        cancel();
        this.close();
      };
      this.cancelBattle = cancel;
      this.handlers = { skip: finish };
      const timer = setInterval(() => {
        i++;
        const turn = Math.min(totalTurns, Math.round(i * stride));
        mhp = Math.max(0, fx.monster.hp - turn * heroHit);
        hhp = fx.heroBefore.hp - fx.drain - Math.min(turn, totalTurns - 1) * fx.perTurn;
        mHp.textContent = String(mhp);
        hHp.textContent = String(hhp);
        opts.audio?.play('hit');
        if (i >= shown) {
          hHp.textContent = String(fx.heroAfter.hp);
          opts.audio?.play('win');
          // Stop scheduling extra ticks while the short victory hold is shown.
          // Without this, long fights keep replaying the final hit/win sound
          // and queue several redundant finish callbacks.
          clearInterval(timer);
          holdTimer = setTimeout(finish, 180);
        }
      }, stepMs);
    });
  }

  // ---------------------------------------------------------------- input --
  moveCursor(delta) {
    if (!this.items.length) return;
    const n = this.items.length;
    let c = this.cursor;
    for (let tries = 0; tries < n; tries++) {
      c = (c + delta + n) % n;
      if (!this.items[c].classList.contains('disabled')) break;
      if (delta === 0) delta = 1;
    }
    this.cursor = c;
    this.items.forEach((el, i) => el.classList.toggle('active', i === c));
    this.menuPage?.();
  }

  activate(index) {
    if (index === 'close') {
      if (this.allowClose === false) return;
      this.handlers.close?.();
      return;
    }
    const i = Number(index);
    if (Number.isNaN(i) || !this.items[i] || this.items[i].classList.contains('disabled')) return;
    this.handlers.pick?.(i);
  }

  onClick(e) {
    if (this.mode === 'battle') { this.handlers.skip?.(); return; }
    if (this.mode === 'say') { this.handlers.next?.(); return; }
    const li = e.target.closest('[data-index]');
    if (li) { this.activate(li.dataset.index); return; }
    if (this.mode === 'panel' && e.target === this.root) this.handlers.close?.();
  }

  /** @returns {boolean} whether the key was consumed */
  handleKey(e) {
    if (!this.open) return false;
    const k = e.key;
    if (k === 'Tab') {
      const controls = [...this.root.querySelectorAll('button:not(:disabled), input, textarea, [tabindex="0"]')].filter(el => el.getClientRects().length);
      const i = controls.indexOf(document.activeElement);
      controls[(i + (e.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
      return true;
    }
    if (this.mode === 'battle') { this.handlers.skip?.(); return true; }
    if (this.mode === 'say') {
      if (['Enter', ' ', 'z', 'Z', 'Escape'].includes(k)) this.handlers.next?.();
      return true;
    }
    if ((k === 'Escape' || k === 'x' || k === 'X') && this.allowClose !== false) { this.handlers.close?.(); return true; }
    if ((k === 'Escape' || k === 'x' || k === 'X') && this.allowClose === false) return true;
    if (['ArrowLeft', 'PageUp'].includes(k) && this.handlers.page) { this.handlers.page(-1); return true; }
    if (['ArrowRight', 'PageDown'].includes(k) && this.handlers.page) { this.handlers.page(1); return true; }
    if (this.mode === 'panel') {
      if (k === 'Enter' || k === ' ') document.activeElement?.closest('button')?.click();
      return true;
    }
    if (['Enter', ' '].includes(k) && document.activeElement?.matches('button')) { document.activeElement.click(); return true; }
    if (k === 'ArrowUp' || k === 'w' || k === 'W') this.moveCursor(-1);
    else if (k === 'ArrowDown' || k === 's' || k === 'S') this.moveCursor(1);
    else if (k === 'Enter' || k === ' ' || k === 'z' || k === 'Z') this.activate(this.items[this.cursor]?.dataset.index);
    else if (/^[1-9]$/.test(k)) this.activate(Number(k) - 1);
    return true;
  }
}
