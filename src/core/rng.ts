/**
 * Seedable deterministic RNG (mulberry32).
 * The whole state is one 32-bit integer, so it can be saved with a run and resumed exactly.
 * Pure module: no Phaser / DOM dependencies.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] (both inclusive). */
  int(min: number, max: number): number;
  /** true with the given probability (clamped to [0, 1]). */
  chance(p: number): boolean;
  /** Picks one element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** Picks by non-negative weights. Throws if all weights are 0. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  /** Returns a shuffled copy (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** Current internal state, for saving. */
  getState(): number;
  setState(state: number): void;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;

  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (!Number.isFinite(min) || !Number.isFinite(max)) throw new RangeError('int: non-finite bounds');
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return lo + Math.floor(next() * (hi - lo + 1));
  };

  return {
    next,
    int,
    chance: (p) => next() < Math.min(1, Math.max(0, p)),
    pick: (items) => {
      if (items.length === 0) throw new RangeError('pick: empty array');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    weighted: (items, weight) => {
      const ws = items.map((it) => Math.max(0, weight(it) || 0));
      const total = ws.reduce((a, b) => a + b, 0);
      if (total <= 0) throw new RangeError('weighted: no positive weights');
      let roll = next() * total;
      for (let i = 0; i < items.length; i++) {
        roll -= ws[i] as number;
        if (roll < 0) return items[i] as (typeof items)[number];
      }
      return items[items.length - 1] as (typeof items)[number];
    },
    shuffle: (items) => {
      const a = items.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j] as (typeof a)[number], a[i] as (typeof a)[number]];
      }
      return a;
    },
    getState: () => s,
    setState: (state) => {
      if (!Number.isInteger(state)) throw new TypeError('setState: integer required');
      s = state >>> 0;
    },
  };
}

/** A fresh seed for a new run (crypto-quality when available; not security sensitive). */
export function randomSeed(): number {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] as number;
  return Math.floor(Math.random() * 2 ** 32);
}
