import { describe, expect, it } from 'vitest';
import { createEnemyForFloor, isBossFloor, pickEnemyDef } from '../src/core/floor.ts';
import { applyReward, generateOffers, type RewardOffer } from '../src/core/rewards.ts';
import { createRng } from '../src/core/rng.ts';
import { effectiveSkill, powerRange } from '../src/core/skill.ts';
import { createUnit, indexSkills } from '../src/core/unit.ts';
import { validateGameData } from '../src/core/validate.ts';
import { bal, data, makeUnit } from './helpers.ts';

describe('floors', () => {
  it('floor 1 is unscaled; later floors gain HP, power and level', () => {
    const b = bal();
    const d = data();
    const sk = indexSkills(d.skills);
    const def = d.enemies.find((e) => !e.boss)!;
    const f1 = createEnemyForFloor(def, sk, 1, b);
    expect(f1.maxHp).toBe(def.maxHp);
    expect(f1.skillMods).toEqual({});
    const f7 = createEnemyForFloor(def, sk, 7, b);
    expect(f7.maxHp).toBeGreaterThan(def.maxHp);
    expect(powerRange(effectiveSkill(f7, 'S1')).max).toBeGreaterThan(powerRange(effectiveSkill(f1, 'S1')).max);
    expect(f7.offenseLevel).toBe(def.offenseLevel + 6 * b.floor.levelPerFloor);
  });

  it('boss every 5th floor', () => {
    const b = bal();
    const d = data();
    const rng = createRng(1);
    expect(isBossFloor(5, b)).toBe(true);
    expect(pickEnemyDef(d.enemies, 5, rng, b).boss).toBe(true);
    for (let i = 0; i < 20; i++) expect(pickEnemyDef(d.enemies, 3, rng, b).boss ?? false).toBe(false);
  });
});

describe('rewards (min / max clash power)', () => {
  const offer = (o: Partial<RewardOffer>): RewardOffer => ({ defId: 'x', name: 'x', kind: 'basePower', amount: 1, slots: [], description: '', ...o });

  it('basePower raises min and max; coinPower raises max only', () => {
    const u = makeUnit('player', { basePower: 4, coinPower: 3, coinCount: 2 });
    applyReward(u, offer({ kind: 'basePower', amount: 2, slots: ['S1'] }));
    expect(powerRange(effectiveSkill(u, 'S1'))).toEqual({ min: 6, max: 12 });
    applyReward(u, offer({ kind: 'coinPower', amount: 1, slots: ['S1'] }));
    expect(powerRange(effectiveSkill(u, 'S1'))).toEqual({ min: 6, max: 14 });
    expect(powerRange(effectiveSkill(u, 'S2'))).toEqual({ min: 4, max: 10 });
  });

  it('heal is capped at max HP; maxHp also heals', () => {
    const u = makeUnit('player', {}, { maxHp: 100 });
    u.hp = 90;
    applyReward(u, offer({ kind: 'heal', amount: 0.5 }));
    expect(u.hp).toBe(100);
    applyReward(u, offer({ kind: 'maxHp', amount: 20 }));
    expect([u.hp, u.maxHp]).toEqual([120, 120]);
  });

  it('offers are distinct and target real slots', () => {
    const b = bal();
    const d = data();
    const u = createUnit(d.players[0]!, indexSkills(d.skills), 'player', b);
    for (let s = 0; s < 50; s++) {
      const offers = generateOffers(d.rewards, u, createRng(s), b);
      expect(offers).toHaveLength(b.rewards.offerCount);
      expect(new Set(offers.map((o) => o.defId)).size).toBe(offers.length);
      for (const o of offers) if (o.kind === 'basePower' || o.kind === 'coinPower') expect(o.slots.length).toBeGreaterThan(0);
    }
  });
});

describe('data validation', () => {
  it('shipped data is valid', () => {
    expect(validateGameData(data())).toEqual([]);
  });

  it('catches broken data', () => {
    const d = data() as unknown as Record<"skills" | "players" | "enemies" | "rewards", unknown[]>;
    (d.skills[0] as Record<string, unknown>).coinCount = 0;
    (d.skills[1] as Record<string, unknown>).basePower = Number.NaN;
    (d.players[0] as Record<string, unknown>).skills = { S1: 'nope', S2: 'hk_s2', S3: 'hk_s3' };
    d.rewards.push({ id: 'heal', name: 'dup', kind: 'heal', amount: 5, weight: 1 });
    const errs = validateGameData(d);
    expect(errs.some((e) => e.includes('coinCount'))).toBe(true);
    expect(errs.some((e) => e.includes('basePower'))).toBe(true);
    expect(errs.some((e) => e.includes('unknown skill nope'))).toBe(true);
    expect(errs.some((e) => e.includes('duplicate id heal'))).toBe(true);
    expect(errs.some((e) => e.includes('ratio'))).toBe(true);
  });

  it('rejects prototype-polluting ids', () => {
    const d = data() as unknown as Record<"skills" | "players" | "enemies" | "rewards", unknown[]>;
    (d.players[0] as Record<string, unknown>).skills = { S1: '__proto__', S2: 'hk_s2', S3: 'hk_s3' };
    expect(validateGameData(d).some((e) => e.includes('unknown skill __proto__'))).toBe(true);
  });
});
