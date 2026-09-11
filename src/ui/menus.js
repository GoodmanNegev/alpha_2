// The non-story menus: monster manual, floor teleport, save/load, settings,
// help and the ending screens.  Each function receives the game controller.

import { FLOORS } from '../data/floors.js';
import { MODE_CASUAL, MODE_CLASSIC, MODES, modeInfo } from '../data/mode.js';
import { specialText } from '../data/monsters.js';
import { forecast, describeDamage, dangerLevel } from '../engine/combat.js';
import { floorMonsters } from '../engine/move.js';
import { canFlyTo, FLY_MAX_FLOOR } from '../engine/floor.js';
import { SLOT_COUNT } from '../engine/save.js';
import { formatTime, h, spriteEl } from './dom.js';
import { detectApi, fetchProgress } from '../leaderboard.js';

/** Smallest attack increase that lowers the damage taken (魔塔's 临界). */
export function criticalAttack(hero, monster, limit = 3000) {
  const base = forecast(hero, monster);
  for (let extra = 1; extra <= limit; extra++) {
    const r = forecast({ ...hero, atk: hero.atk + extra }, monster);
    if (r.damage < base.damage) return { extra, damage: r.damage };
  }
  return null;
}

export function showManual(game) {
  const { state } = game;
  if (!state.items.manual) {
    game.message('你还没有圣光徽，无法查看怪物信息。');
    game.audio.play('error');
    return;
  }
  const list = floorMonsters(state);
  const rows = list.length
    ? list.map(({ id, monster, result, count }) => {
        const crit = criticalAttack(state.hero, monster);
        const special = specialText(monster);
        return h('div', { class: 'mrow' }, [
          spriteEl(game.renderer.sprites.tile(id) ?? game.renderer.sprites.big(id), 'sprite'),
          h('div', { class: 'mstats' }, [
            h('div', { class: 'mname' }, [monster.name, count > 1 ? h('span', { class: 'mcount', text: ` ×${count}` }) : null, special ? h('span', { class: 'mspecial', text: special }) : null]),
            h('div', { class: 'mline' }, [`生命 ${monster.hp}　攻击 ${monster.atk}　防御 ${monster.def}`]),
            h('div', { class: 'mline' }, [`金币 ${monster.gold}　经验 ${monster.exp}　`, h('span', { class: `dmg ${dangerLevel(result, state.hero.hp)}`, text: `伤害 ${describeDamage(result)}` })]),
            h('div', { class: 'mline dim' }, [crit ? `临界：攻击 +${crit.extra} → 伤害 ${describeDamage({ damage: crit.damage })}` : '临界：—']),
          ]),
        ]);
      })
    : [h('p', { class: 'dim', text: '这一层没有怪物。' })];
  game.overlay.showCollection('怪物手册', rows, () => game.closeMenu(), 'manual');
}

export function showFly(game) {
  const { state } = game;
  if (!state.items.fly) {
    game.message('你还没有风之罗盘。');
    game.audio.play('error');
    return;
  }
  if (state.floor > FLY_MAX_FLOOR) {
    game.message('这里无法使用风之罗盘！');
    game.audio.play('error');
    return;
  }
  const entries = [];
  for (let f = Math.min(FLY_MAX_FLOOR, state.maxFloor); f >= 0; f--) {
    if (!state.visited[f]) continue;
    entries.push({ label: `${FLOORS[f].title}`, detail: f === state.floor ? '当前' : '', disabled: !canFlyTo(state, f), value: f });
  }
  game.overlay.showMenu({
    title: '风之罗盘 · 楼层传送',
    entries,
    onPick: (f) => { game.closeMenu(); game.apply({ type: 'FLY', floor: f }); },
    onClose: () => game.closeMenu(),
    footer: '↑↓ 选择 · Enter 传送 · Esc 取消',
  });
}

