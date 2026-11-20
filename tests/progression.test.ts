import { describe, expect, it } from 'vitest';
import { createEnemyForFloor, isBossFloor, pickEnemyDef } from '../src/core/floor.ts';
import { applyReward, describeOffer, generateOffers, recoverAfterBattle, type RewardDef, type RewardOffer } from '../src/core/rewards.ts';
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

  it('recovers a share of max HP after each won battle', () => {
    const b = bal();
    b.rewards.healAfterBattle = 0.3;
    const u = makeUnit('player', {}, { maxHp: 100 });
    u.hp = 50;
    expect(recoverAfterBattle(u, b)).toBe(30);
    expect(recoverAfterBattle(u, b)).toBe(20);
    expect(u.hp).toBe(100);
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

describe('boss coin reward & before/after text', () => {
  const offer = (o: Partial<RewardOffer>): RewardOffer => ({ defId: 'x', name: 'x', kind: 'coinCount', amount: 1, slots: ['S1'], description: '', ...o });

  it('adds a coin, respecting maxCoinCount', () => {
    const b = bal();
    b.rewards.maxCoinCount = 3;
    const u = makeUnit('player', { basePower: 4, coinPower: 3, coinCount: 2 });
    applyReward(u, offer({}), b);
    expect(effectiveSkill(u, 'S1').coinCount).toBe(3);
    expect(powerRange(effectiveSkill(u, 'S1'))).toEqual({ min: 4, max: 13 });
    applyReward(u, offer({}), b); // capped
    expect(effectiveSkill(u, 'S1').coinCount).toBe(3);
  });

  it('extra coins are used in battle (one more hit)', async () => {
    const { createBattle, takeTurn } = await import('../src/core/battle.ts');
    const b = bal();
    const p = makeUnit('player', { basePower: 5, coinPower: 0, coinCount: 1 }, { maxHp: 9999 });
    const e = makeUnit('enemy', { basePower: 1, coinPower: 0, coinCount: 1 }, { maxHp: 9999, staggerThresholds: [] });
    for (const s of ['S1', 'S2', 'S3'] as const) p.skillMods[s] = { basePower: 0, coinPower: 0, coinCount: 2 };
    const { state } = createBattle(p, e, 1, b);
    const ev = takeTurn(state, 0, b);
    expect(ev.filter((x) => x.t === 'coinHit' && x.attacker === 'player')).toHaveLength(3);
  });

  const coinDef: RewardDef = { id: 'coin_add', name: '코인 주조', kind: 'coinCount', amount: 1, target: 'one', weight: 0, bossOnly: true, chance: 1 };

  it('boss-only rewards never appear outside boss floors', () => {
    const d = data();
    const b = bal();
    const u = createUnit(d.players[0]!, indexSkills(d.skills), 'player', b);
    for (let s = 0; s < 100; s++) {
      expect(generateOffers([...d.rewards, coinDef], u, createRng(s), b, false).some((o) => o.special)).toBe(false);
    }
  });

  it('after a boss, a chance-1 reward always replaces one offer; chance-0 never', () => {
    const d = data();
    const b = bal();
    const u = createUnit(d.players[0]!, indexSkills(d.skills), 'player', b);
    const pool = d.rewards.filter((r) => !r.bossOnly);
    for (let s = 0; s < 50; s++) {
      const offers = generateOffers([...pool, coinDef], u, createRng(s), b, true);
      expect(offers).toHaveLength(b.rewards.offerCount);
      expect(offers.filter((o) => o.special)).toHaveLength(1);
      expect(generateOffers([...pool, { ...coinDef, chance: 0 }], u, createRng(s), b, true).some((o) => o.special)).toBe(false);
    }
  });

  it('shipped coin reward appears after roughly `chance` of boss fights', () => {
    const d = data();
    const b = bal();
    const u = createUnit(d.players[0]!, indexSkills(d.skills), 'player', b);
    const chance = d.rewards.find((r) => r.bossOnly)!.chance!;
    let hits = 0;
    for (let s = 0; s < 4000; s++) if (generateOffers(d.rewards, u, createRng(s), b, true).some((o) => o.special)) hits++;
    expect(hits / 4000).toBeGreaterThan(chance - 0.04);
    expect(hits / 4000).toBeLessThan(chance + 0.04);
  });

  it('describes before → after', () => {
    const b = bal();
    const u = makeUnit('player', { basePower: 5, coinPower: 3, coinCount: 2 });
    expect(describeOffer({ defId: 'x', name: 'x', kind: 'basePower', amount: 1, slots: ['S1'] }, u, b)).toContain('5~11 → 6~12');
    expect(describeOffer({ defId: 'x', name: 'x', kind: 'coinPower', amount: 1, slots: ['S1'] }, u, b)).toContain('5~11 → 5~13');
    expect(describeOffer({ defId: 'x', name: 'x', kind: 'coinCount', amount: 1, slots: ['S1'] }, u, b)).toContain('코인 2→3개');
    u.hp = 50;
    expect(describeOffer({ defId: 'x', name: 'x', kind: 'heal', amount: 0.35, slots: [] }, u, b)).toContain('HP 50 → 85');
    expect(u.hp).toBe(50); // description must not mutate the unit
  });
});

describe('reward pool hygiene', () => {
  it('never offers a heal at full HP', () => {
    const d = data();
    const b = bal();
    const u = createUnit(d.players[0]!, indexSkills(d.skills), 'player', b);
    for (let s = 0; s < 200; s++) {
      const offers = generateOffers(d.rewards, u, createRng(s), b);
      expect(offers.some((o) => o.kind === 'heal')).toBe(false);
      expect(offers).toHaveLength(b.rewards.offerCount);
    }
  });
});

describe('accelerating floor growth', () => {
  it('extra base power grows with the square of the floor', () => {
    const b = bal();
    b.floor.basePowerEveryFloors = 0;
    b.floor.coinPowerEveryFloors = 0;
    b.floor.basePowerAccelDivisor = 60;
    const d = data();
    const sk = indexSkills(d.skills);
    const def = d.enemies.find((e) => !e.boss)!;
    const mod = (f: number) => createEnemyForFloor(def, sk, f, b).skillMods.S1?.basePower ?? 0;
    expect([mod(1), mod(9), mod(11), mod(21), mod(31)]).toEqual([0, 1, 1, 6, 15]);
  });
});
