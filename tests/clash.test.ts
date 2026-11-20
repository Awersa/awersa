import { describe, expect, it } from 'vitest';
import { resolveClash } from '../src/core/clash.ts';
import { effectiveSkill } from '../src/core/skill.ts';
import type { BattleEvent } from '../src/core/types.ts';
import { bal, makeUnit, scriptedRng } from './helpers.ts';

const H = true;
const T = false;

describe('clash', () => {
  it('higher power breaks one enemy coin per round until 0', () => {
    const p = makeUnit('player', { basePower: 4, coinPower: 3, coinCount: 2 });
    const e = makeUnit('enemy', { basePower: 4, coinPower: 3, coinCount: 2 });
    // round 1: P HH(10) vs E TT(4) → E loses a coin; round 2: P HT(7) vs E T(4) → E loses its last coin
    const rng = scriptedRng([H, H, T, T, H, T, T]);
    const events: BattleEvent[] = [];
    const r = resolveClash(p, effectiveSkill(p, 'S1'), e, effectiveSkill(e, 'S1'), rng, bal(), events);
    expect(r).toEqual({ winner: 'player', clashCount: 2, winnerCoins: 2, tieBreak: false });
    const rounds = events.filter((x) => x.t === 'clashRound');
    expect(rounds.map((x) => x.t === 'clashRound' && [x.player.power, x.enemy.power, x.loser])).toEqual([
      [10, 4, 'enemy'],
      [7, 4, 'enemy'],
    ]);
    expect(rng.remaining()).toBe(0);
  });

  it('winner keeps only unbroken coins', () => {
    const p = makeUnit('player', { coinCount: 3 });
    const e = makeUnit('enemy', { coinCount: 1 });
    // r1: P TTT(4) vs E H(7) → P loses one; r2: P HH(10) vs E T(4) → E out
    const rng = scriptedRng([T, T, T, H, H, H, T]);
    const r = resolveClash(p, effectiveSkill(p, 'S1'), e, effectiveSkill(e, 'S1'), rng, bal(), []);
    expect(r.winner).toBe('player');
    expect(r.winnerCoins).toBe(2);
    expect(r.clashCount).toBe(2);
  });

  it('ties reroll and count as clashes', () => {
    const p = makeUnit('player', { coinCount: 1 });
    const e = makeUnit('enemy', { coinCount: 1 });
    // r1: H vs H tie; r2: T vs H → player loses
    const rng = scriptedRng([H, H, T, H]);
    const events: BattleEvent[] = [];
    const r = resolveClash(p, effectiveSkill(p, 'S1'), e, effectiveSkill(e, 'S1'), rng, bal(), events);
    expect(r.winner).toBe('enemy');
    expect(r.clashCount).toBe(2);
    const first = events.find((x) => x.t === 'clashRound');
    expect(first?.t === 'clashRound' && first.loser).toBeNull();
  });

  it('endless ties are broken after maxTieRerolls', () => {
    const b = bal();
    b.clash.maxTieRerolls = 3;
    const p = makeUnit('player', { coinCount: 1, coinPower: 0 });
    const e = makeUnit('enemy', { coinCount: 1, coinPower: 0 });
    // 3 tie rounds (2 flips each), then the tie-break flip (H → enemy loses)
    const rng = scriptedRng([H, H, H, H, H, H, H]);
    const r = resolveClash(p, effectiveSkill(p, 'S1'), e, effectiveSkill(e, 'S1'), rng, b, []);
    expect(r).toMatchObject({ winner: 'player', clashCount: 3, tieBreak: true });
  });

  it('is reproducible with a seeded rng', async () => {
    const { createRng } = await import('../src/core/rng.ts');
    const run = () => {
      const p = makeUnit('player', { coinCount: 3 });
      const e = makeUnit('enemy', { coinCount: 3 });
      const ev: BattleEvent[] = [];
      resolveClash(p, effectiveSkill(p, 'S1'), e, effectiveSkill(e, 'S1'), createRng(2024), bal(), ev);
      return ev;
    };
    expect(run()).toEqual(run());
  });
});
