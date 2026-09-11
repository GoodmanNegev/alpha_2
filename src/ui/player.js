import { T } from '../data/tiles.js';
import { FLOORS } from '../data/floors.js';
import { ITEMS, STORY_ITEMS } from '../data/items.js';
import { h, spriteEl, formatTime } from './dom.js';

/** Recover equipment history from map changes, including older saves. */
export function collectedEquipment(state) {
  const cleared = (tile, onlyFloor) => FLOORS.some((floor, f) =>
    (onlyFloor === undefined || f === onlyFloor) && floor.map.some((row, y) =>
      row.some((original, x) => original === tile && state.maps[f][y][x] === T.FLOOR)));
  const gear = [T.IRON_SWORD, T.KNIGHT_SWORD, T.HOLY_SWORD, T.IRON_SHIELD, T.KNIGHT_SHIELD, T.HOLY_SHIELD]
    .filter(tile => cleared(tile)).map(tile => ({ tile, name: ITEMS[tile].name, desc: ITEMS[tile].msg.replace(/^得到[^，]+，/, '') }));
  // These NPCs disappear only after handing over their equipment.
  for (const [floor, npc, tile, name, desc] of [
    [2, T.OLD_MAN, T.KNIGHT_SWORD, '老人的宝剑', '攻击 +70'],
    [2, T.MERCHANT, T.IRON_SHIELD, '商人的盾牌', '防御 +30'],
    [15, T.OLD_MAN, T.HOLY_SWORD, '圣光剑', '攻击 +120'],
    [15, T.MERCHANT, T.HOLY_SHIELD, '星光盾', '防御 +120'],
  ]) {
    if (cleared(npc, floor)) gear.push({ tile, name, desc });
  }
  return gear;
}

export function showProfile(game) {
  const state = game.state;
  const name = h('input', { class: 'name-input', id: 'hero-name', value: state.heroName || '无名勇士', maxlength: 16, autocomplete: 'off' });
  const status = h('p', { class: 'form-status', role: 'status' });
  const form = h('form', { class: 'rename-form', onSubmit: (e) => {
    e.preventDefault();
    game.renameHero(name.value);
    name.value = game.state.heroName;
    status.textContent = '名称已保存。';
  } }, [h('label', { for: 'hero-name', text: '勇者名称' }), h('div', { class: 'rename-fields' }, [name, h('button', { class: 'btn', type: 'submit', text: '保存名称' })]), status]);
  const rows = [
    ['等级', state.hero.lv], ['生命', state.hero.hp], ['攻击', state.hero.atk], ['防御', state.hero.def],
    ['金币', state.hero.gold], ['经验', state.hero.exp], ['当前楼层', FLOORS[state.floor].title],
    ['最高到达', FLOORS[state.maxFloor].title], ['战胜怪物', state.stats.kills], ['冒险用时', formatTime(state.stats.playMs)],
  ];
  game.overlay.showPanel('勇者档案', [
    h('div', { class: 'profile-heading' }, [spriteEl(game.renderer.sprites.named('heroDown'), 'sprite portrait'), h('p', { text: '每一步，都是你的冒险。' })]),
    form,
    h('dl', { class: 'profile-stats' }, rows.flatMap(([key, value]) => [h('dt', { text: key }), h('dd', { text: value })])),
  ], () => game.closeMenu());
}

export function showBag(game) {
  const { state } = game;
  const cards = [];
  const card = (sprite, name, count, desc) => h('article', { class: 'inventory-card' }, [
    spriteEl(sprite, 'sprite'), h('div', {}, [h('h3', { text: name }), h('p', { text: desc })]), h('b', { text: count }),
  ]);
  for (const [color, tile, name] of [['yellow', T.YELLOW_KEY, '黄钥匙'], ['blue', T.BLUE_KEY, '蓝钥匙'], ['red', T.RED_KEY, '红钥匙']]) {
    cards.push(card(game.renderer.sprites.tile(tile), name, `×${state.hero.keys[color]}`, '撞向对应颜色的门时消耗一把。'));
  }
  for (const item of STORY_ITEMS.filter(it => state.items[it.flag])) {
    cards.push(card(game.renderer.sprites.named(item.flag), item.name, '持有', item.desc));
  }
  for (const gear of collectedEquipment(state)) {
    cards.push(card(game.renderer.sprites.tile(gear.tile), gear.name, '已生效', gear.desc + '，已计入勇者属性。'));
  }
  cards.push(h('p', { class: 'collection-note', text: '药水与宝石拾取后立即生效；剧情道具交出后会离开背包。' }));
  game.overlay.showCollection('冒险背包', cards, () => game.closeMenu());
}
