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

  // 'sfx.clash.win': intentionally silent (user's choice) — the coin sounds carry the moment.

  // weapons meeting: short, bright metallic "챙" (same family as the coin sounds)
  'sfx.clash.impact': (c, o, t, v) => {
    const p = 0.97 + Math.random() * 0.06;
    tone(c, o, t, { type: 'sine', f0: 2349 * p, dur: 0.28, gain: 0.16 * v, attack: 0.001 });
    tone(c, o, t, { type: 'sine', f0: 3520 * p, dur: 0.22, gain: 0.14 * v, attack: 0.001 });
    tone(c, o, t, { type: 'sine', f0: 5274 * p, dur: 0.12, gain: 0.08 * v, attack: 0.001 });
    noise(c, o, t, { filter: 'highpass', f0: 6000, dur: 0.03, gain: 0.25 * v, attack: 0.001 });
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

// ---------------------------------------------------------------- dark / heavy set
// Gritty, weighty, metallic sounds with a bit of drive and a shared room reverb.

const irCache = new WeakMap<BaseAudioContext, AudioBuffer>();
/** Synthetic room impulse: decaying, slightly filtered noise (stereo). */
function roomIR(ctx: BaseAudioContext, seconds = 1.4, decay = 3.2): AudioBuffer {
  let b = irCache.get(ctx);
  if (!b) {
    const len = Math.floor(ctx.sampleRate * seconds);
    b = ctx.createBuffer(2, len, ctx.sampleRate);
    let seed = 777;
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const n = (seed / 0x3fffffff) - 1;
        lp = lp * 0.6 + n * 0.4; // darker tail
        d[i] = lp * Math.pow(1 - i / len, decay);
      }
    }
    irCache.set(ctx, b);
  }
  return b;
}

const reverbCache = new WeakMap<AudioNode, ConvolverNode>();
/** One shared reverb per output node. */
function reverbInto(ctx: BaseAudioContext, out: AudioNode): ConvolverNode {
  let r = reverbCache.get(out);
  if (!r) {
    r = ctx.createConvolver();
    r.buffer = roomIR(ctx);
    r.connect(out);
    reverbCache.set(out, r);
  }
  return r;
}

function driveCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

/** A per-sound mixing bus: optional drive (grit) + dry + send to the shared room reverb. */
function bus(ctx: BaseAudioContext, out: AudioNode, o: { drive?: number; wet?: number; gain?: number } = {}): AudioNode {
  const input = ctx.createGain();
  input.gain.value = o.gain ?? 1;
  let node: AudioNode = input;
  if (o.drive) {
    const ws = ctx.createWaveShaper();
    ws.curve = driveCurve(o.drive);
    ws.oversample = '2x';
    input.connect(ws);
    node = ws;
  }
  node.connect(out);
  if (o.wet) {
    const send = ctx.createGain();
    send.gain.value = o.wet;
    node.connect(send);
    send.connect(reverbInto(ctx, out));
  }
  return input;
}

