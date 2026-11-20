import { describe, expect, it } from 'vitest';
import { oneSidedAttack } from '../src/core/attack.ts';
import { createBattle, takeTurn, playerStatus } from '../src/core/battle.ts';
import { useSkill } from '../src/core/effects.ts';
import { effectiveSkill } from '../src/core/skill.ts';
import { addStatus, statusTurnEnd, trigger } from '../src/core/status.ts';
import { createUnit, indexSkills, prepareForBattle } from '../src/core/unit.ts';
import { createRng } from '../src/core/rng.ts';
import { validateGameData } from '../src/core/validate.ts';
import type { BattleEvent, SkillDef } from '../src/core/types.ts';
import { bal, data, makeUnit, scriptedRng, skill, unitDef } from './helpers.ts';

const T = false;

describe('statuses', () => {
  it('bleed: the bearer takes potency damage per coin thrown, count -1', () => {
    const b = bal();
    const atk = makeUnit('player', { basePower: 1, coinPower: 0, coinCount: 3 }, { maxHp: 100, staggerThresholds: [] });
    const tgt = makeUnit('enemy', {}, { maxHp: 999, staggerThresholds: [] });
    const ev: BattleEvent[] = [];
    addStatus(atk, 'bleed', 3, 2, b, ev);
    oneSidedAttack(atk, effectiveSkill(atk, 'S1'), 3, tgt, 0, scriptedRng([T, T, T]), b, ev);
    expect(atk.hp).toBe(94);
    expect(atk.statuses.bleed).toBeUndefined();
    expect(ev.filter((e) => e.t === 'statusTrigger')).toHaveLength(2);
  });

  it('burn: damage at turn end, count -1', () => {
    const b = bal();
    const u = makeUnit('enemy', {}, { maxHp: 100, staggerThresholds: [] });
    const ev: BattleEvent[] = [];
    addStatus(u, 'burn', 4, 2, b, ev);
    statusTurnEnd(u, b, ev);
    expect(u.hp).toBe(96);
    expect(u.statuses.burn).toEqual({ potency: 4, count: 1 });
  });

  it('rupture: extra damage when hit', () => {
    const b = bal();
    const atk = makeUnit('player', { basePower: 10, coinPower: 0, coinCount: 1 });
    const tgt = makeUnit('enemy', {}, { maxHp: 999, staggerThresholds: [] });
    const ev: BattleEvent[] = [];
    addStatus(tgt, 'rupture', 5, 1, b, ev);
    oneSidedAttack(atk, effectiveSkill(atk, 'S1'), 1, tgt, 0, scriptedRng([T]), b, ev);
    expect(tgt.hp).toBe(999 - 10 - 5);
    expect(tgt.statuses.rupture).toBeUndefined();
  });

  it('sinking: sanity loss when hit; damage instead if the target has no sanity', () => {
    const b = bal();
    const withSanity = makeUnit('player', {}, { maxHp: 100, staggerThresholds: [] });
    const ev: BattleEvent[] = [];
    addStatus(withSanity, 'sinking', 6, 1, b, ev);
    trigger(withSanity, 'hitTaken', b, ev);
    expect(withSanity.sanity).toBe(-6);
    const noSanity = makeUnit('enemy', {}, { maxHp: 100, hasSanity: false, staggerThresholds: [] });
    addStatus(noSanity, 'sinking', 6, 1, b, ev);
    trigger(noSanity, 'hitTaken', b, ev);
    expect(noSanity.hp).toBe(94);
  });

  it('tremor burst: counts as extra HP loss for stagger only', () => {
    const b = bal();
    const u = makeUnit('enemy', {}, { maxHp: 100, staggerThresholds: [0.6] });
    u.hp = 70;
    const ev: BattleEvent[] = [];
    addStatus(u, 'tremor', 15, 2, b, ev);
    trigger(u, 'burst', b, ev);
    expect(u.hp).toBe(70);
    expect(u.staggerTurnsLeft).toBeGreaterThan(0);
    expect(u.statuses.tremor?.count).toBe(1);
  });

  it('tremor decays by 1 at turn end', () => {
    const b = bal();
    const u = makeUnit('enemy');
    const ev: BattleEvent[] = [];
    addStatus(u, 'tremor', 3, 1, b, ev);
    statusTurnEnd(u, b, ev);
    expect(u.statuses.tremor).toBeUndefined();
  });

  it('poise: crit chance = potency × 5%, crit ×1.2 and consumes count', () => {
    const b = bal();
    const atk = makeUnit('player', { basePower: 10, coinPower: 0, coinCount: 1 });
    const tgt = makeUnit('enemy', {}, { maxHp: 999, staggerThresholds: [] });
    const ev: BattleEvent[] = [];
    addStatus(atk, 'poise', 20, 2, b, ev); // 100%
    oneSidedAttack(atk, effectiveSkill(atk, 'S1'), 1, tgt, 0, createRng(1), b, ev);
    expect(ev.find((e) => e.t === 'coinHit')).toMatchObject({ crit: true, damage: 12 });
    expect(atk.statuses.poise?.count).toBe(1);
  });

  it('potency and count stack and are capped', () => {
    const b = bal();
    const u = makeUnit('enemy');
    const ev: BattleEvent[] = [];
    addStatus(u, 'bleed', 60, 60, b, ev);
    addStatus(u, 'bleed', 60, 60, b, ev);
    expect(u.statuses.bleed).toEqual({ potency: b.status.maxPotency, count: b.status.maxCount });
  });

  it('a brand-new status works from data alone', () => {
    const b = bal();
    b.statusDefs.push({ id: 'poison', name: '독', triggers: [{ on: 'turnEnd', action: 'damage' }], turnEndDecay: 0, description: 'test' });
    const u = makeUnit('enemy', {}, { maxHp: 50, staggerThresholds: [] });
    const ev: BattleEvent[] = [];
    addStatus(u, 'poison', 7, 3, b, ev);
    statusTurnEnd(u, b, ev);
    statusTurnEnd(u, b, ev);
    expect(u.hp).toBe(36);
    expect(u.statuses.poison?.count).toBe(1);
  });

  it('statuses reset at the start of each battle', () => {
    const b = bal();
    const u = makeUnit('player');
    addStatus(u, 'bleed', 3, 3, b, []);
    prepareForBattle(u, createRng(1), b);
    expect(u.statuses).toEqual({});
  });
});

