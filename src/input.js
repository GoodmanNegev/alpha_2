// Keyboard, on-screen d-pad and click-to-move input.

const DIR_KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

const SHORTCUTS = {
  b: 'bag', B: 'bag', c: 'profile', C: 'profile',
  x: 'manual', X: 'manual', f: 'fly', F: 'fly', s: 'save', S: 'save', l: 'load', L: 'load',
  h: 'help', H: 'help', m: 'mute', M: 'mute', o: 'settings', O: 'settings', r: 'restart', R: 'restart',
};

export class Input {
  constructor(game, canvas, dpad) {
    this.game = game;
    this.canvas = canvas;
    this.held = null;
    this.nextMoveAt = 0;
    this.bind(dpad);
    this.timer = setInterval(() => this.tick(), 16);
  }

  bind(dpad) {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => { this.held = null; });
    this.canvas.addEventListener('click', (e) => this.onCanvasClick(e));
    if (dpad) {
      for (const btn of dpad.querySelectorAll('[data-dir]')) {
        const dir = btn.dataset.dir;
        btn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.game.audio.unlock(); this.press(dir); });
        btn.addEventListener('pointerup', () => this.release(dir));
        btn.addEventListener('pointerleave', () => this.release(dir));
        btn.addEventListener('pointercancel', () => this.release(dir));
      }
    }
  }

  press(dir) {
    if (this.held === dir) return;
    this.held = dir;
    this.game.stopAutoMove();
    this.game.move(dir);
    this.nextMoveAt = performance.now() + 170;
  }

  release(dir) {
    if (this.held === dir) this.held = null;
  }

  tick() {
    if (!this.held) return;
    if (this.game.overlay.open) { this.held = null; return; }
    const now = performance.now();
    if (now >= this.nextMoveAt) {
      this.game.move(this.held);
      this.nextMoveAt = now + this.game.settings.moveMs;
    }
  }

  onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target?.matches?.('input, textarea, [contenteditable="true"]') && !['Escape', 'Tab'].includes(e.key)) return;
    this.game.audio.unlock();
    if (this.game.overlay.open) {
      if (e.repeat) { e.preventDefault(); return; }
      if (this.game.overlay.handleKey(e)) e.preventDefault();
      return;
    }
    const dir = DIR_KEYS[e.key];
    if (dir) {
      e.preventDefault();
      if (!e.repeat) this.press(dir);
      return;
    }
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      this.game.command('confirm');
      return;
    }
    if (e.key === 'Escape') { this.game.stopAutoMove(); return; }
    const cmd = SHORTCUTS[e.key];
    if (cmd && !e.repeat) { e.preventDefault(); this.game.command(cmd); }
  }

  onKeyUp(e) {
    const dir = DIR_KEYS[e.key];
    if (dir) this.release(dir);
  }

  onCanvasClick(e) {
    this.game.audio.unlock();
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * 11);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * 11);
    if (x < 0 || y < 0 || x > 10 || y > 10) return;
    this.game.clickCell(x, y);
  }
}
