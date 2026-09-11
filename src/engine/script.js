// A tiny interpreter for story scripts.  A script is an array of plain steps;
// blocking steps (say / choices / shop) park the remaining steps in
// state.pending until the UI sends CONFIRM / CHOOSE / CLOSE.
//
//   { t:'say', who, text }                 – dialogue line (blocking)
//   { t:'choices', who, text, options:[{label, steps}] }   (blocking)
//   { t:'shop', id }                       – open a shop (blocking)
//   { t:'if', cond(state), then:[], else:[] }
//   { t:'hero', delta }  | { t:'hero', fn(hero)->partial }
//   { t:'tile', floor?, x, y, tile }
//   { t:'flag', name, value } | { t:'item', name, value } | { t:'tier', value }
//   { t:'goto', floor, arrive } | { t:'call', fn(state)->state }
//   { t:'msg', text } | { t:'sfx', name } | { t:'fx', name } | { t:'end', ending }

import { SHOPS, canPay, trade } from '../data/shops.js';
import { addToHero, patchHero, setFlag, setItem, setTile } from './state.js';
import { goToFloor } from './floor.js';
import { firstArriveScript } from '../data/story.js';

const BLOCKING = new Set(['say', 'choices', 'shop']);

export function runScript(state, steps, effects = []) {
  let s = state;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (BLOCKING.has(step.t)) {
      s = { ...s, pending: { kind: step.t, step, rest: steps.slice(i + 1) } };
      effects.push({ type: 'pending', kind: step.t });
      return { state: s, effects };
    }
    if (step.t === 'if') {
      const branch = (step.cond(s) ? step.then : step.else) ?? [];
      return runScript(s, [...branch, ...steps.slice(i + 1)], effects);
    }
    if (step.t === 'goto') {
      const r = goToFloor(s, step.floor, step.arrive, step.dir);
      effects.push(...r.effects);
      const arrival = r.firstVisit ? firstArriveScript(step.floor) ?? [] : [];
      return runScript(r.state, [...arrival, ...steps.slice(i + 1)], effects);
    }
    s = applyStep(s, step, effects);
  }
  return { state: s, effects };
}

function applyStep(state, step, effects) {
  switch (step.t) {
    case 'hero':
      return step.fn ? patchHero(state, step.fn(state.hero)) : addToHero(state, step.delta);
    case 'tile':
      return setTile(state, step.floor ?? state.floor, step.x, step.y, step.tile);
    case 'flag':
      return setFlag(state, step.name, step.value ?? true);
    case 'item':
      return setItem(state, step.name, step.value ?? true);
    case 'tier':
      return { ...state, tier: step.value };
    case 'call':
      return step.fn(state);
    case 'msg':
      effects.push({ type: 'msg', text: step.text });
      return state;
    case 'sfx':
      effects.push({ type: 'sfx', name: step.name });
      return state;
    case 'fx':
      effects.push({ type: 'fx', name: step.name });
      return state;
    case 'end':
      effects.push({ type: 'ending', ending: step.ending });
      return { ...state, ending: step.ending };
    default:
      throw new Error(`unknown script step ${step.t}`);
  }
}

/** CONFIRM: advance past a 'say' step. */
export function confirmScript(state) {
  const p = state.pending;
  if (!p || p.kind !== 'say') return { state, effects: [] };
  return runScript({ ...state, pending: null }, p.rest, [{ type: 'sfx', name: 'confirm' }]);
}

/** CHOOSE: pick option `index` of a 'choices' step. */
export function chooseScript(state, index) {
  const p = state.pending;
  if (!p || p.kind !== 'choices') return { state, effects: [] };
  const option = p.step.options[index];
  if (!option) return { state, effects: [] };
  return runScript({ ...state, pending: null }, [...(option.steps ?? []), ...p.rest], [{ type: 'sfx', name: 'confirm' }]);
}

/** SHOP_BUY: attempt to buy option `index` in the open shop. */
export function shopBuy(state, index) {
  const p = state.pending;
  if (!p || p.kind !== 'shop') return { state, effects: [] };
  const shop = SHOPS[p.step.id];
  const choice = shop.choices[index];
  if (!choice) return { state, effects: [] };
  if (!canPay(state.hero, choice.cost)) {
    return { state, effects: [{ type: 'sfx', name: 'error' }, { type: 'msg', text: shortage(choice.cost) }] };
  }
  const hero = trade(state.hero, choice.cost, choice.gain);
  return { state: { ...state, hero }, effects: [{ type: 'sfx', name: 'buy' }, { type: 'msg', text: `${choice.label}` }] };
}

function shortage(cost) {
  if (cost.gold !== undefined) return '金币不够！';
  if (cost.exp !== undefined) return '经验不够！';
  return '钥匙不够！';
}

/** CLOSE: leave the shop and continue the script. */
export function closeShop(state) {
  const p = state.pending;
  if (!p || p.kind !== 'shop') return { state, effects: [] };
  return runScript({ ...state, pending: null }, p.rest, []);
}
