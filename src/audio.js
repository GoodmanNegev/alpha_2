// Synthesised sound: no audio files, just oscillators.  Everything is created
// lazily on the first user gesture (browser autoplay policy).

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);

// A minor, 120 BPM, eighth notes.  Lead / bass share the same grid.
const LEAD = [
  69, 72, 76, 72, 69, 72, 76, 79, 65, 69, 72, 69, 64, 67, 71, 67,
  69, 72, 76, 81, 79, 76, 72, 76, 74, 71, 67, 71, 76, 0, 64, 0,
  67, 71, 74, 71, 67, 71, 74, 77, 65, 69, 72, 77, 76, 72, 69, 72,
  62, 65, 69, 74, 72, 69, 65, 69, 64, 68, 71, 76, 81, 0, 76, 0,
];
const BASS = [
  45, 0, 45, 0, 45, 0, 45, 0, 41, 0, 41, 0, 40, 0, 40, 0,
  45, 0, 45, 0, 45, 0, 45, 0, 43, 0, 43, 0, 40, 0, 40, 0,
  43, 0, 43, 0, 43, 0, 43, 0, 41, 0, 41, 0, 45, 0, 45, 0,
  38, 0, 38, 0, 41, 0, 41, 0, 40, 0, 40, 0, 45, 0, 45, 0,
];
const STEP_SEC = 0.25;

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxOn = true;
    this.bgmOn = true;
    this.bgmTimer = null;
    this.nextStep = 0;
    this.stepIndex = 0;
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = this.bgmOn ? 0.18 : 0;
    this.bgmGain.connect(this.master);
    this.startBgm();
  }

  setSfx(on) { this.sfxOn = on; }

  setBgm(on) {
    this.bgmOn = on;
    if (this.bgmGain) this.bgmGain.gain.setTargetAtTime(on ? 0.18 : 0, this.ctx.currentTime, 0.05);
  }

  tone({ freq, type = 'square', dur = 0.1, vol = 0.2, at = 0, slide = 0, gain = null }) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(gain ?? this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise({ dur = 0.08, vol = 0.15, at = 0 }) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(this.master);
    src.start(ctx.currentTime + at);
  }

  /** @param {string} name */
  play(name) {
    if (!this.ctx || !this.sfxOn) return;
    switch (name) {
      case 'step': this.tone({ freq: 180, type: 'triangle', dur: 0.03, vol: 0.05 }); break;
      case 'item': this.tone({ freq: 880, dur: 0.06, vol: 0.12 }); this.tone({ freq: 1320, dur: 0.1, vol: 0.12, at: 0.06 }); break;
      case 'treasure':
        [660, 880, 1100, 1320].forEach((f, i) => this.tone({ freq: f, dur: 0.12, vol: 0.12, at: i * 0.08 }));
        break;
      case 'door': this.noise({ dur: 0.06, vol: 0.12 }); this.tone({ freq: 220, type: 'triangle', dur: 0.12, vol: 0.1, at: 0.03, slide: 80 }); break;
      case 'error': this.tone({ freq: 160, type: 'sawtooth', dur: 0.15, vol: 0.12, slide: -60 }); break;
      case 'talk': this.tone({ freq: 520, type: 'triangle', dur: 0.05, vol: 0.08 }); break;
      case 'confirm': this.tone({ freq: 700, type: 'triangle', dur: 0.04, vol: 0.06 }); break;
      case 'buy': this.tone({ freq: 988, dur: 0.06, vol: 0.1 }); this.tone({ freq: 1319, dur: 0.1, vol: 0.1, at: 0.07 }); break;
      case 'hit': this.noise({ dur: 0.05, vol: 0.18 }); this.tone({ freq: 140, type: 'square', dur: 0.06, vol: 0.1, slide: -60 }); break;
      case 'hurt': this.tone({ freq: 240, type: 'sawtooth', dur: 0.08, vol: 0.1, slide: -120 }); break;
      case 'win': [523, 659, 784].forEach((f, i) => this.tone({ freq: f, dur: 0.1, vol: 0.12, at: i * 0.07 })); break;
      case 'stairs': [330, 440, 550, 660].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.1, vol: 0.1, at: i * 0.05 })); break;
      case 'fly': this.tone({ freq: 300, type: 'sine', dur: 0.5, vol: 0.15, slide: 900 }); break;
      case 'secret': [784, 988, 1175, 1568].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.15, vol: 0.12, at: i * 0.1 })); break;
      case 'levelup': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ freq: f, dur: 0.15, vol: 0.12, at: i * 0.08 })); break;
      case 'victory':
        [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, dur: 0.18, vol: 0.14, at: i * 0.15 }));
        break;
      default: break;
    }
  }

  startBgm() {
    if (!this.ctx || this.bgmTimer) return;
    this.nextStep = this.ctx.currentTime + 0.1;
    this.stepIndex = 0;
    const schedule = () => {
      const horizon = this.ctx.currentTime + 0.6;
      while (this.nextStep < horizon) {
        const i = this.stepIndex % LEAD.length;
        const at = this.nextStep - this.ctx.currentTime;
        if (LEAD[i]) this.tone({ freq: NOTE(LEAD[i]), type: 'square', dur: STEP_SEC * 0.9, vol: 0.5, at, gain: this.bgmGain });
        if (BASS[i]) this.tone({ freq: NOTE(BASS[i]), type: 'triangle', dur: STEP_SEC * 1.8, vol: 0.7, at, gain: this.bgmGain });
        this.nextStep += STEP_SEC;
        this.stepIndex++;
      }
    };
    schedule();
    this.bgmTimer = setInterval(schedule, 250);
  }
}
