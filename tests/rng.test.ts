import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('differs for different seeds', () => {
    expect(createRng(1).next()).not.toEqual(createRng(2).next());
  });

  it('resumes exactly from a saved state', () => {
    const a = createRng(99);
    a.next(); a.next();
    const saved = a.getState();
    const expected = [a.next(), a.next(), a.next()];
    const b = createRng(0);
    b.setState(saved);
    expect([b.next(), b.next(), b.next()]).toEqual(expected);
  });

  it('int stays within inclusive bounds and hits both ends', () => {
    const r = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it('chance clamps probability', () => {
    const r = createRng(5);
    for (let i = 0; i < 100; i++) {
      expect(r.chance(1.5)).toBe(true);
      expect(r.chance(-1)).toBe(false);
    }
  });

  it('chance roughly matches probability', () => {
    const r = createRng(42);
    let heads = 0;
    for (let i = 0; i < 10000; i++) if (r.chance(0.95)) heads++;
    expect(heads / 10000).toBeGreaterThan(0.93);
    expect(heads / 10000).toBeLessThan(0.97);
  });

  it('shuffle keeps all elements and does not mutate input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = createRng(3).shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(input);
  });

  it('weighted never picks zero-weight items and rejects all-zero', () => {
    const r = createRng(11);
    for (let i = 0; i < 500; i++) {
      expect(r.weighted(['a', 'b', 'c'], (x) => (x === 'b' ? 0 : 1))).not.toBe('b');
    }
    expect(() => r.weighted(['a'], () => 0)).toThrow();
  });

  it('pick throws on empty array', () => {
    expect(() => createRng(1).pick([])).toThrow();
  });
});
