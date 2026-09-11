import { FLOORS } from '../data/floors.js';
import { T } from '../data/tiles.js';
import { patchHero } from './state.js';

/** Where a staircase at (x,y) on this floor leads. */
export function resolveExit(floorDef, x, y, tile) {
  const explicit = floorDef.exits[`${x},${y}`];
  if (explicit) return explicit;
  if (tile === T.STAIR_UP && FLOORS[floorDef.id + 1]) return { floor: floorDef.id + 1, arrive: 'up' };
  if (tile === T.STAIR_DOWN && FLOORS[floorDef.id - 1]) return { floor: floorDef.id - 1, arrive: 'down' };
  return null;
}

export function arrivalCell(floor, arrive) {
  const def = FLOORS[floor];
  const pos = arrive === 'up' ? def.arriveUp : def.arriveDown;
  return pos ?? def.arriveUp ?? def.arriveDown ?? def.start;
}

/**
 * Moves the hero to another floor.  Returns { state, effects, firstVisit }.
 */
export function goToFloor(state, floor, arrive, dir) {
  const [x, y] = arrivalCell(floor, arrive);
  const firstVisit = !state.visited[floor];
  const heroDir = dir ?? (arrive === 'up' ? 'up' : 'down');
  let s = patchHero(state, { x, y, dir: heroDir });
  s = {
    ...s,
    floor,
    maxFloor: Math.max(s.maxFloor, floor),
    visited: firstVisit ? { ...s.visited, [floor]: true } : s.visited,
  };
  const effects = [{ type: 'floor', from: state.floor, to: floor, arrive }];
  return { state: s, effects, firstVisit };
}

/** Floors reachable with the wind compass (main tower only, 0-20). */
export const FLY_MAX_FLOOR = 20;

export function canFlyFrom(state) {
  return Boolean(state.items.fly) && state.floor <= FLY_MAX_FLOOR && !state.pending;
}

export function canFlyTo(state, floor) {
  return canFlyFrom(state) && floor !== state.floor && floor <= FLY_MAX_FLOOR && Boolean(state.visited[floor]);
}

export function fly(state, floor) {
  if (!canFlyTo(state, floor)) {
    return { state, effects: [{ type: 'sfx', name: 'error' }] };
  }
  const arrive = floor > state.floor ? 'up' : 'down';
  const r = goToFloor(state, floor, arrive);
  return { state: r.state, effects: [{ type: 'sfx', name: 'fly' }, ...r.effects] };
}
