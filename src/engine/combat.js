// Deterministic 魔塔 combat.  The hero always strikes first; each side hits
// for (attack - defence), never less than zero.

/**
 * @param {{hp:number, atk:number, def:number}} hero
 * @param {{hp:number, atk:number, def:number, special?:{drain?:number, fixed?:number}}} monster
 */
export function forecast(hero, monster) {
  const drain = monster.special?.drain ? Math.floor(hero.hp * monster.special.drain) : 0;
  const fixed = monster.special?.fixed ?? 0;
  const heroHit = hero.atk - monster.def;
  if (heroHit <= 0) {
    return { win: false, damage: Infinity, turns: Infinity, perTurn: 0, drain, fixed };
  }
  const turns = Math.ceil(monster.hp / heroHit);
  const perTurn = Math.max(0, monster.atk - hero.def);
  const damage = drain + (turns - 1) * perTurn + fixed;
  return { win: damage < hero.hp, damage, turns, perTurn, drain, fixed };
}

export function describeDamage(result) {
  return Number.isFinite(result.damage) ? String(result.damage) : '???';
}

/** Danger colour bucket for the on-map damage display. */
export function dangerLevel(result, heroHp) {
  if (!Number.isFinite(result.damage)) return 'impossible';
  if (result.damage === 0) return 'free';
  if (result.damage >= heroHp) return 'fatal';
  if (result.damage * 3 >= heroHp) return 'heavy';
  return 'light';
}
