import { describe, expect, it } from 'vitest';
import { applyDamage, computeDamage, levelModifier, maxOneSidedDamage, oneSidedAttack } from '../src/core/damage.ts';
import { effectiveSkill } from '../src/core/skill.ts';
import type { BattleEvent } from '../src/core/types.ts';
import { bal, makeUnit, scriptedRng } from './helpers.ts';

describe('damage', () => {
  const b = bal();
  const base = (over: { target?: Parameters<typeof makeUnit>[2]; clashCount?: number; power?: number; atkLv?: number } = {}) => {
    const attacker = makeUnit('player', {}, { offenseLevel: over.atkLv ?? 30 });
    const target = makeUnit('enemy', {}, over.target ?? {});
    return computeDamage(
      { power: over.power ?? 10, skill: { damageType: 'slash' }, attacker, target, clashCount: over.clashCount ?? 0 },
      b,
    );
  };

  it('applies resistance grades', () => {
    const r = (g: 'fatal' | 'weak' | 'normal' | 'endured' | 'ineffective' | 'immune') =>
      base({ target: { resistances: { slash: g, pierce: 'normal', blunt: 'normal' } } });
    expect([r('fatal'), r('weak'), r('normal'), r('endured'), r('ineffective'), r('immune')]).toEqual([20, 15, 10, 7, 5, 0]);
  });

  it('adds clash bonus (3% per clash)', () => {
    expect(base({ power: 100, clashCount: 5 })).toBe(115);
  });

  it('level modifier = diff / (|diff| + 25)', () => {
    expect(levelModifier(35, 30, b)).toBeCloseTo(5 / 30);
    expect(levelModifier(30, 35, b)).toBeCloseTo(-5 / 30);
    expect(base({ power: 30, atkLv: 35 })).toBe(35);
  });

  it('positive damage is at least minHitDamage; zero power deals 0', () => {
    expect(base({ power: 1, target: { resistances: { slash: 'ineffective', pierce: 'normal', blunt: 'normal' } } })).toBe(1);
    expect(base({ power: 0 })).toBe(0);
  });

  it('staggered targets take fatal damage regardless of resistance', () => {
    const attacker = makeUnit('player');
    const target = makeUnit('enemy', {}, { resistances: { slash: 'ineffective', pierce: 'normal', blunt: 'normal' } });
    target.staggerTurnsLeft = 1;
    expect(computeDamage({ power: 10, skill: { damageType: 'slash' }, attacker, target, clashCount: 0 }, b)).toBe(20);
  });
});

describe('stagger thresholds', () => {
  it('staggers when HP first drops below a threshold', () => {
    const b = bal();
    const u = makeUnit('enemy', {}, { maxHp: 100, staggerThresholds: [0.6, 0.3] });
    const ev: BattleEvent[] = [];
    applyDamage(u, 39, b, ev); // 61 — not yet
    expect(u.staggerTurnsLeft).toBe(0);
    applyDamage(u, 2, b, ev); // 59
    expect(u.staggerTurnsLeft).toBe(b.stagger.recoverAfterTurns + 1);
    expect(ev.filter((e) => e.t === 'stagger')).toHaveLength(1);
  });

  it('crossing several thresholds at once is a single stagger', () => {
    const u = makeUnit('enemy', {}, { maxHp: 100, staggerThresholds: [0.6, 0.3] });
    const ev: BattleEvent[] = [];
    applyDamage(u, 80, bal(), ev);
    expect(ev.filter((e) => e.t === 'stagger')).toHaveLength(1);
    expect(u.nextStaggerIndex).toBe(2);
  });

  it('a killing blow does not stagger', () => {
    const u = makeUnit('enemy', {}, { maxHp: 100 });
    const ev: BattleEvent[] = [];
    applyDamage(u, 500, bal(), ev);
    expect(u.hp).toBe(0);
    expect(ev).toHaveLength(0);
  });
});

describe('one-sided attack', () => {
  it('power accumulates per heads and each coin hits', () => {
    const atk = makeUnit('player', { basePower: 4, coinPower: 3, coinCount: 3 });
    const tgt = makeUnit('enemy', {}, { maxHp: 999, staggerThresholds: [] });
    const ev: BattleEvent[] = [];
    oneSidedAttack(atk, effectiveSkill(atk, 'S1'), 3, tgt, 0, scriptedRng([true, false, true]), bal(), ev);
    const hits = ev.filter((e) => e.t === 'coinHit');
    expect(hits.map((h) => h.t === 'coinHit' && h.power)).toEqual([7, 7, 10]);
    expect(tgt.hp).toBe(999 - 24);
  });

  it('stops hitting once the target is dead', () => {
    const atk = makeUnit('player', { basePower: 50, coinCount: 3 });
    const tgt = makeUnit('enemy', {}, { maxHp: 10 });
    const ev: BattleEvent[] = [];
    oneSidedAttack(atk, effectiveSkill(atk, 'S1'), 3, tgt, 0, scriptedRng([true, true, true]), bal(), ev);
    expect(ev.filter((e) => e.t === 'coinHit')).toHaveLength(1);
  });
});

describe('max one-sided damage (lethal warning)', () => {
  it('assumes every coin lands heads', () => {
    const atk = makeUnit('player', { basePower: 4, coinPower: 3, coinCount: 3 });
    const tgt = makeUnit('enemy');
    // powers 7, 10, 13
    expect(maxOneSidedDamage(atk, effectiveSkill(atk, 'S1'), 3, tgt, 0, bal())).toBe(30);
  });
  it('doubles against a staggered target', () => {
    const atk = makeUnit('player', { basePower: 4, coinPower: 3, coinCount: 1 });
    const tgt = makeUnit('enemy');
    tgt.staggerTurnsLeft = 1;
    expect(maxOneSidedDamage(atk, effectiveSkill(atk, 'S1'), 1, tgt, 0, bal())).toBe(14);
  });
});
