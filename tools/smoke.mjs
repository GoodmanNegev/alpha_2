// Browser smoke test: loads the game, checks for console errors, plays the
// prologue, moves around, opens menus and takes screenshots.
//   node tools/smoke.mjs [baseUrl] [outDir]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const base = process.argv[2] ?? 'http://localhost:8123/';
const out = process.argv[3] ?? '/tmp/mota-shots';
mkdirSync(out, { recursive: true });

const errors = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.mota && window.mota.state);
await page.screenshot({ path: join(out, '01-prologue.png') });

// press through the prologue
for (let i = 0; i < 40; i++) {
  const pending = await page.evaluate(() => Boolean(window.mota.state.pending));
  if (!pending) break;
  await page.keyboard.press('Enter');
  await page.waitForTimeout(40);
}
let s = await page.evaluate(() => ({ keys: window.mota.state.hero.keys, floor: window.mota.state.floor, x: window.mota.state.hero.x, y: window.mota.state.hero.y }));
console.log('after prologue', JSON.stringify(s));
await page.screenshot({ path: join(out, '02-floor0.png') });

// walk up through the yellow door to floor 1
for (let i = 0; i < 12; i++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(60); }
s = await page.evaluate(() => ({ floor: window.mota.state.floor, x: window.mota.state.hero.x, y: window.mota.state.hero.y, hp: window.mota.state.hero.hp }));
console.log('after walking', JSON.stringify(s));
await page.screenshot({ path: join(out, '03-floor1.png') });

// pick up the red key to the left, open the red door above, fight the first monster
await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(80);
await page.keyboard.press('ArrowRight'); await page.waitForTimeout(80);
await page.keyboard.press('ArrowUp'); await page.waitForTimeout(80); // open door
await page.keyboard.press('ArrowUp'); await page.waitForTimeout(80); // enter
await page.keyboard.press('ArrowUp'); await page.waitForTimeout(80);
s = await page.evaluate(() => ({ floor: window.mota.state.floor, x: window.mota.state.hero.x, y: window.mota.state.hero.y, keys: window.mota.state.hero.keys, hp: window.mota.state.hero.hp }));
console.log('after door', JSON.stringify(s));

// click-to-move to the right end of the corridor, then fight the slime at (3,0) via keys
await page.evaluate(() => window.mota.clickCell(10, 7));
await page.waitForTimeout(1200);
s = await page.evaluate(() => ({ x: window.mota.state.hero.x, y: window.mota.state.hero.y }));
console.log('after click move', JSON.stringify(s));

// battle: give the hero a manual & fight the slime at (3,0) from (2,0)... simpler: teleport state via debugging hook
await page.evaluate(() => { const g = window.mota; g.setState({ ...g.state, hero: { ...g.state.hero, x: 2, y: 0, dir: 'right' }, items: { ...g.state.items, manual: true } }); });
await page.screenshot({ path: join(out, '04-damage-display.png') });
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(300);
await page.screenshot({ path: join(out, '05-battle.png') });
await page.waitForTimeout(1800);
s = await page.evaluate(() => ({ x: window.mota.state.hero.x, hp: window.mota.state.hero.hp, gold: window.mota.state.hero.gold, kills: window.mota.state.stats.kills }));
console.log('after battle', JSON.stringify(s));

// menus
await page.keyboard.press('x'); await page.waitForTimeout(200);
await page.screenshot({ path: join(out, '06-manual.png') });
await page.keyboard.press('Escape');
await page.keyboard.press('h'); await page.waitForTimeout(200);
await page.screenshot({ path: join(out, '07-help.png') });
await page.keyboard.press('Escape');
await page.keyboard.press('s'); await page.waitForTimeout(200);
await page.screenshot({ path: join(out, '08-save.png') });
await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
const slots = await page.evaluate(() => window.mota.saves.list().map((m) => (m ? m.floor : null)));
console.log('slots', JSON.stringify(slots));

// shop on 3F
await page.evaluate(() => { const g = window.mota; g.setState({ ...g.state, floor: 3, visited: { ...g.state.visited, 3: true }, hero: { ...g.state.hero, x: 5, y: 1, dir: 'up', gold: 60 } }); });
await page.keyboard.press('ArrowUp'); await page.waitForTimeout(200);
await page.screenshot({ path: join(out, '09-shop.png') });
await page.keyboard.press('Enter'); await page.waitForTimeout(100);
s = await page.evaluate(() => ({ hp: window.mota.state.hero.hp, gold: window.mota.state.hero.gold, pending: window.mota.state.pending?.kind }));
console.log('after buy', JSON.stringify(s));
await page.keyboard.press('Escape'); await page.waitForTimeout(100);

// hidden floor boss art
await page.evaluate(() => { const g = window.mota; g.setState({ ...g.state, floor: 26, visited: { ...g.state.visited, 26: true }, hero: { ...g.state.hero, x: 5, y: 10, dir: 'up' } }); });
await page.waitForTimeout(100);
await page.screenshot({ path: join(out, '10-abyss.png') });

// leaderboard (only when served by mota-server)
const hasApi = await page.evaluate(() => window.mota.api);
console.log('api available:', hasApi);
if (hasApi) {
  // Synthetic local smoke run; keep this script away from public servers.
  await page.evaluate(() => { const g = window.mota; g.setState({ ...g.state, heroName: '冒烟测试', maxFloor: 26, ending: 'normal', stats: { ...g.state.stats, playMs: 95 * 60 * 1000, steps: 4321, kills: 99 } }); });
  await page.evaluate(() => import('./src/ui/menus.js').then((m) => m.showEnding(window.mota, 'normal')));
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(out, '12-ending.png') });
  await page.keyboard.press('Escape');
  await page.click('[data-cmd="board"]');
  await page.waitForTimeout(800);
  const rows = await page.locator('.ranking-row').count();
  console.log('board rows:', rows);
  await page.screenshot({ path: join(out, '13-leaderboard.png') });
  await page.keyboard.press('Escape');
}

// mobile layout
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(200);
await page.screenshot({ path: join(out, '11-mobile.png'), fullPage: false });

await browser.close();
console.log('console errors:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
