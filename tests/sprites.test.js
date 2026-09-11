import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, PALETTES } from '../src/render/shapes.js';
import { DRAGON, SHADOW, BIG_PALETTES } from '../src/render/bigShapes.js';
import { allCombos, rasterise, spriteFor } from '../src/render/sprites.js';
import { FLOORS } from '../src/data/floors.js';
import { isItem, isMonster, isNpc, T } from '../src/data/tiles.js';

test('every 16x16 shape is well-formed', () => {
  for (const [name, rows] of Object.entries(SHAPES)) {
    assert.equal(rows.length, 16, `${name} must have 16 rows`);
    rows.forEach((r, i) => assert.equal(r.length, 16, `${name} row ${i} must be 16 wide (got ${r.length})`));
  }
});

test('the big bosses are 48x48', () => {
  for (const [name, rows] of [['dragon', DRAGON], ['shadow', SHADOW]]) {
    assert.equal(rows.length, 48, name);
    rows.forEach((r, i) => assert.equal(r.length, 48, `${name} row ${i}`));
    const letters = new Set(rows.join('').replace(/\./g, ''));
    const pal = name === 'dragon' ? BIG_PALETTES.dragon : BIG_PALETTES.blood;
    for (const ch of letters) assert.ok(pal[ch], `${name} palette lacks '${ch}'`);
  }
});

test('every shape/palette combination the game uses has all its colours', () => {
  for (const [shape, palette, who] of allCombos()) {
    const rows = SHAPES[shape];
    const pal = PALETTES[palette];
    assert.ok(rows, `shape ${shape} (${who ?? ''})`);
    assert.ok(pal, `palette ${palette} (${who ?? ''})`);
    const letters = new Set(rows.join('').replace(/\./g, ''));
    for (const ch of letters) assert.ok(pal[ch], `${shape}/${palette} lacks colour '${ch}'`);
  }
});

test('every item, npc and monster tile on the maps has a sprite', () => {
  for (const fl of FLOORS) {
    for (const row of fl.map) {
      for (const tile of row) {
        if ((isItem(tile) || isNpc(tile) || tile === T.SHOP || isMonster(tile)) && tile !== 188 && tile !== 198) {
          assert.ok(spriteFor(tile), `tile ${tile} on floor ${fl.id} has no sprite`);
        }
      }
    }
  }
});

test('rasterise paints one rect per opaque pixel', () => {
  const rects = [];
  const makeCanvas = (w, h) => ({ width: w, height: h, getContext: () => ({ set fillStyle(v) { this._c = v; }, fillRect: (x, y, w2, h2) => rects.push([x, y, w2, h2]) }) });
  rasterise(['.k', 'k.'], { k: '#000' }, 2, makeCanvas);
  assert.deepEqual(rects, [[2, 0, 2, 2], [0, 2, 2, 2]]);
});
