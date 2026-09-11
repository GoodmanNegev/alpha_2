// The status panel on the left: floor, stats, keys, story items, timer.

import { FLOORS } from '../data/floors.js';
import { T } from '../data/tiles.js';
import { isCasual, modeInfo } from '../data/mode.js';
import { formatTime, h, spriteEl } from './dom.js';

export class Hud {
  constructor(root, sprites) {
    this.root = root;
    this.sprites = sprites;
    this.els = {};
    this.lastItems = '';
    this.build();
  }

  build() {
    const stat = (id, label, cls = '') => {
      const dd = h('dd', { id: `hud-${id}`, class: cls });
      this.els[id] = dd;
      return [h('dt', { text: label }), dd];
    };
    this.els.floor = h('b', { text: '0' });
    this.els.title = h('div', { class: 'floor-title' });
    const keys = ['yellow', 'blue', 'red'].map((c) => {
      const b = h('b', { text: '0' });
      this.els[`key-${c}`] = b;
      const tiles = { yellow: T.YELLOW_KEY, blue: T.BLUE_KEY, red: T.RED_KEY };
      const names = { yellow: '黄钥匙', blue: '蓝钥匙', red: '红钥匙' };
      return h('span', { class: `key ${c}`, title: names[c], 'aria-label': names[c] }, [spriteEl(this.sprites.tile(tiles[c]), 'sprite small'), b]);
    });
    this.els.name = h('div', { class: 'hero-name', text: '无名勇士' });
    this.els.time = h('span', { text: '00:00' });
    this.els.steps = h('span', { text: '0' });
    this.root.append(
      h('button', { class: 'hero-card', 'data-cmd': 'profile', title: '勇者详情与改名' }, [
        h('div', { class: 'hero-seal' }, [spriteEl(this.sprites.named('heroDown'), 'sprite')]),
        h('div', { class: 'hero-identity' }, [this.els.name, h('div', { class: 'hero-caption', text: '查看档案' })]),
        h('span', { class: 'profile-arrow', text: '›', 'aria-hidden': 'true' }),
      ]),
      h('div', { class: 'floor' }, ['第 ', this.els.floor, ' 层']),
      this.els.title,
      h('dl', { class: 'stats' }, [
        ...stat('lv', '等级'),
        ...stat('hp', '生命', 'hp'),
        ...stat('atk', '攻击', 'atk'),
        ...stat('def', '防御', 'def'),
        ...stat('gold', '金币', 'gold'),
        ...stat('exp', '经验', 'exp'),
      ]),
      h('div', { class: 'keys' }, keys),
      h('div', { class: 'time' }, ['用时 ', this.els.time, ' · 步数 ', this.els.steps]),
    );
  }

  update(state) {
    const { hero } = state;
    const set = (id, v) => { if (this.els[id].textContent !== String(v)) this.els[id].textContent = String(v); };
    set('name', state.heroName || '无名勇士');
    set('floor', FLOORS[state.floor].name);
    const title = FLOORS[state.floor].title;
    this.els.title.textContent = isCasual(state) ? `${title} · ${modeInfo(state.mode).short}` : title;
    set('lv', hero.lv);
    set('hp', hero.hp);
    set('atk', hero.atk);
    set('def', hero.def);
    set('gold', hero.gold);
    set('exp', hero.exp);
    set('key-yellow', hero.keys.yellow);
    set('key-blue', hero.keys.blue);
    set('key-red', hero.keys.red);
    this.els.time.textContent = formatTime(state.stats.playMs);
    this.els.steps.textContent = String(state.stats.steps);
  }
}
