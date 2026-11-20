import { describe, expect, it } from 'vitest';
import { createBattle, takeTurn } from '../src/core/battle.ts';
import { chooseEnemyAction } from '../src/core/ai.ts';
import { applyReward, generateOffers } from '../src/core/rewards.ts';
import { createRng } from '../src/core/rng.ts';
import { createUnit, indexSkills } from '../src/core/unit.ts';
import { validateGameData } from '../src/core/validate.ts';
import { bal, data, makeUnit } from './helpers.ts';

describe('gifts', () => {
  it('clashWin gift applies a status to the opponent', () => {
    const b = bal();
    const p = makeUnit('player', { basePower: 50, coinPower: 0, coinCount: 1 }, { maxHp: 9999 });
    const e = makeUnit('enemy', { basePower: 1, coinPower: 0, coinCount: 1 }, { maxHp: 9999, staggerThresholds: [] });
    p.gifts = ['shrapnel'];
    const { state } = createBattle(p, e, 1, b);
    const ev = takeTurn(state, 0, b);
    expect(ev.some((x) => x.t === 'gift' && x.side === 'player')).toBe(true);
    // applied on clash win, then consumed by the follow-up hit
    expect(ev.some((x) => x.t === 'statusApply' && x.side === 'enemy' && x.status === 'rupture')).toBe(true);
    expect(ev.some((x) => x.t === 'statusTrigger' && x.side === 'enemy' && x.status === 'rupture')).toBe(true);
  });

  it('battleStart heal and self status', () => {
    const b = bal();
    const p = makeUnit('player', {}, { maxHp: 100 });
    p.hp = 50;
    p.gifts = ['bandage', 'calm_breath'];
    createBattle(p, makeUnit('enemy'), 1, b);
    expect(p.hp).toBe(60);
    expect(p.statuses.poise).toEqual({ potency: 3, count: 3 });
  });

  it('turnStart sanity gift fires every turn', () => {
    const b = bal();
    const p = makeUnit('player', { basePower: 1, coinPower: 0, coinCount: 1 }, { maxHp: 9999, staggerThresholds: [] });
    const e = makeUnit('enemy', { basePower: 1, coinPower: 0, coinCount: 1 }, { maxHp: 9999, staggerThresholds: [] });
    p.gifts = ['fighting_spirit'];
    const { state } = createBattle(p, e, 1, b);
    expect(p.sanity).toBe(2);
    const ev = takeTurn(state, 0, b);
    expect(ev.filter((x) => x.t === 'gift')).toHaveLength(1);
  });

  it('gift offers never repeat an owned gift and vanish when all are owned', () => {
    const b = bal();
    const d = data();
    const u = createUnit(d.players[0]!, indexSkills(d.skills), 'player', b);
    for (let s = 0; s < 300; s++) {
      const offers = generateOffers(d.rewards, u, createRng(s), b);
      const g = offers.find((o) => o.kind === 'gift');
      if (g) {
        expect(u.gifts).not.toContain(g.giftId);
        applyReward(u, g, b);
      }
    }
    expect(u.gifts.length).toBe(b.giftDefs.length);
    expect(generateOffers(d.rewards, u, createRng(1), b).some((o) => o.kind === 'gift')).toBe(false);
  });

  it('shipped gifts are valid; broken gifts are rejected', () => {
    expect(validateGameData(data())).toEqual([]);
    const d = data() as unknown as Record<string, Record<string, unknown>[]>;
    d.gifts![0]!.trigger = 'sometimes';
    d.gifts![1]!.actions = [{ type: 'apply', status: 'nope', potency: 1, count: 1, target: 'target' }];
    const errs = validateGameData(d as never);
    expect(errs.some((x) => x.includes('trigger'))).toBe(true);
    expect(errs.some((x) => x.includes('unknown status nope'))).toBe(true);
  });
});

describe('boss pattern AI', () => {
  it('follows its pattern in a cycle, even for skills not in hand', () => {
    const b = bal();
    const d = data();
    const sk = indexSkills(d.skills);
    const boss = createUnit(d.enemies.find((e) => e.boss)!, sk, 'enemy', b);
    boss.hand = ['S1', 'S1'];
    const rng = createRng(1);
    const seq = Array.from({ length: boss.aiPattern!.length * 2 }, () => chooseEnemyAction(boss, rng));
    expect(seq).toEqual([...boss.aiPattern!, ...boss.aiPattern!]);
  });

  it('a pattern move outside the hand is still executed as announced', () => {
    const b = bal();
    const d = data();
    const sk = indexSkills(d.skills);
    const boss = createUnit(d.enemies.find((e) => e.boss)!, sk, 'enemy', b);
    const p = createUnit(d.players[0]!, sk, 'player', b);
    const { state } = createBattle(p, boss, 4, b);
    for (let t = 0; t < 6 && !state.outcome; t++) {
      const intent = state.enemyIntent;
      const ev = takeTurn(state, 0, b);
      const used = ev.find((x) => x.t === 'skillUse' && x.side === 'enemy');
      if (intent && used?.t === 'skillUse') expect(used.slot).toBe(intent);
    }
  });
});
