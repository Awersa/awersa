/**
 * Procedural sound effects (Web Audio), used when no sound file is bundled for a key.
 * Everything is generated from oscillators and noise, so there are no files and no licensing questions.
 * Each recipe takes (ctx, out, t, vol) so it can also be rendered offline for testing.
 */

type Recipe = (ctx: BaseAudioContext, out: AudioNode, t: number, vol: number) => void;

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.0), ctx.sampleRate);
    const d = b.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x3fffffff) - 1;
    }
    noiseCache.set(ctx, b);
  }
  return b;
}

/** Gain envelope: quick attack, exponential decay. */
function env(ctx: BaseAudioContext, out: AudioNode, t: number, peak: number, attack: number, dur: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(out);
  return g;
}

function tone(
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
  o: { type: OscillatorType; f0: number; f1?: number; glide?: number; dur: number; gain: number; attack?: number; delay?: number },
): void {
  const start = t + (o.delay ?? 0);
  const osc = ctx.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.f0, start);
  if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), start + (o.glide ?? o.dur));
  osc.connect(env(ctx, out, start, o.gain, o.attack ?? 0.005, o.dur));
  osc.start(start);
  osc.stop(start + o.dur + 0.02);
}

function noise(
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
  o: { filter: BiquadFilterType; f0: number; f1?: number; q?: number; dur: number; gain: number; attack?: number; delay?: number },
): void {
  const start = t + (o.delay ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = o.filter;
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f0, start);
  if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), start + o.dur);
  src.connect(f);
  f.connect(env(ctx, out, start, o.gain, o.attack ?? 0.003, o.dur));
  src.start(start);
  src.stop(start + o.dur + 0.02);
}