/** Metallic ring: a few inharmonic resonances excited by a noise burst. */
function metal(ctx: BaseAudioContext, out: AudioNode, t: number, freqs: number[], dur: number, gain: number, q = 18): void {
  for (const [i, f] of freqs.entries()) noise(ctx, out, t, { filter: 'bandpass', f0: f, q, dur: dur * (1 - i * 0.12), gain: gain * (1 - i * 0.15), attack: 0.001 });
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export const RECIPES_DARK: Record<string, Recipe> = {
  // dry mechanical click
  'sfx.ui.tap': (c, o, t, v) => {
    const b = bus(c, o, { gain: v });
    noise(c, b, t, { filter: 'bandpass', f0: 2200, q: 3, dur: 0.025, gain: 0.35, attack: 0.001 });
    tone(c, b, t, { type: 'sine', f0: 140, f1: 90, dur: 0.05, gain: 0.25, attack: 0.001 });
  },

  // weapons meet: heavy steel "CHANG" with a ringing tail
  'sfx.clash.impact': (c, o, t, v) => {
    const b = bus(c, o, { drive: 2.5, wet: 0.45, gain: v * 0.45 });
    const p = rnd(0.95, 1.05);
    noise(c, b, t, { filter: 'highpass', f0: 2500, dur: 0.04, gain: 0.6, attack: 0.001 });
    metal(c, b, t, [1870 * p, 2930 * p, 4410 * p, 6120 * p], 0.45, 0.55, 22);
    tone(c, b, t, { type: 'sine', f0: 110, f1: 55, dur: 0.18, gain: 0.45, attack: 0.001 });
  },

  // losing a clash: a dull blow and a falling, ominous growl
  'sfx.clash.lose': (c, o, t, v) => {
    const b = bus(c, o, { drive: 3, wet: 0.35, gain: v * 0.6 });
    tone(c, b, t, { type: 'sine', f0: 90, f1: 40, dur: 0.35, gain: 0.5, attack: 0.002 });
    tone(c, b, t, { type: 'sawtooth', f0: 110, f1: 70, dur: 0.4, gain: 0.08, attack: 0.01 });
    tone(c, b, t, { type: 'sawtooth', f0: 113, f1: 72, dur: 0.4, gain: 0.08, attack: 0.01 });
    noise(c, b, t, { filter: 'lowpass', f0: 700, f1: 200, dur: 0.25, gain: 0.35 });
  },

  // slash: air rip + steel "shing" + a little body
  'sfx.hit.slash': (c, o, t, v) => {
    const b = bus(c, o, { drive: 2, wet: 0.3, gain: v * 0.8 });
    noise(c, b, t, { filter: 'bandpass', f0: 1800, f1: 7000, q: 1.8, dur: 0.11, gain: 0.7, attack: 0.008 });
    metal(c, b, t + 0.03, [5900 * rnd(0.96, 1.04), 8100], 0.25, 0.3, 25);
    tone(c, b, t + 0.03, { type: 'sine', f0: 160, f1: 70, dur: 0.12, gain: 0.35, attack: 0.001 });
  },

  // pierce: sharp crack + punchy "thunk"
  'sfx.hit.pierce': (c, o, t, v) => {
    const b = bus(c, o, { drive: 3, wet: 0.25, gain: v * 0.55 });
    noise(c, b, t, { filter: 'highpass', f0: 3500, dur: 0.012, gain: 0.8, attack: 0.0005 });
    tone(c, b, t, { type: 'triangle', f0: 260, f1: 70, glide: 0.05, dur: 0.12, gain: 0.55, attack: 0.001 });
    metal(c, b, t, [4200 * rnd(0.96, 1.04)], 0.12, 0.25, 20);
  },

  // blunt: deep, crunchy body blow
  'sfx.hit.blunt': (c, o, t, v) => {
    const b = bus(c, o, { drive: 4, wet: 0.35, gain: v * 0.6 });
    tone(c, b, t, { type: 'sine', f0: 95, f1: 32, dur: 0.35, gain: 0.7, attack: 0.001 });
    noise(c, b, t, { filter: 'lowpass', f0: 1400, f1: 250, dur: 0.16, gain: 0.6, attack: 0.001 });
    noise(c, b, t + 0.02, { filter: 'bandpass', f0: 700, q: 2, dur: 0.1, gain: 0.3 });
  },

  // crit: bright cut on top of a sub "boom"
  'sfx.crit': (c, o, t, v) => {
    const b = bus(c, o, { drive: 2, wet: 0.5, gain: v * 0.6 });
    metal(c, b, t, [3300, 5000, 7400], 0.35, 0.35, 30);
    tone(c, b, t, { type: 'sine', f0: 70, f1: 30, dur: 0.45, gain: 0.55, attack: 0.002 });
    noise(c, b, t, { filter: 'highpass', f0: 6000, dur: 0.05, gain: 0.35, attack: 0.001 });
  },

  // guard: heavy plate taking a hit — dull clank, no sparkle
  'sfx.guard': (c, o, t, v) => {
    const b = bus(c, o, { drive: 2, wet: 0.35, gain: v * 0.7 });
    metal(c, b, t, [420, 980, 1650, 2470], 0.32, 0.5, 14);
    tone(c, b, t, { type: 'sine', f0: 120, f1: 60, dur: 0.2, gain: 0.45, attack: 0.001 });
    noise(c, b, t, { filter: 'bandpass', f0: 1500, q: 1, dur: 0.04, gain: 0.4, attack: 0.001 });
  },

  // evade: cloth-and-air whoosh that passes by
  'sfx.evade': (c, o, t, v) => {
    const b = bus(c, o, { wet: 0.25, gain: v * 1.6 });
    noise(c, b, t, { filter: 'bandpass', f0: 500, f1: 2600, q: 0.9, dur: 0.24, gain: 0.8, attack: 0.07 });
    noise(c, b, t + 0.05, { filter: 'bandpass', f0: 2600, f1: 700, q: 0.9, dur: 0.18, gain: 0.4, attack: 0.03 });
  },

  // stagger: something breaks — sub drop, crunch, glassy crack, long tail
  'sfx.stagger': (c, o, t, v) => {
    const b = bus(c, o, { drive: 3.5, wet: 0.6, gain: v * 0.6 });
    tone(c, b, t, { type: 'sine', f0: 140, f1: 28, dur: 0.75, gain: 0.7, attack: 0.002 });
    noise(c, b, t, { filter: 'lowpass', f0: 1600, f1: 150, dur: 0.4, gain: 0.55, attack: 0.001 });
    metal(c, b, t + 0.04, [2800, 4300, 6100], 0.4, 0.3, 12);
    noise(c, b, t + 0.04, { filter: 'highpass', f0: 5000, dur: 0.06, gain: 0.35, attack: 0.001 });
  },

  // status: a muted, low pulse
  'sfx.status': (c, o, t, v) => {
    const b = bus(c, o, { wet: 0.4, gain: v * 1.6 });
    tone(c, b, t, { type: 'sine', f0: 220, f1: 165, dur: 0.18, gain: 0.25, attack: 0.01 });
    noise(c, b, t, { filter: 'bandpass', f0: 900, q: 4, dur: 0.12, gain: 0.15, attack: 0.01 });
  },

  // victory: a dark swell that resolves upward (no chiptune melody)
  'sfx.victory': (c, o, t, v) => {
    const b = bus(c, o, { drive: 1.5, wet: 0.7, gain: v * 1.3 });
    for (const [f, d] of [[110, 0], [165, 0], [220, 0.25], [277, 0.25], [330, 0.25]] as const) {
      tone(c, b, t, { type: 'sawtooth', f0: f, dur: 1.4, gain: 0.05, attack: 0.25, delay: d });
      tone(c, b, t, { type: 'sawtooth', f0: f * 1.004, dur: 1.4, gain: 0.05, attack: 0.25, delay: d });
    }
    metal(c, b, t + 0.25, [1870, 2930], 0.9, 0.2, 30);
  },

  // defeat: a low drone sinking into silence
  'sfx.defeat': (c, o, t, v) => {
    const b = bus(c, o, { drive: 2, wet: 0.7, gain: v * 0.55 });
    tone(c, b, t, { type: 'sawtooth', f0: 98, f1: 49, dur: 1.6, gain: 0.08, attack: 0.05 });
    tone(c, b, t, { type: 'sawtooth', f0: 116, f1: 58, dur: 1.6, gain: 0.07, attack: 0.05 });
    tone(c, b, t, { type: 'sine', f0: 60, f1: 30, dur: 1.4, gain: 0.4, attack: 0.02 });
    noise(c, b, t, { filter: 'lowpass', f0: 400, dur: 0.6, gain: 0.25 });
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
