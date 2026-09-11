import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecast, describeDamage } from '../src/engine/combat.js';
import { MONSTERS, monsterStats } from '../src/data/monsters.js';

const hero = (hp, atk, def) => ({ hp, atk, def });

test('hero strikes first: green slime vs starting hero costs 50 HP', () => {
  const r = forecast(hero(1000, 10, 10), MONSTERS[40]);
  assert.equal(r.win, true);
  assert.equal(r.turns, 6); // ceil(50 / 9)
  assert.equal(r.perTurn, 10);
  assert.equal(r.damage, 50); // 5 monster attacks
});

test('cannot win when attack does not exceed monster defence', () => {
  const r = forecast(hero(1000, 10, 10), MONSTERS[45]); // 骷髅士兵 def 20
  assert.equal(r.win, false);
  assert.equal(r.damage, Infinity);
  const r2 = forecast(hero(1000, 20, 10), MONSTERS[45]);
  assert.equal(r2.win, false);
});

test('damage equal to current HP is a loss (strict)', () => {
  // 红头怪 70/15/2 : hero atk 12 -> 10 per hit -> 7 turns -> 6 monster hits of 5 = 30
  const r = forecast(hero(30, 12, 10), MONSTERS[41]);
  assert.equal(r.damage, 30);
  assert.equal(r.win, false);
  assert.equal(forecast(hero(31, 12, 10), MONSTERS[41]).win, true);
});

test('high defence means zero damage', () => {
  const r = forecast(hero(100, 50, 100), MONSTERS[40]);
  assert.equal(r.damage, 0);
  assert.equal(r.win, true);
});

test('吸血 monsters drain a fraction of current HP before the fight', () => {
  // 白衣武士 1300/300/150 drain 1/4
  const r = forecast(hero(2001, 400, 400), MONSTERS[50]);
  assert.equal(r.drain, 500); // floor(2001/4)
  assert.equal(r.turns, 6); // ceil(1300/250)
  assert.equal(r.perTurn, 0);
  assert.equal(r.damage, 500);
});

test('魔攻 monsters always add their fixed damage', () => {
  // 麻衣法师 250/120/70 fixed 100
  const r = forecast(hero(1000, 200, 200), MONSTERS[60]);
  assert.equal(r.turns, 2);
  assert.equal(r.perTurn, 0);
  assert.equal(r.fixed, 100);
  assert.equal(r.damage, 100);
});

test('monster tiers upgrade stats after the 16F and 21F bosses', () => {
  const base = monsterStats(62, 0);
  assert.equal(base.hp, 2500);
  const t1 = monsterStats(62, 1);
  assert.deepEqual([t1.hp, t1.atk, t1.def, t1.gold, t1.exp], [3333, 1200, 1133, 112, 100]);
  const t2 = monsterStats(62, 2);
  assert.deepEqual([t2.hp, t2.atk, t2.def], [4999, 2400, 2266]);
  // the 19F red king only changes at tier 2
  assert.equal(monsterStats(153, 1).hp, 20000);
  assert.equal(monsterStats(153, 2).hp, 30000);
  // monsters without tiers are unchanged
  assert.equal(monsterStats(40, 2).hp, 50);
  // specials are preserved through upgrades
  assert.deepEqual(monsterStats(57, 2).special, { drain: 1 / 3 });
});

test('describeDamage formats the forecast for the manual', () => {
  assert.equal(describeDamage(forecast(hero(1000, 10, 10), MONSTERS[45])), '???');
  assert.equal(describeDamage(forecast(hero(1000, 10, 10), MONSTERS[40])), '50');
});