export const RECIPES: Record<string, Recipe> = {
  'sfx.ui.tap': (c, o, t, v) => tone(c, o, t, { type: 'sine', f0: 900, f1: 1200, dur: 0.05, gain: 0.25 * v }),

  // clear bell "ding" with a gentle shimmer (user's pick "A")
  'sfx.coin.flip': (c, o, t, v) => {
    const p = 0.97 + Math.random() * 0.06;
    tone(c, o, t, { type: 'sine', f0: 3136 * p, dur: 0.7, gain: 0.22 * v, attack: 0.002 });
    tone(c, o, t, { type: 'sine', f0: 3146 * p, dur: 0.7, gain: 0.12 * v, attack: 0.002 });
    tone(c, o, t, { type: 'sine', f0: 8655 * p, dur: 0.12, gain: 0.05 * v, attack: 0.002 });
    noise(c, o, t, { filter: 'highpass', f0: 9000, dur: 0.012, gain: 0.15 * v, attack: 0.001 });
  },

  // high flicked "ping!" (user's pick: coin sound "B", used for the coin break)
  'sfx.coin.break': (c, o, t, v) => {
    const p = 0.97 + Math.random() * 0.06;
    tone(c, o, t, { type: 'sine', f0: 3900 * p, f1: 4186 * p, glide: 0.02, dur: 0.38, gain: 0.24 * v, attack: 0.002 });
    tone(c, o, t, { type: 'sine', f0: 6279 * p, dur: 0.1, gain: 0.07 * v, attack: 0.002 });
    noise(c, o, t, { filter: 'highpass', f0: 8000, dur: 0.01, gain: 0.18 * v, attack: 0.001 });
  },

  'sfx.clash.win': (c, o, t, v) => {
    [660, 880, 1320].forEach((f, i) => tone(c, o, t, { type: 'triangle', f0: f, dur: 0.18, gain: 0.22 * v, delay: i * 0.07 }));
  },

  'sfx.clash.lose': (c, o, t, v) => {
    tone(c, o, t, { type: 'square', f0: 330, f1: 196, dur: 0.32, gain: 0.12 * v });
    tone(c, o, t, { type: 'sine', f0: 165, f1: 98, dur: 0.35, gain: 0.2 * v });
  },

  // fast high "swish" + click
  'sfx.hit.slash': (c, o, t, v) => {
    noise(c, o, t, { filter: 'bandpass', f0: 5000, f1: 1500, q: 1.5, dur: 0.14, gain: 0.55 * v, attack: 0.01 });
    tone(c, o, t, { type: 'sawtooth', f0: 1800, f1: 600, dur: 0.07, gain: 0.07 * v, delay: 0.02 });
  },

  // short sharp "thk"
  'sfx.hit.pierce': (c, o, t, v) => {
    noise(c, o, t, { filter: 'bandpass', f0: 1800, q: 4, dur: 0.07, gain: 0.6 * v });
    tone(c, o, t, { type: 'sine', f0: 1400, f1: 500, dur: 0.06, gain: 0.25 * v });
  },

  // deep thump
  'sfx.hit.blunt': (c, o, t, v) => {
    tone(c, o, t, { type: 'sine', f0: 140, f1: 45, dur: 0.22, gain: 0.45 * v });
    noise(c, o, t, { filter: 'lowpass', f0: 900, f1: 200, dur: 0.12, gain: 0.45 * v });
  },

  'sfx.crit': (c, o, t, v) => {
    tone(c, o, t, { type: 'triangle', f0: 1760, dur: 0.22, gain: 0.2 * v, delay: 0.03 });
    tone(c, o, t, { type: 'triangle', f0: 2640, dur: 0.18, gain: 0.12 * v, delay: 0.05 });
    noise(c, o, t, { filter: 'highpass', f0: 3000, dur: 0.08, gain: 0.25 * v });
  },

  // metallic clang (inharmonic partials)
  'sfx.guard': (c, o, t, v) => {
    [220, 587, 1043, 1612].forEach((f, i) => tone(c, o, t, { type: i === 0 ? 'square' : 'sine', f0: f, dur: 0.35 - i * 0.05, gain: (i === 0 ? 0.08 : 0.14) * v }));
    noise(c, o, t, { filter: 'bandpass', f0: 3000, q: 3, dur: 0.05, gain: 0.25 * v });
  },

  // airy whoosh
  'sfx.evade': (c, o, t, v) => noise(c, o, t, { filter: 'bandpass', f0: 400, f1: 2400, q: 1.2, dur: 0.22, gain: 0.9 * v, attack: 0.06 }),

  'sfx.stagger': (c, o, t, v) => {
    tone(c, o, t, { type: 'sawtooth', f0: 220, f1: 55, dur: 0.5, gain: 0.14 * v });
    noise(c, o, t, { filter: 'lowpass', f0: 600, f1: 120, dur: 0.45, gain: 0.35 * v });
    tone(c, o, t, { type: 'sine', f0: 1200, f1: 900, dur: 0.12, gain: 0.08 * v, delay: 0.05 });
  },

  'sfx.status': (c, o, t, v) => tone(c, o, t, { type: 'sine', f0: 520, f1: 780, dur: 0.09, gain: 0.15 * v }),

  'sfx.victory': (c, o, t, v) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(c, o, t, { type: 'triangle', f0: f, dur: i === 3 ? 0.6 : 0.16, gain: 0.22 * v, delay: i * 0.12 }));
    tone(c, o, t, { type: 'sine', f0: 523, dur: 0.7, gain: 0.1 * v, delay: 0.36 });
  },

  'sfx.defeat': (c, o, t, v) => {
    [392, 349, 311, 262].forEach((f, i) => tone(c, o, t, { type: 'triangle', f0: f, dur: i === 3 ? 0.8 : 0.24, gain: 0.2 * v, delay: i * 0.22 }));
  },
};

// Avoid stacking dozens of identical voices in the same instant (e.g. many coins at once).
const lastPlayed = new Map<string, number>();
const MIN_GAP = 0.03;

/** Plays a synthesized effect if a recipe exists. Returns false if there is none or audio isn't running. */
export function playSynth(ctx: AudioContext | null, key: string, volume: number): boolean {
  const recipe = RECIPES[key];
  if (!recipe || !ctx || ctx.state !== 'running') return false;
  const now = ctx.currentTime;
  if (now - (lastPlayed.get(key) ?? -1) < MIN_GAP) return true;
  lastPlayed.set(key, now);
  try {
    recipe(ctx, ctx.destination, now + 0.005, volume);
    return true;
  } catch {
    return false;
  }
}
