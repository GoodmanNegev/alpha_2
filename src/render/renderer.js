// Draws the 11x11 map, the hero and the on-map damage numbers.

import { T, isMonster } from '../data/tiles.js';
import { forecast, describeDamage, dangerLevel } from '../engine/combat.js';
import { monsterStats } from '../data/monsters.js';
import { SpriteAtlas, bigPart } from './sprites.js';
import { TerrainAtlas, TILE_PX, isTerrain } from './terrain.js';

const DANGER_COLORS = {
  impossible: '#ff4b4b',
  fatal: '#ff4b4b',
  heavy: '#ffb347',
  light: '#f4f1ea',
  free: '#7dff8a',
};

const HERO_SPRITE = { up: 'heroUp', down: 'heroDown', left: 'heroLeft', right: 'heroRight' };

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{sprites?: SpriteAtlas, terrain?: TerrainAtlas}} [atlases]
   */
  constructor(canvas, atlases = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.sprites = atlases.sprites ?? new SpriteAtlas();
    this.terrain = atlases.terrain ?? new TerrainAtlas();
    this.flash = null; // { x, y, until }
  }

  /**
   * @param {object} state game state
   * @param {number} frame animation frame (0/1)
   * @param {{showDamage?: boolean, now?: number, heroOffset?: {x:number,y:number}}} opts
   */
  draw(state, frame, opts = {}) {
    const { ctx } = this;
    const rows = state.maps[state.floor];
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // pass 1: terrain (objects sit on plain floor)
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        const tile = rows[y][x];
        const variant = ((x * 17 + y * 31 + x * y * 7) >>> 1) % 4;
        ctx.drawImage(this.terrain.get(isTerrain(tile) ? tile : T.FLOOR, frame, variant), x * TILE_PX, y * TILE_PX);
        if (tile !== T.WALL && tile !== T.SKY && tile !== T.LAVA) {
          if (rows[y - 1]?.[x] === T.WALL) {
            ctx.fillStyle = '#111d2966';
            ctx.fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, 4);
          }
          if (rows[y][x - 1] === T.WALL) {
            ctx.fillStyle = '#111d2933';
            ctx.fillRect(x * TILE_PX, y * TILE_PX, 3, TILE_PX);
          }
        }
      }
    }

    // pass 2: items, npcs, monsters and the 3x3 bosses
    const bigDrawn = new Set();
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        const tile = rows[y][x];
        if (isTerrain(tile)) continue;
        const part = bigPart(tile);
        if (part) {
          const ox = x - part.dx;
          const oy = y - part.dy;
          const key = `${ox},${oy}`;
          if (!bigDrawn.has(key)) {
            bigDrawn.add(key);
            ctx.drawImage(this.sprites.big(part.core), ox * TILE_PX, oy * TILE_PX + (frame ? 2 : 0));
          }
          continue;
        }
        const sprite = this.sprites.tile(tile);
        if (sprite) {
          this.drawShadow(x * TILE_PX, y * TILE_PX);
          ctx.drawImage(sprite, x * TILE_PX, y * TILE_PX + (isMonster(tile) && frame ? 1 : 0));
        }
      }
    }

    if (opts.showDamage) this.drawDamage(state, rows);

    const hero = state.hero;
    const off = opts.heroOffset ?? { x: 0, y: 0 };
    this.drawShadow(hero.x * TILE_PX + off.x, hero.y * TILE_PX + off.y);
    // A small gold marker distinguishes the player in crowded corridors.
    ctx.fillStyle = '#efd497';
    ctx.fillRect(hero.x * TILE_PX + off.x + 14, hero.y * TILE_PX + off.y - 3, 4, 2);
    ctx.drawImage(this.sprites.named(HERO_SPRITE[hero.dir]), hero.x * TILE_PX + off.x, hero.y * TILE_PX + off.y);

    if (this.flash && opts.now && opts.now < this.flash.until) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(this.flash.x * TILE_PX, this.flash.y * TILE_PX, TILE_PX, TILE_PX);
    }
  }

  drawShadow(x, y) {
    this.ctx.fillStyle = '#0c17256b';
    this.ctx.fillRect(x + 6, y + 26, 20, 4);
    this.ctx.fillRect(x + 10, y + 30, 12, 2);
  }

  drawDamage(state, rows) {
    const { ctx } = this;
    ctx.font = 'bold 10px monospace';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    const cache = new Map();
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        const tile = rows[y][x];
        if (!isMonster(tile)) continue;
        let info = cache.get(tile);
        if (!info) {
          const r = forecast(state.hero, monsterStats(tile, state.tier));
          info = { text: describeDamage(r), color: DANGER_COLORS[dangerLevel(r, state.hero.hp)] };
          cache.set(tile, info);
        }
        const px = x * TILE_PX + 2;
        const py = (y + 1) * TILE_PX - 1;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.strokeText(info.text, px, py);
        ctx.fillStyle = info.color;
        ctx.fillText(info.text, px, py);
      }
    }
  }

  highlight(x, y, now, ms = 220) {
    this.flash = { x, y, until: now + ms };
  }
}