function slotLabel(meta, i) {
  const name = i === 0 ? '自动存档' : `存档 ${i}`;
  if (!meta) return { label: name, detail: '（空）' };
  const when = new Date(meta.savedAt);
  const time = `${when.getMonth() + 1}/${when.getDate()} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
  const mode = modeInfo(meta.mode).short;
  return { label: `${name} · 第 ${meta.floorName} 层`, detail: `${mode} · Lv${meta.lv} HP${meta.hp} 攻${meta.atk} 防${meta.def} · ${formatTime(meta.playMs)} · ${time}` };
}

export function showSaveMenu(game, mode, onClose = () => game.closeMenu()) {
  const metas = game.saves.list();
  const entries = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const { label, detail } = slotLabel(metas[i], i);
    const disabled = mode === 'load' ? !metas[i] : i === 0;
    entries.push({ label, detail, disabled, value: i });
  }
  entries.push({ label: mode === 'load' ? '从文本导入存档…' : '导出当前进度为文本', detail: '', value: 'text' });
  game.overlay.showMenu({
    title: mode === 'load' ? '读取进度' : '保存进度',
    entries,
    onPick: (v) => {
      if (v === 'text') { mode === 'load' ? game.importText() : game.exportText(); return; }
      if (mode === 'load') game.loadSlot(v);
      else game.saveSlot(v);
    },
    onClose,
    footer: mode === 'load' ? '选择一个存档读取' : '自动存档会在切换楼层时写入',
  });
}

export function showSystemMenu(game) {
  const back = () => showSystemMenu(game);
  game.overlay.showMenu({
    title: '菜单',
    pageSize: 0,
    entries: [
      { label: '保存进度', detail: '写入当前冒险', value: 'save' },
      { label: '读取进度', detail: '选择一份存档', value: 'load' },
      { label: '探索排行榜', detail: '最高到达楼层', value: 'board' },
      { label: '设置', detail: '音效与操作', value: 'settings' },
      { label: '帮助', detail: '操作说明', value: 'help' },
      { label: '重新开始', detail: '选择模式，从头开局', value: 'restart' },
    ],
    onPick: (v) => {
      const open = {
        save: () => showSaveMenu(game, 'save', back),
        load: () => showSaveMenu(game, 'load', back),
        board: () => showLeaderboard(game, back),
        settings: () => showSettings(game, back),
        help: () => showHelp(game, back),
        restart: () => game.restart(),
      };
      open[v]?.();
    },
    onClose: () => game.closeMenu(),
    footer: '手册、传送、背包在主栏 · Esc 关闭',
  });
}

export function showSettings(game, onClose = () => game.closeMenu()) {
  const s = game.settings;
  const yn = (v) => (v ? '开' : '关');
  const entries = [
    { label: '音效', detail: yn(s.sfx), value: 'sfx' },
    { label: '背景音乐', detail: yn(s.bgm), value: 'bgm' },
    { label: '战斗动画', detail: yn(s.battleAnim), value: 'battleAnim' },
    { label: '地图显示怪物伤害（需圣光徽）', detail: yn(s.showDamage), value: 'showDamage' },
    { label: '点击/触摸地图自动寻路', detail: yn(s.clickMove), value: 'clickMove' },
    { label: '移动速度', detail: s.moveMs <= 80 ? '快' : s.moveMs <= 120 ? '中' : '慢', value: 'moveMs' },
  ];
  game.overlay.showMenu({
    title: '设置',
    entries,
    onPick: (k) => { game.toggleSetting(k); showSettings(game, onClose); },
    onClose,
    footer: 'Enter 切换 · Esc 返回或关闭',
  });
}

export function showHelp(game, onClose = () => game.closeMenu()) {
  const sections = [
    ['移动与交互', '方向键移动，撞向物品拾取、撞门开锁、撞怪战斗。点击地图可以自动寻路。'],
    ['对话与菜单', 'Enter / 空格 / Z 确认，Esc 关闭。从「菜单」打开的页面会先返回菜单。列表用 ↑↓ 选择；左右方向键或翻页按钮切换页面。'],
    ['随身工具', '主栏只有手册、传送和背包。其余在「菜单」里，包括重新开始。键盘：B 背包，C 勇者详情，X 怪物手册，F 楼层传送，R 重新开始。手册和传送需要先获得对应道具。'],
    ['保存冒险', 'S 存档，L 读档。切换楼层会自动保存；也可以在存读档菜单中导出或导入文本备份。'],
    ['战斗规则', '勇者先手。攻击不高于怪物防御无法取胜；生命不足时也不会强制战斗。手册可以预估伤害。'],
    ['特殊怪物', '白衣武士吸血 1/4，灵法师吸血 1/3；麻衣法师附加 100 魔法伤害，红衣法师附加 300。'],
    ['成长与道具', '红、蓝宝石分别增加 3 攻击、3 防御；红、蓝药水增加 200、500 生命。装备属性拾取后立即生效。'],
    ['冒险模式', '开局或重新开始时选择经典或休闲。经典为原版数值；休闲击杀金币与经验翻倍、开局钥匙更宽裕，且魔王死后怪物不再强化。中途不能切换。排行榜按到达楼层排列，不区分模式。'],
    ['深入魔塔', '经典模式中，击败 16、21 层魔王后部分怪物会强化。21 层禁止传送且不能立即返回，请先存档。'],
    ['独立冒险', '每位玩家在自己的浏览器中游玩。存档保存在本机，排行榜只公开勇者名称与最高到达层数。'],
  ];
  game.overlay.showCollection('冒险指南', sections.map(([title, text]) =>
    h('article', { class: 'guide-card' }, [h('h3', { text: title }), h('p', { text })])
  ), onClose);
}

export function showEnding(game, ending) {
  const { state } = game;
  const isTrue = ending === 'true';
  const content = h('div', { class: 'ending' }, [
    h('div', { class: 'ending-title', text: isTrue ? '★ 真结局 ★' : '通　关' }),
    h('p', { text: isTrue
      ? '“血影”被彻底消灭，塔下的封印永远闭合。仙子带着公主走出了魔塔，而你的传说将被这座塔永远铭记。'
      : '冥灵魔王倒下了。仙子说，公主已经安全离开了魔塔——但塔的更深处，似乎还藏着什么……（21 层上方出现了通往隐藏层的楼梯）' }),
    h('table', { class: 'ending-stats' }, [
      h('tr', {}, [h('td', { text: '模式' }), h('td', { text: modeInfo(state.mode).name })]),
      h('tr', {}, [h('td', { text: '用时' }), h('td', { text: formatTime(state.stats.playMs) })]),
      h('tr', {}, [h('td', { text: '步数' }), h('td', { text: state.stats.steps })]),
      h('tr', {}, [h('td', { text: '击杀' }), h('td', { text: state.stats.kills })]),
      h('tr', {}, [h('td', { text: '等级' }), h('td', { text: state.hero.lv })]),
      h('tr', {}, [h('td', { text: '生命 / 攻击 / 防御' }), h('td', { text: `${state.hero.hp} / ${state.hero.atk} / ${state.hero.def}` })]),
    ]),
    game.api ? h('button', { class: 'btn', text: '查看探索排行榜', onClick: () => showLeaderboard(game) }) : null,
    h('div', { class: 'ending-actions' }, [
      h('button', { class: 'btn', text: isTrue ? '回到塔中' : '继续探索', onClick: () => game.closeMenu() }),
      h('button', { class: 'btn', text: '重新开始', onClick: () => { game.closeMenu(); game.restart(true); } }),
    ]),
  ]);
  game.overlay.showPanel(isTrue ? '魔塔 · 真结局' : '魔塔 · 通关', content, () => game.closeMenu(), 'ending-panel');
}

export function showModeSelect(game, { required = false } = {}) {
  game.mustPickMode = required;
  game.overlay.showMenu({
    title: '选择冒险',
    pageSize: 0,
    closable: !required,
    entries: [
      { label: MODES[MODE_CLASSIC].name, detail: MODES[MODE_CLASSIC].detail, value: MODE_CLASSIC },
      { label: MODES[MODE_CASUAL].name, detail: MODES[MODE_CASUAL].detail, value: MODE_CASUAL },
    ],
    onPick: (mode) => {
      game.mustPickMode = false;
      if (!required) {
        try { game.saves.remove(0); } catch { /* ignore */ }
      }
      game.startNew({
        heroName: game.state?.heroName,
        adventurerId: game.state?.adventurerId,
        mode,
      });
    },
    onClose: () => {
      if (required) {
        showModeSelect(game, { required: true });
        return;
      }
      game.mustPickMode = false;
      game.closeMenu();
    },
    footer: required ? '请选择一种模式开始 · 开局后无法切换' : '选定后将清除自动存档并回到序章 · Esc 取消',
  });
}

export async function showLeaderboard(game, onClose = () => game.closeMenu()) {
  const loading = h('p', { class: 'empty-state', text: '正在寻找其他勇者的足迹…' });
  game.overlay.showPanel('探索排行榜', loading, onClose);
  try {
    if (!game.api) game.api = await detectApi();
    if (!loading.isConnected) return;
    if (!game.api) {
      loading.textContent = '排行榜暂时不可用，你仍可继续冒险。';
      return;
    }
    // Commit this hero before loading, so a rename or new floor is visible.
    let synced = true;
    try { await game.syncProgress(); } catch { synced = false; }
    if (!loading.isConnected) return;
    const rows = await fetchProgress();
    if (!loading.isConnected) return;
    const cards = rows.length ? rows.map(r => h('article', { class: 'ranking-row' }, [
      h('span', { class: 'rank', text: String(r.rank).padStart(2, '0') }),
      h('strong', { text: r.name }),
      h('span', { class: 'rank-floor', text: FLOORS[r.floor]?.title || '未知楼层' }),
    ])) : [h('p', { class: 'empty-state', text: '还没有冒险记录，下一位登塔的勇者就是你。' })];
    if (!synced) cards.unshift(h('p', { class: 'collection-note', text: '你的最新进度暂未同步，以下为已保存的榜单。' }));
    game.overlay.showCollection('探索排行榜 · 最高到达', cards, onClose);
  } catch {
    if (loading.isConnected) loading.textContent = '排行榜暂时不可用，请稍后重新打开。';
  }
}
