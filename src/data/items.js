import { T } from './tiles.js';

export const VALUES = Object.freeze({
  redGem: 3,
  blueGem: 3,
  redPotion: 200,
  bluePotion: 500,
  goldNugget: 300,
  levelHp: 1000,
  levelAtk: 7,
  levelDef: 7,
  ironSword: 10,
  knightSword: 70,
  holySword: 150,
  ironShield: 10,
  knightShield: 85,
  holyShield: 190,
});

/** Stat gain for `n` levels (the fixed formula the original uses everywhere). */
export function levelGain(n) {
  return { lv: n, hp: VALUES.levelHp * n, atk: VALUES.levelAtk * n, def: VALUES.levelDef * n };
}

// Each entry: name, a description for the inventory, and `apply(hero) ->
// partial hero` (never mutates).  `flag` marks permanent story items that are
// tracked in state.items instead of stats.
const I = (name, apply, msg, extra = {}) => Object.freeze({ name, apply, msg, ...extra });
const add = (fields) => (hero) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, hero[k] + v]));

export const ITEMS = Object.freeze({
  [T.YELLOW_KEY]: I('黄钥匙', (h) => ({ keys: { ...h.keys, yellow: h.keys.yellow + 1 } }), '得到一把黄钥匙'),
  [T.BLUE_KEY]: I('蓝钥匙', (h) => ({ keys: { ...h.keys, blue: h.keys.blue + 1 } }), '得到一把蓝钥匙'),
  [T.RED_KEY]: I('红钥匙', (h) => ({ keys: { ...h.keys, red: h.keys.red + 1 } }), '得到一把红钥匙'),
  [T.BLUE_GEM]: I('蓝宝石', add({ def: VALUES.blueGem }), `得到蓝宝石，防御 +${VALUES.blueGem}`),
  [T.RED_GEM]: I('红宝石', add({ atk: VALUES.redGem }), `得到红宝石，攻击 +${VALUES.redGem}`),
  [T.RED_POTION]: I('红药水', add({ hp: VALUES.redPotion }), `得到红药水，生命 +${VALUES.redPotion}`),
  [T.BLUE_POTION]: I('蓝药水', add({ hp: VALUES.bluePotion }), `得到蓝药水，生命 +${VALUES.bluePotion}`),
  [T.SMALL_FEATHER]: I('小飞羽', add(levelGain(1)), '得到小飞羽，等级 +1'),
  [T.BIG_FEATHER]: I('大飞羽', add(levelGain(3)), '得到大飞羽，等级 +3'),
  [T.HOLY_WATER]: I('圣水瓶', (h) => ({ hp: h.hp * 2 }), '得到圣水瓶，生命值加倍！'),
  [T.KEY_BOX]: I('钥匙盒', (h) => ({ keys: { yellow: h.keys.yellow + 1, blue: h.keys.blue + 1, red: h.keys.red + 1 } }), '得到钥匙盒，各种钥匙 +1'),
  [T.GOLD_NUGGET]: I('金块', add({ gold: VALUES.goldNugget }), `得到金块，金币 +${VALUES.goldNugget}`),
  [T.IRON_SWORD]: I('铁剑', add({ atk: VALUES.ironSword }), `得到铁剑，攻击 +${VALUES.ironSword}`),
  [T.KNIGHT_SWORD]: I('骑士剑', add({ atk: VALUES.knightSword }), `得到骑士剑，攻击 +${VALUES.knightSword}`),
  [T.HOLY_SWORD]: I('神圣剑', add({ atk: VALUES.holySword }), `得到神圣剑，攻击 +${VALUES.holySword}`),
  [T.IRON_SHIELD]: I('铁盾', add({ def: VALUES.ironShield }), `得到铁盾，防御 +${VALUES.ironShield}`),
  [T.KNIGHT_SHIELD]: I('骑士盾', add({ def: VALUES.knightShield }), `得到骑士盾，防御 +${VALUES.knightShield}`),
  [T.HOLY_SHIELD]: I('神圣盾', add({ def: VALUES.holyShield }), `得到神圣盾，防御 +${VALUES.holyShield}`),
  // permanent story items
  [T.CROSS]: I('幸运十字架', null, '得到【幸运十字架】：把它交给序章中的仙子，可以将自身的所有能力提升一些。', { flag: 'cross' }),
  [T.HOLY_BADGE]: I('圣光徽', null, '得到【圣光徽】：可以查看怪物的基本情况（按 X 打开怪物手册）。', { flag: 'manual' }),
  [T.WIND_COMPASS]: I('风之罗盘', null, '得到【风之罗盘】：可以在已经走过的楼层间跳跃（按 F 使用）。', { flag: 'fly' }),
  [T.STAR_HAMMER]: I('星光神榔', null, '得到【星光神榔】：把它交给第四层的小偷，他便会打开第十八层的隐藏地面。', { flag: 'hammer' }),
  [T.FIRE_STAFF]: I('炎之灵杖', null, '得到【炎之灵杖】：镶有红宝石的灵之杖。', { flag: 'fireStaff' }),
  [T.HEART_STAFF]: I('心之灵杖', null, '得到【心之灵杖】：镶有绿宝石的灵之杖。', { flag: 'heartStaff' }),
});

export const STORY_ITEMS = Object.freeze([
  { flag: 'cross', name: '幸运十字架', desc: '交给序章的仙子可提升全部能力。' },
  { flag: 'manual', name: '圣光徽', desc: '查看当前楼层怪物的属性与伤害。' },
  { flag: 'fly', name: '风之罗盘', desc: '在到过的楼层之间瞬间移动。' },
  { flag: 'hammer', name: '星光神榔', desc: '小偷杰克要找的铁榔头。' },
  { flag: 'iceStaff', name: '冰之灵杖', desc: '镶有蓝宝石的灵之杖。' },
  { flag: 'fireStaff', name: '炎之灵杖', desc: '镶有红宝石的灵之杖。' },
  { flag: 'heartStaff', name: '心之灵杖', desc: '镶有绿宝石的灵之杖。' },
]);
