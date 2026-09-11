// Top-level dispatcher: (state, action) -> { state, effects }.
// Actions:
//   MOVE {dir} · CONFIRM · CHOOSE {index} · SHOP_BUY {index} · CLOSE ·
//   FLY {floor} · TICK {ms}

import { createInitialState } from './state.js';
import { move } from './move.js';
import { chooseScript, closeShop, confirmScript, runScript, shopBuy } from './script.js';
import { fly } from './floor.js';
import { introScript } from '../data/story.js';
import { MODE_CLASSIC } from '../data/mode.js';

export function newGame(now = Date.now(), mode = MODE_CLASSIC) {
  const state = createInitialState(now, mode);
  return runScript(state, introScript(), [{ type: 'msg', text: '按方向键移动，撞向物品拾取、撞向怪物战斗。' }]);
}

export function dispatch(state, action) {
  switch (action.type) {
    case 'MOVE':
      return move(state, action.dir);
    case 'CONFIRM':
      return confirmScript(state);
    case 'CHOOSE':
      return chooseScript(state, action.index);
    case 'SHOP_BUY':
      return shopBuy(state, action.index);
    case 'CLOSE':
      return closeShop(state);
    case 'FLY':
      return fly(state, action.floor);
    case 'TICK':
      return { state: { ...state, stats: { ...state.stats, playMs: state.stats.playMs + action.ms } }, effects: [] };
    default:
      throw new Error(`unknown action ${action.type}`);
  }
}
