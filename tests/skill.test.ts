import { describe, expect, it } from 'vitest';
import { clashPower, effectiveSkill, headsChance, powerRange } from '../src/core/skill.ts';
import { bal, makeUnit } from './helpers.ts';

describe('coins & power', () => {
  it('heads chance = 50% + sanity%, clamped', () => {
    const b = bal();
    expect(headsChance({ hasSanity: true, sanity: 0 }, b)).toBeCloseTo(0.5);
    expect(headsChance({ hasSanity: true, sanity: 45 }, b)).toBeCloseTo(0.95);
    expect(headsChance({ hasSanity: true, sanity: -45 }, b)).toBeCloseTo(0.05);
    expect(headsChance({ hasSanity: true, sanity: 999 }, b)).toBe(1);
    expect(headsChance({ hasSanity: false, sanity: 45 }, b)).toBeCloseTo(0.5);
  });

  it('power = base + heads × coinPower, never negative', () => {
    expect(clashPower({ basePower: 4, coinPower: 3 }, [true, false, true])).toBe(10);
    expect(clashPower({ basePower: 4, coinPower: -3 }, [true, true])).toBe(0);
  });

  it('power range handles negative coin power', () => {
    expect(powerRange({ basePower: 4, coinPower: 3, coinCount: 2 })).toEqual({ min: 4, max: 10 });
    expect(powerRange({ basePower: 12, coinPower: -2, coinCount: 3 })).toEqual({ min: 6, max: 12 });
  });

  it('effective skill applies permanent mods (min/max power rewards)', () => {
    const u = makeUnit('player', { basePower: 4, coinPower: 3, coinCount: 2 });
    u.skillMods.S1 = { basePower: 2, coinPower: 1 };
    expect(powerRange(effectiveSkill(u, 'S1'))).toEqual({ min: 6, max: 14 });
    expect(powerRange(effectiveSkill(u, 'S2'))).toEqual({ min: 4, max: 10 });
  });
});
