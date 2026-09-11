import { levelGain } from './items.js';

// choice.cost: { gold | exp | keys.<color> : n } — what the hero must pay.
// choice.gain: partial hero delta applied after paying.
const key = (color, n) => ({ keys: { [color]: n } });

export const SHOPS = Object.freeze({
  gold3F: {
    name: '贪婪之神',
    speaker: 'shop',
    text: '勇敢的武士啊，只要你给我 25 个金币，我就可以：',
    choices: [
      { label: '生命 +800', cost: { gold: 25 }, gain: { hp: 800 } },
      { label: '攻击 +4', cost: { gold: 25 }, gain: { atk: 4 } },
      { label: '防御 +4', cost: { gold: 25 }, gain: { def: 4 } },
    ],
  },
  gold11F: {
    name: '贪欲之神',
    speaker: 'shop',
    text: '勇敢的武士啊，只要你给我 100 个金币，我就可以：',
    choices: [
      { label: '生命 +4000', cost: { gold: 100 }, gain: { hp: 4000 } },
      { label: '攻击 +20', cost: { gold: 100 }, gain: { atk: 20 } },
      { label: '防御 +20', cost: { gold: 100 }, gain: { def: 20 } },
    ],
  },
  exp5F: {
    name: '神秘老人',
    speaker: 'oldman',
    text: '勇士，只要你有足够的经验，我就可以让你变得更强大：',
    choices: [
      { label: '等级 +1（100 经验）', cost: { exp: 100 }, gain: levelGain(1) },
      { label: '攻击 +5（30 经验）', cost: { exp: 30 }, gain: { atk: 5 } },
      { label: '防御 +5（30 经验）', cost: { exp: 30 }, gain: { def: 5 } },
    ],
  },
  keys5F: {
    name: '钥匙商人',
    speaker: 'merchant',
    text: '相信你一定有特殊需要，只要你有金币，我就可以帮你：',
    choices: [
      { label: '买 1 把黄钥匙（10 金币）', cost: { gold: 10 }, gain: key('yellow', 1) },
      { label: '买 1 把蓝钥匙（50 金币）', cost: { gold: 50 }, gain: key('blue', 1) },
      { label: '买 1 把红钥匙（100 金币）', cost: { gold: 100 }, gain: key('red', 1) },
    ],
  },
  keys12F: {
    name: '钥匙商人',
    speaker: 'merchant',
    text: '嘿，欢迎你的到来。如果你手里缺少金币，我可以帮你：',
    choices: [
      { label: '卖 1 把黄钥匙（7 金币）', cost: key('yellow', 1), gain: { gold: 7 } },
      { label: '卖 1 把蓝钥匙（35 金币）', cost: key('blue', 1), gain: { gold: 35 } },
      { label: '卖 1 把红钥匙（70 金币）', cost: key('red', 1), gain: { gold: 70 } },
    ],
  },
  exp13F: {
    name: '神秘老人',
    speaker: 'oldman',
    text: '勇士，只要你有足够的经验，我就可以让你变得更强大：',
    choices: [
      { label: '等级 +3（270 经验）', cost: { exp: 270 }, gain: levelGain(3) },
      { label: '攻击 +17（95 经验）', cost: { exp: 95 }, gain: { atk: 17 } },
      { label: '防御 +17（95 经验）', cost: { exp: 95 }, gain: { def: 17 } },
    ],
  },
});

/** Can the hero afford this cost? */
export function canPay(hero, cost) {
  if (cost.gold !== undefined && hero.gold < cost.gold) return false;
  if (cost.exp !== undefined && hero.exp < cost.exp) return false;
  if (cost.keys) {
    for (const [color, n] of Object.entries(cost.keys)) {
      if (hero.keys[color] < n) return false;
    }
  }
  return true;
}

/** Returns a new hero after paying `cost` and receiving `gain`. */
export function trade(hero, cost, gain) {
  let h = { ...hero, keys: { ...hero.keys } };
  if (cost.gold) h.gold -= cost.gold;
  if (cost.exp) h.exp -= cost.exp;
  if (cost.keys) for (const [c, n] of Object.entries(cost.keys)) h.keys[c] -= n;
  for (const [k, v] of Object.entries(gain)) {
    if (k === 'keys') for (const [c, n] of Object.entries(v)) h.keys[c] += n;
    else h[k] += v;
  }
  return h;
}
