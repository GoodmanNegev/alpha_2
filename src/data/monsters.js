// Monster roster of 魔塔 v1.12 (24层).  Stats are (hp, atk, def, gold, exp)
// exactly as recovered from the original Flash game.
//
// special:
//   { drain: r }   – 吸血: before the fight the monster takes floor(hp*r) of the
//                    hero's *current* HP, regardless of defence.
//   { fixed: n }   – 魔法攻击: the monster always inflicts n extra damage.
//
// tiers: some late monsters grow stronger after the 16F boss (tier 1) and
// again after the 21F boss (tier 2).

const M = (name, hp, atk, def, gold, exp, sprite, palette, extra = {}) =>
  Object.freeze({ name, hp, atk, def, gold, exp, sprite, palette, ...extra });

export const MONSTERS = Object.freeze({
  40: M('绿头怪', 50, 20, 1, 1, 1, 'slime', 'green'),
  41: M('红头怪', 70, 15, 2, 2, 2, 'slime', 'red'),
  42: M('小蝙蝠', 100, 20, 5, 3, 3, 'bat', 'gray'),
  43: M('青头怪', 200, 35, 10, 5, 5, 'slime', 'cyan'),
  44: M('骷髅人', 110, 25, 5, 5, 4, 'skeleton', 'bone'),
  45: M('骷髅士兵', 150, 40, 20, 8, 6, 'skeletonSoldier', 'bone'),
  46: M('兽面人', 300, 75, 45, 13, 10, 'orc', 'green'),
  47: M('初级卫兵', 450, 150, 90, 22, 19, 'guard', 'blue'),
  48: M('大蝙蝠', 150, 65, 30, 10, 8, 'bat', 'purple'),
  49: M('红蝙蝠', 550, 160, 90, 25, 20, 'bat', 'red'),
  50: M('白衣武士', 1300, 300, 150, 40, 35, 'knight', 'white', { special: { drain: 1 / 4 } }),
  51: M('怪王', 700, 250, 125, 32, 30, 'slimeKing', 'green'),
  52: M('红衣法师', 500, 400, 260, 47, 45, 'mage', 'red', { special: { fixed: 300 } }),
  53: M('红衣魔王', 15000, 1000, 1000, 100, 100, 'king', 'red'),
  54: M('金甲卫士', 850, 350, 200, 45, 40, 'knight', 'gold'),
  55: M('金甲队长', 900, 750, 650, 77, 70, 'knight', 'goldCaptain'),
  56: M('骷髅队长', 400, 90, 50, 15, 12, 'skeletonSoldier', 'captain'),
  57: M('灵法师', 1500, 830, 730, 80, 70, 'mage', 'dark', {
    special: { drain: 1 / 3 },
    tiers: [
      { hp: 2000, atk: 1106, def: 973, gold: 106, exp: 93 },
      { hp: 3000, atk: 2212, def: 1946, gold: 132, exp: 116 },
    ],
  }),
  58: M('灵武士', 1200, 980, 900, 88, 75, 'knight', 'dark', {
    tiers: [
      { hp: 1600, atk: 1306, def: 1200, gold: 117, exp: 100 },
      { hp: 2400, atk: 2612, def: 2400, gold: 146, exp: 125 },
    ],
  }),
  59: M('冥灵魔王', 30000, 1700, 1500, 250, 220, 'king', 'dark'),
  60: M('麻衣法师', 250, 120, 70, 20, 17, 'mage', 'brown', { special: { fixed: 100 } }),
  61: M('冥战士', 2000, 680, 590, 70, 65, 'guard', 'dark'),
  62: M('冥队长', 2500, 900, 850, 84, 75, 'skeletonSoldier', 'dark', {
    tiers: [
      { hp: 3333, atk: 1200, def: 1133, gold: 112, exp: 100 },
      { hp: 4999, atk: 2400, def: 2266, gold: 140, exp: 125 },
    ],
  }),
  63: M('初级法师', 125, 50, 25, 10, 7, 'mage', 'blue'),
  64: M('高级法师', 100, 200, 110, 30, 25, 'mage', 'violet'),
  65: M('石头怪人', 500, 115, 65, 15, 15, 'rock', 'stone'),
  66: M('兽面武士', 900, 450, 330, 50, 50, 'orc', 'armored'),
  67: M('双手剑士', 1200, 620, 520, 65, 75, 'guard', 'swordsman'),
  68: M('冥卫兵', 1250, 500, 400, 55, 55, 'guard', 'ghost'),
  69: M('高级卫兵', 1500, 560, 460, 60, 60, 'guard', 'red'),
  70: M('影子战士', 3100, 1150, 1050, 92, 80, 'knight', 'shadow'),
  // boss variants
  153: M('红衣魔王', 20000, 1333, 1333, 133, 133, 'king', 'red', {
    tiers: [null, { hp: 30000, atk: 2666, def: 2666, gold: 166, exp: 166 }],
  }),
  159: M('冥灵魔王·真身', 45000, 2550, 2250, 312, 275, 'king', 'darkTrue'),
  259: M('冥灵魔王·幻影', 60000, 3400, 3000, 390, 343, 'king', 'phantom'),
  188: M('魔龙', 99999, 9999, 5000, 0, 0, 'dragon', 'dragon', { big: true }),
  198: M('血影', 99999, 5000, 4000, 0, 0, 'shadow', 'blood', { big: true }),
});

/** Stats of a monster at the given upgrade tier (0, 1 or 2). */
export function monsterStats(id, tier = 0) {
  const base = MONSTERS[id];
  if (!base) throw new Error(`unknown monster ${id}`);
  if (!base.tiers || tier <= 0) return base;
  let stats = base;
  for (let t = 0; t < Math.min(tier, base.tiers.length); t++) {
    const up = base.tiers[t];
    if (up) stats = { ...stats, ...up };
  }
  return stats;
}

export function specialText(monster) {
  const s = monster.special;
  if (!s) return '';
  if (s.drain) return `吸血 ${Math.round(s.drain * 100)}%`;
  if (s.fixed) return `魔攻 ${s.fixed}`;
  return '';
}