describe('skill effects', () => {
  it('coin effects apply on hit; spend boosts power when enough charge', () => {
    const b = bal();
    const d = data();
    const sk = indexSkills(d.skills);
    const dodam = createUnit(d.players.find((p) => p.id === 'dodam')!, sk, 'player', b);
    const enemy = createUnit(d.enemies[0]!, sk, 'enemy', b);
    const ev: BattleEvent[] = [];
    const s3 = effectiveSkill(dodam, 'S3');
    expect(useSkill(s3, dodam, enemy, b, ev).basePower).toBe(s3.basePower); // no charge yet
    addStatus(dodam, 'charge', 0, 3, b, ev);
    const spend = s3.onUse!.find((e) => e.type === 'spend')!;
    expect(useSkill(s3, dodam, enemy, b, ev).basePower).toBe(s3.basePower + spend.power!);
    expect(dodam.statuses.charge).toBeUndefined();
  });
});

describe('defense skills', () => {
  const setup = (def: Partial<SkillDef>, atk: Partial<SkillDef> = { basePower: 10, coinPower: 0, coinCount: 2 }) => {
    const b = bal();
    const table = indexSkills([
      skill({ ...atk, id: 'a1' }), skill({ ...atk, id: 'a2' }), skill({ ...atk, id: 'a3' }),
      skill({ basePower: 1, coinPower: 0, coinCount: 1, id: 'w1' }), skill({ basePower: 1, coinPower: 0, coinCount: 1, id: 'w2' }), skill({ basePower: 1, coinPower: 0, coinCount: 1, id: 'w3' }),
      skill({ type: 'guard', ...def, id: 'd' }),
    ]);
    const enemy = createUnit(unitDef({ id: 'e', maxHp: 999, staggerThresholds: [], skills: { S1: 'a1', S2: 'a2', S3: 'a3' }, aiWeights: { defense: 0 } }), table, 'enemy', b);
    const player = createUnit(unitDef({ id: 'p', maxHp: 999, staggerThresholds: [], skills: { S1: 'w1', S2: 'w2', S3: 'w3', defense: 'd' } }), table, 'player', b);
    const { state } = createBattle(player, enemy, 3, b);
    return { b, state, player, enemy };
  };

  it('guard absorbs damage up to its shield', () => {
    const { b, state, player } = setup({ type: 'guard', basePower: 8, coinPower: 0, coinCount: 1 });
    expect(playerStatus(state).canDefend).toBe(true);
    const ev = takeTurn(state, 'defense', b);
    const g = ev.find((e) => e.t === 'guard');
    expect(g).toMatchObject({ shield: 12 }); // 8 × 1.5
    expect(player.hp).toBe(999 - (20 - 12));
  });

  it('evade: winning nullifies the coin and restores sanity; losing ends the evade', () => {
    const { b, state, player } = setup({ type: 'evade', basePower: 15, coinPower: 0, coinCount: 1 });
    const ev = takeTurn(state, 'defense', b);
    expect(ev.filter((e) => e.t === 'evade' && e.success)).toHaveLength(2);
    expect(player.hp).toBe(999);
    expect(player.sanity).toBe(b.defense.evadeSanity * 2);
    const weak = setup({ type: 'evade', basePower: 1, coinPower: 0, coinCount: 1 });
    const ev2 = takeTurn(weak.state, 'defense', weak.b);
    expect(ev2.filter((e) => e.t === 'evade')).toHaveLength(1); // fails once, then breaks
    expect(weak.player.hp).toBe(999 - 20);
  });

  it('counter turns an incoming attack into a clash', () => {
    const { b, state } = setup({ type: 'counter', basePower: 30, coinPower: 0, coinCount: 1 });
    const ev = takeTurn(state, 'defense', b);
    expect(ev.some((e) => e.t === 'counter')).toBe(true);
    expect(ev.find((e) => e.t === 'clashEnd')).toMatchObject({ winner: 'player' });
  });

  it('a defense with nobody attacking is wasted', () => {
    const { b, state, enemy } = setup({ type: 'guard', basePower: 8, coinPower: 0, coinCount: 1 });
    enemy.staggerTurnsLeft = 2;
    state.enemyIntent = null;
    const ev = takeTurn(state, 'defense', b);
    expect(ev.some((e) => e.t === 'defenseUnused')).toBe(true);
  });

  it('rejects defense when the unit has none', () => {
    const b = bal();
    const { state } = createBattle(makeUnit('player'), makeUnit('enemy'), 1, b);
    expect(playerStatus(state).canDefend).toBe(false);
    expect(() => takeTurn(state, 'defense', b)).toThrow(RangeError);
  });

  it('enemies with a defense weight sometimes choose defense', () => {
    const b = bal();
    const d = data();
    const sk = indexSkills(d.skills);
    let defended = 0;
    for (let s = 0; s < 60; s++) {
      const { state } = createBattle(createUnit(d.players[0]!, sk, 'player', b), createUnit(d.enemies.find((e) => e.id === 'rust')!, sk, 'enemy', b), s, b);
      if (state.enemyIntent === 'defense') defended++;
    }
    expect(defended).toBeGreaterThan(5);
    expect(defended).toBeLessThan(40);
  });
});

describe('status data validation', () => {
  it('flags unknown statuses in effects and bad triggers', () => {
    const d = data() as unknown as Record<'statuses' | 'skills' | 'players' | 'enemies' | 'rewards', Record<string, unknown>[]>;
    d.skills[0]!.coinEffects = [[{ type: 'apply', status: 'nope', potency: 1, count: 1 }]];
    d.statuses[0]!.triggers = [{ on: 'whenever', action: 'damage' }];
    const errs = validateGameData(d);
    expect(errs.some((e) => e.includes('unknown status nope'))).toBe(true);
    expect(errs.some((e) => e.includes('triggers[0]'))).toBe(true);
  });
});
