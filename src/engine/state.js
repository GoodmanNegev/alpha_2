import { FLOORS, START_FLOOR } from '../data/floors.js';
import { CASUAL_START_HERO, MODE_CLASSIC, normalizeMode } from '../data/mode.js';

export const SAVE_VERSION = 3;

export const START_HERO = Object.freeze({
  hp: 1000, atk: 10, def: 10, gold: 0, exp: 0, lv: 1,
});

export function createInitialState(now = 0, mode = MODE_CLASSIC) {
  const start = FLOORS[START_FLOOR].start;
  mode = normalizeMode(mode);
  const stats = mode === MODE_CLASSIC ? START_HERO : CASUAL_START_HERO;
  return {
    version: SAVE_VERSION,
    mode,
    hero: { ...stats, keys: { yellow: 0, blue: 0, red: 0 }, x: start[0], y: start[1], dir: 'up' },
    floor: START_FLOOR,
    maxFloor: START_FLOOR,
    visited: { [START_FLOOR]: true },
    maps: FLOORS.map((f) => f.map.map((row) => row.slice())),
    items: {},
    flags: {},
    tier: 0,
    stats: { steps: 0, kills: 0, playMs: 0, startedAt: now },
    pending: null,
    ending: null,
  };
}

export function tileAt(state, floor, x, y) {
  return state.maps[floor][y][x];
}

/** Returns a new state with one cell changed (structural sharing elsewhere). */
export function setTile(state, floor, x, y, tile) {
  if (state.maps[floor][y][x] === tile) return state;
  const maps = state.maps.slice();
  const rows = maps[floor].slice();
  const row = rows[y].slice();
  row[x] = tile;
  rows[y] = row;
  maps[floor] = rows;
  return { ...state, maps };
}

export function patchHero(state, patch) {
  return { ...state, hero: { ...state.hero, ...patch } };
}

/** Adds numeric deltas (and nested key deltas) to the hero. */
export function addToHero(state, delta) {
  const hero = { ...state.hero, keys: { ...state.hero.keys } };
  for (const [k, v] of Object.entries(delta)) {
    if (k === 'keys') for (const [c, n] of Object.entries(v)) hero.keys[c] += n;
    else hero[k] += v;
  }
  return { ...state, hero };
}

export function setFlag(state, name, value = true) {
  if (state.flags[name] === value) return state;
  return { ...state, flags: { ...state.flags, [name]: value } };
}

export function setItem(state, name, value = true) {
  if (state.items[name] === value) return state;
  return { ...state, items: { ...state.items, [name]: value } };
}

export function addStat(state, name, n = 1) {
  return { ...state, stats: { ...state.stats, [name]: state.stats[name] + n } };
}
