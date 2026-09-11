// Save games.  Maps are stored as a diff against the pristine floor data so a
// full save is only ~1 KB, which keeps localStorage happy and makes the
// export/import codes short.

import { FLOORS, FLOOR_COUNT } from '../data/floors.js';
import { MODE_CASUAL, MODE_CLASSIC, normalizeMode } from '../data/mode.js';
import { KNOWN_TILES } from '../data/tiles.js';
import { SAVE_VERSION, createInitialState } from './state.js';

export const SLOT_COUNT = 6; // slot 0 is the autosave
const KEY_PREFIX = 'mota24.save.';

export function serialize(state) {
  const diff = [];
  for (let f = 0; f < FLOOR_COUNT; f++) {
    const pristine = FLOORS[f].map;
    const rows = state.maps[f];
    if (rows === pristine) continue;
    for (let y = 0; y < 11; y++) {
      if (rows[y] === pristine[y]) continue;
      for (let x = 0; x < 11; x++) {
        if (rows[y][x] !== pristine[y][x]) diff.push([f, x, y, rows[y][x]]);
      }
    }
  }
  const { maps, pending, ...rest } = state;
  return JSON.stringify({ ...rest, version: SAVE_VERSION, diff });
}

const isInt = (v) => Number.isInteger(v);

function assertHero(hero) {
  const fields = ['hp', 'atk', 'def', 'gold', 'exp', 'lv', 'x', 'y'];
  if (!hero || typeof hero !== 'object') throw new Error('存档损坏：hero');
  for (const k of fields) if (!isInt(hero[k])) throw new Error(`存档损坏：hero.${k}`);
  if (hero.x < 0 || hero.x > 10 || hero.y < 0 || hero.y > 10) throw new Error('存档损坏：hero 坐标');
  if (!hero.keys || !['yellow', 'blue', 'red'].every((c) => isInt(hero.keys[c]))) throw new Error('存档损坏：hero.keys');
  if (!['up', 'down', 'left', 'right'].includes(hero.dir)) throw new Error('存档损坏：hero.dir');
}

export function deserialize(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('存档不是有效的 JSON');
  }
  if (!data || data.version !== SAVE_VERSION) throw new Error('存档版本不兼容');
  if (data.mode !== undefined && data.mode !== MODE_CLASSIC && data.mode !== MODE_CASUAL) throw new Error('存档损坏：mode');
  assertHero(data.hero);
  if (data.heroName !== undefined && (typeof data.heroName !== 'string' || [...data.heroName].length > 16)) throw new Error('存档损坏：勇者名称');
  if (data.adventurerId !== undefined && (typeof data.adventurerId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(data.adventurerId))) throw new Error('存档损坏：勇者编号');
  if (!isInt(data.floor) || data.floor < 0 || data.floor >= FLOOR_COUNT) throw new Error('存档损坏：floor');
  if (!Array.isArray(data.diff)) throw new Error('存档损坏：diff');
  if (!isInt(data.maxFloor) || data.maxFloor < 0 || data.maxFloor >= FLOOR_COUNT) throw new Error('存档损坏：maxFloor');
  if (!isInt(data.tier) || data.tier < 0 || data.tier > 2) throw new Error('存档损坏：tier');
  if (data.ending !== null && data.ending !== 'normal' && data.ending !== 'true') throw new Error('存档损坏：ending');
  const stats = data.stats ?? {};
  for (const k of ['steps', 'kills', 'playMs', 'startedAt']) {
    if (stats[k] !== undefined && !isInt(stats[k])) throw new Error(`存档损坏：stats.${k}`);
  }
  const base = createInitialState(0);
  const maps = base.maps;
  for (const entry of data.diff) {
    if (!Array.isArray(entry) || entry.length !== 4) throw new Error('存档损坏：diff 条目');
    const [f, x, y, tile] = entry;
    if (!isInt(f) || f < 0 || f >= FLOOR_COUNT || !isInt(x) || !isInt(y) || x < 0 || y < 0 || x > 10 || y > 10) {
      throw new Error('存档损坏：diff 坐标');
    }
    if (!KNOWN_TILES.has(tile)) throw new Error(`存档损坏：未知 tile ${tile}`);
    maps[f][y][x] = tile;
  }
  const { diff, ...rest } = data;
  return {
    ...base,
    ...rest,
    visited: { ...(data.visited ?? {}) },
    items: { ...(data.items ?? {}) },
    flags: { ...(data.flags ?? {}) },
    stats: { ...base.stats, ...stats },
    tier: data.tier,
    mode: normalizeMode(data.mode),
    maps,
    pending: null,
  };
}

/** Small summary shown in the save/load menu. */
export function summarize(state, savedAt) {
  return {
    savedAt,
    floor: state.floor,
    floorName: FLOORS[state.floor].name,
    hp: state.hero.hp,
    atk: state.hero.atk,
    def: state.hero.def,
    lv: state.hero.lv,
    playMs: state.stats.playMs,
    ending: state.ending,
    mode: normalizeMode(state.mode),
  };
}

export function createSaveStore(storage) {
  const key = (slot) => `${KEY_PREFIX}${slot}`;
  return {
    list() {
      const out = [];
      for (let i = 0; i < SLOT_COUNT; i++) {
        const raw = storage.getItem(key(i));
        if (!raw) { out.push(null); continue; }
        try {
          const { meta } = JSON.parse(raw);
          out.push(meta);
        } catch {
          out.push(null);
        }
      }
      return out;
    },
    save(slot, state, { now = Date.now() } = {}) {
      const meta = summarize(state, now);
      storage.setItem(key(slot), JSON.stringify({ meta, data: serialize(state) }));
      return meta;
    },
    load(slot) {
      const raw = storage.getItem(key(slot));
      if (!raw) return null;
      const { data } = JSON.parse(raw);
      return deserialize(data);
    },
    remove(slot) {
      storage.removeItem(key(slot));
    },
  };
}
