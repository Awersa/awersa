import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadJson, saveJson } from '../src/platform/storage.ts';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const isNum = (v: unknown): v is number => typeof v === 'number';

describe('safe storage', () => {
  let mem: MemStorage;
  beforeEach(() => {
    mem = new MemStorage();
    (globalThis as { localStorage?: unknown }).localStorage = mem;
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('round-trips valid data', () => {
    saveJson('x', 5);
    expect(loadJson('x', isNum, 0)).toBe(5);
  });

  it('falls back on corrupted JSON, wrong types and oversized values', () => {
    mem.setItem('clashduel.x', '{not json');
    expect(loadJson('x', isNum, 1)).toBe(1);
    mem.setItem('clashduel.x', '"str"');
    expect(loadJson('x', isNum, 2)).toBe(2);
    mem.setItem('clashduel.x', '1'.repeat(300 * 1024));
    expect(loadJson('x', isNum, 3)).toBe(3);
  });

  it('survives storage that throws (private mode)', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    expect(loadJson('x', isNum, 4)).toBe(4);
    expect(saveJson('x', 1)).toBe(false);
  });
});
