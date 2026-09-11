// Adventure modes. Classic is the original 魔塔 resource puzzle; casual keeps
// the same maps and combat rules but loosens the late-game death spiral
// (empty farm, empty wallet, attack stuck below defence).

export const MODE_CLASSIC = 'classic';
export const MODE_CASUAL = 'casual';

export const MODES = Object.freeze({
  [MODE_CLASSIC]: Object.freeze({
    id: MODE_CLASSIC,
    name: '经典模式',
    short: '经典',
    detail: '原版数值。资源有限，打错可能卡住。',
  }),
  [MODE_CASUAL]: Object.freeze({
    id: MODE_CASUAL,
    name: '休闲模式',
    short: '休闲',
    detail: '收益翻倍，钥匙更宽裕，魔王死后怪物不强化。',
  }),
});

export const CASUAL_START_HERO = Object.freeze({
  hp: 1500, atk: 15, def: 15, gold: 0, exp: 0, lv: 1,
});

export const CASUAL_INTRO_KEYS = Object.freeze({ yellow: 1, blue: 2, red: 2 });
export const CASUAL_REWARD_MULT = 2;

export function normalizeMode(mode) {
  return mode === MODE_CASUAL ? MODE_CASUAL : MODE_CLASSIC;
}

export function isCasual(stateOrMode) {
  const mode = stateOrMode && typeof stateOrMode === 'object' ? stateOrMode.mode : stateOrMode;
  return normalizeMode(mode) === MODE_CASUAL;
}

export function modeInfo(mode) {
  return MODES[normalizeMode(mode)];
}

/** Monster upgrade tier used in combat / the handbook. Casual ignores upgrades. */
export function combatTier(state) {
  return isCasual(state) ? 0 : (state.tier ?? 0);
}

export function killReward(monster, mode) {
  const n = isCasual(mode) ? CASUAL_REWARD_MULT : 1;
  return { gold: monster.gold * n, exp: monster.exp * n };
}
