// Moving the hero one cell: the heart of the game loop.  Every function here
// is pure and returns { state, effects }.

import {
  T, isMonster, isDoor, isNpc, isItem, isSolid, isWalkable, isStair, DRAGON_CORE, SHADOW_CORE,
} from '../data/tiles.js';
import { FLOORS } from '../data/floors.js';
import { ITEMS } from '../data/items.js';
import { MONSTERS, monsterStats } from '../data/monsters.js';
import { forecast } from './combat.js';
import { addStat, addToHero, patchHero, setItem, setTile, tileAt } from './state.js';
import { goToFloor, resolveExit } from './floor.js';
import { runScript } from './script.js';
import { afterBattleScript, firstArriveScript, npcScript, portalScript, triggerScript } from '../data/story.js';

export const DIRS = Object.freeze({
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
});

const DOOR_KEY = { [T.YELLOW_DOOR]: 'yellow', [T.BLUE_DOOR]: 'blue', [T.RED_DOOR]: 'red' };
const DOOR_NAME = { yellow: '黄', blue: '蓝', red: '红' };

export function move(state, dir) {
  if (state.pending) return { state, effects: [] };
  const [dx, dy] = DIRS[dir];
  let s = state.hero.dir === dir ? state : patchHero(state, { dir });
  const nx = s.hero.x + dx;
  const ny = s.hero.y + dy;
  if (nx < 0 || ny < 0 || nx > 10 || ny > 10) return { state: s, effects: [] };
  const tile = tileAt(s, s.floor, nx, ny);

  if (isWalkable(tile)) return enterCell(s, nx, ny, tile);
  if (isSolid(tile) || tile === T.SHOP_LEFT || tile === T.SHOP_RIGHT) return { state: s, effects: [] };
  if (isDoor(tile)) return openDoor(s, nx, ny, tile);
  if (tile === T.GATE) return openGate(s, nx, ny);
  if (tile === T.IRON_DOOR) return { state: s, effects: [{ type: 'msg', text: '这扇铁门被锁住了。' }] };
  if (isItem(tile)) return pickUp(s, nx, ny, tile);
  if (isMonster(tile)) return fight(s, nx, ny, tile);
  if (isNpc(tile) || tile === T.SHOP) return talk(s, nx, ny, tile);
  if (tile === T.PORTAL) return runScript(s, portalScript(s));
  return { state: s, effects: [] };
}

function enterCell(state, x, y, tile) {
  let s = addStat(patchHero(state, { x, y }), 'steps');
  const effects = [{ type: 'step' }];
  if (isStair(tile)) return useStairs(s, x, y, tile, effects);
  if (tile === T.TRIGGER_16F || tile === T.TRIGGER_19F) {
    s = setTile(s, s.floor, x, y, T.FLOOR);
    return runScript(s, triggerScript(s, tile), effects);
  }
  return { state: s, effects };
}

function useStairs(state, x, y, tile, effects) {
  const exit = resolveExit(FLOORS[state.floor], x, y, tile);
  if (!exit) return { state, effects };
  const r = goToFloor(state, exit.floor, exit.arrive);
  effects.push({ type: 'sfx', name: 'stairs' }, ...r.effects);
  if (r.firstVisit) {
    const script = firstArriveScript(exit.floor);
    if (script) return runScript(r.state, script, effects);
  }
  return { state: r.state, effects };
}

function openDoor(state, x, y, tile) {
  const color = DOOR_KEY[tile];
  if (state.hero.keys[color] <= 0) {
    return { state, effects: [{ type: 'sfx', name: 'error' }, { type: 'msg', text: `需要一把${DOOR_NAME[color]}钥匙。` }] };
  }
  let s = addToHero(state, { keys: { [color]: -1 } });
  s = setTile(s, s.floor, x, y, T.FLOOR);
  return { state: s, effects: [{ type: 'sfx', name: 'door' }, { type: 'door', x, y, tile }] };
}

function openGate(state, x, y) {
  const s = setTile(state, state.floor, x, y, T.FLOOR);
  return { state: s, effects: [{ type: 'sfx', name: 'door' }, { type: 'door', x, y, tile: T.GATE }] };
}

function pickUp(state, x, y, tile) {
  const item = ITEMS[tile];
  let s = setTile(state, state.floor, x, y, T.FLOOR);
  s = addStat(patchHero(s, { x, y }), 'steps');
  if (item.flag) s = setItem(s, item.flag, true);
  else s = patchHero(s, item.apply(s.hero));
  const effects = [{ type: 'sfx', name: item.flag ? 'treasure' : 'item' }, { type: 'msg', text: item.msg }];
  if (tile === T.SMALL_FEATHER || tile === T.BIG_FEATHER || tile === T.HOLY_WATER) effects.push({ type: 'fx', name: 'levelup' });
  return { state: s, effects };
}

function fight(state, x, y, tile) {
  const monster = monsterStats(tile, state.tier);
  const result = forecast(state.hero, monster);
  if (!result.win) {
    return {
      state,
      effects: [{ type: 'sfx', name: 'error' }, { type: 'msg', text: `打不过${monster.name}！` }],
    };
  }
  let s = addToHero(state, { hp: -result.damage, gold: monster.gold, exp: monster.exp });
  s = setTile(s, s.floor, x, y, T.FLOOR);
  s = addStat(addStat(patchHero(s, { x, y }), 'steps'), 'kills');
  const effects = [
    { type: 'battle', monsterId: tile, monster, ...result, heroBefore: state.hero, heroAfter: s.hero },
    { type: 'msg', text: `打败了${monster.name}，获得 ${monster.gold} 金币 ${monster.exp} 经验` },
  ];
  const script = afterBattleScript(s, tile, x, y);
  if (script) return runScript(s, script, effects);
  return { state: s, effects };
}

function talk(state, x, y, tile) {
  const script = npcScript(state, tile, x, y);
  return runScript(state, script, [{ type: 'sfx', name: 'talk' }]);
}

/** Damage forecast for every monster on the current floor (for the manual / map display). */
export function floorMonsters(state) {
  const seen = new Map();
  const rows = state.maps[state.floor];
  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < 11; x++) {
      const id = rows[y][x];
      if (!isMonster(id)) continue;
      if (!seen.has(id)) {
        const monster = monsterStats(id, state.tier);
        seen.set(id, { id, monster, result: forecast(state.hero, monster), count: 0 });
      }
      seen.get(id).count++;
    }
  }
  return [...seen.values()];
}

export { MONSTERS, DRAGON_CORE, SHADOW_CORE };
