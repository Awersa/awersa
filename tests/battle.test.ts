import { describe, expect, it } from 'vitest';
import { createBattle, playerStatus, takeTurn } from '../src/core/battle.ts';
import type { Balance } from '../src/core/balance.ts';
import type { BattleEvent, UnitState } from '../src/core/types.ts';
import { createEnemyForFloor } from '../src/core/floor.ts';
import { createUnit, indexSkills } from '../src/core/unit.ts';
import { bal, data, makeUnit } from './helpers.ts';

function play(state: ReturnType<typeof createBattle>['state'], b: Balance, pick = 0): BattleEvent[] {
  const all: BattleEvent[] = [];
  let n = 0;
  while (!state.outcome && n++ < 500) all.push(...takeTurn(state, playerStatus(state).canChoose ? pick : null, b));
  return all;
}

const sortedDeck = (u: UnitState) => [...u.hand, ...u.drawPile].sort();

describe('battle flow', () => {
  it('player wins after 3 clash wins (always stronger, no damage)', () => {
    const b = bal();
    const p = makeUnit('player', { basePower: 50, coinPower: 0, coinCount: 1 }, { maxHp: 9999 });
    const e = makeUnit('enemy', { basePower: 1, coinPower: 0, coinCount: 1 }, { maxHp: 9999, staggerThresholds: [] });
    const { state } = createBattle(p, e, 1, b);
    const ev = play(state, b);
    expect(state.outcome).toBe('win');
    expect(p.clashWins).toBe(3);
    expect(ev.at(-1)).toEqual({ t: 'battleEnd', outcome: 'win', reason: 'clashWins' });
  });

  it('player loses when the enemy reaches 3 clash wins', () => {
    const b = bal();
    const p = makeUnit('player', { basePower: 1, coinPower: 0, coinCount: 1 }, { maxHp: 9999, staggerThresholds: [] });
    const e = makeUnit('enemy', { basePower: 50, coinPower: 0, coinCount: 1 }, { maxHp: 9999 });
    const { state } = createBattle(p, e, 1, b);
    play(state, b);
    expect(state.outcome).toBe('lose');
    expect(e.clashWins).toBe(3);
  });

  it('optional duel rule: bringing the ENEMY to 0 HP can be configured as a loss', () => {
    const b = bal();
    b.battle.enemyHpZero = 'lose';
    const p = makeUnit('player', { basePower: 50, coinPower: 0, coinCount: 1 });
    const e = makeUnit('enemy', { basePower: 1, coinPower: 0, coinCount: 1 }, { maxHp: 30 });
    const { state } = createBattle(p, e, 1, b);
    const ev = play(state, b);
    expect(state.outcome).toBe('lose');
    expect(ev.at(-1)).toEqual({ t: 'battleEnd', outcome: 'lose', reason: 'enemyHp' });
    expect(e.hp).toBe(0);
  });

  it('default: whoever reaches 0 HP loses (enemy at 0 = player wins)', () => {
    const b = bal();
    const p = makeUnit('player', { basePower: 50, coinPower: 0, coinCount: 1 });
    const e = makeUnit('enemy', { basePower: 1, coinPower: 0, coinCount: 1 }, { maxHp: 30 });
    const { state } = createBattle(p, e, 1, b);
    play(state, b);
    expect(state.outcome).toBe('win');
  });

  it('player reaching 0 HP is a loss', () => {
    const b = bal();
    const p = makeUnit('player', { basePower: 1, coinPower: 0, coinCount: 1 }, { maxHp: 30 });
    const e = makeUnit('enemy', { basePower: 50, coinPower: 0, coinCount: 1 });
    const { state } = createBattle(p, e, 1, b);
    const ev = play(state, b);
    expect(state.outcome).toBe('lose');
    expect(ev.at(-1)).toMatchObject({ reason: 'playerHp' });
  });

  it('clash-win rules can be disabled (HP only)', () => {
    const b = bal();
    b.battle.playerClashWinsToWin = null;
    b.battle.enemyClashWinsToWin = null;
    const p = makeUnit('player', { basePower: 20, coinPower: 0, coinCount: 1 }, { maxHp: 9999 });
    const e = makeUnit('enemy', { basePower: 1, coinPower: 0, coinCount: 1 }, { maxHp: 200, staggerThresholds: [] });
    const { state } = createBattle(p, e, 1, b);
    play(state, b);
    expect(p.clashWins).toBeGreaterThan(3);
    expect(e.hp).toBe(0);
  });

  it('is fully deterministic for a seed', () => {
    const run = () => {
      const d = data();
      const sk = indexSkills(d.skills);
      const b = bal();
      const { state, events } = createBattle(createUnit(d.players[0]!, sk, 'player', b), createEnemyForFloor(d.enemies[0]!, sk, 1, b), 77, b);
      return [...events, ...play(state, b)];
    };
    expect(run()).toEqual(run());
  });

  it('rejects invalid hand indices and turns after the end', () => {
    const b = bal();
    const { state } = createBattle(makeUnit('player'), makeUnit('enemy'), 3, b);
    expect(() => takeTurn(state, 5, b)).toThrow(RangeError);
    expect(() => takeTurn(state, -1, b)).toThrow(RangeError);
    expect(() => takeTurn(state, 0.5, b)).toThrow(RangeError);
    expect(() => takeTurn(state, null, b)).toThrow(RangeError);
    play(state, b);
    expect(() => takeTurn(state, 0, b)).toThrow(/over/);
  });

  it('cycles cards without losing or duplicating any', () => {
    const b = bal();
    const p = makeUnit('player', {}, { maxHp: 9999 });
    const e = makeUnit('enemy', {}, { maxHp: 9999 });
    b.battle.playerClashWinsToWin = null;
    b.battle.enemyClashWinsToWin = null;
    const { state } = createBattle(p, e, 9, b);
    const start = sortedDeck(p);
    expect(start).toEqual(['S1', 'S1', 'S1', 'S2', 'S2', 'S3']);
    expect(p.hand).toHaveLength(b.deck.handSize);
    for (let i = 0; i < 10 && !state.outcome; i++) {
      takeTurn(state, playerStatus(state).canChoose ? i % 2 : null, b);
      expect(sortedDeck(p)).toEqual(start);
      expect(sortedDeck(e)).toEqual(start);
    }
  });

  it('enemy intent is shown before the player chooses and is the skill it uses', () => {
    const b = bal();
    const { state, events } = createBattle(makeUnit('player'), makeUnit('enemy'), 5, b);
    const intent = events.find((x) => x.t === 'intent');
    expect(intent).toBeDefined();
    expect(state.enemyIntent).not.toBeNull();
    const ev = takeTurn(state, 0, b);
    const used = ev.find((x) => x.t === 'skillUse' && x.side === 'enemy');
    expect(used?.t === 'skillUse' && used.slot).toBe(intent?.t === 'intent' && intent.slot);
  });
});

describe('stagger in battle', () => {
  it('staggered unit cannot act, then recovers at the end of the next turn', () => {
    const b = bal();
    b.battle.playerClashWinsToWin = null;
    b.battle.enemyClashWinsToWin = null;
    const p = makeUnit('player', { basePower: 30, coinPower: 0, coinCount: 1 }, { maxHp: 9999 });
    const e = makeUnit('enemy', { basePower: 1, coinPower: 0, coinCount: 1 }, { maxHp: 100, staggerThresholds: [0.75] });
    const { state } = createBattle(p, e, 1, b);
    const t1 = takeTurn(state, 0, b); // 30 dmg → 70 < 75 → stagger
    expect(t1.some((x) => x.t === 'stagger' && x.side === 'enemy')).toBe(true);
    expect(state.enemyIntent).toBeNull();
    const t2 = takeTurn(state, 0, b);
    expect(t2.some((x) => x.t === 'cannotAct' && x.side === 'enemy')).toBe(true);
    expect(t2.some((x) => x.t === 'clashRound')).toBe(false);
    // stagger damage is fatal (×2): 30 → 60
    expect(t2.find((x) => x.t === 'coinHit')).toMatchObject({ damage: 60 });
    expect(t2.some((x) => x.t === 'staggerRecover' && x.side === 'enemy')).toBe(true);
    expect(state.enemyIntent).not.toBeNull();
  });
});

describe('sanity & panic', () => {
  it('clash win/lose changes sanity (+10 + count / −5 − count)', () => {
    const b = bal();
    const p = makeUnit('player', { basePower: 50, coinPower: 0, coinCount: 1 }, { maxHp: 9999 });
    const e = makeUnit('enemy', { basePower: 1, coinPower: 0, coinCount: 1 }, { maxHp: 9999, hasSanity: true, staggerThresholds: [] });
    const { state } = createBattle(p, e, 1, b);
    takeTurn(state, 0, b);
    expect(p.sanity).toBe(11);
    expect(e.sanity).toBe(-6);
  });

  it('sanity is clamped to [-45, 45]', () => {
    const b = bal();
    const p = makeUnit('player', { basePower: 50, coinPower: 0, coinCount: 1 }, { maxHp: 9999 });
    const e = makeUnit('enemy', { basePower: 1, coinPower: 0, coinCount: 1 }, { maxHp: 9999, staggerThresholds: [] });
    b.battle.playerClashWinsToWin = null;
    const { state } = createBattle(p, e, 1, b);
    for (let i = 0; i < 8; i++) takeTurn(state, 0, b);
    expect(p.sanity).toBe(45);
  });

  it('panic at −45: next turn acts randomly, then sanity resets', () => {
    const b = bal();
    b.battle.enemyClashWinsToWin = null;
    const p = makeUnit('player', { basePower: 1, coinPower: 0, coinCount: 1 }, { maxHp: 9999, staggerThresholds: [] });
    const e = makeUnit('enemy', { basePower: 50, coinPower: 0, coinCount: 1 }, { maxHp: 9999 });
    const { state } = createBattle(p, e, 1, b);
    p.sanity = -40;
    const t1 = takeTurn(state, 0, b);
    expect(t1.some((x) => x.t === 'panic')).toBe(true);
    expect(playerStatus(state)).toEqual({ canChoose: false, reason: 'panic' });
    const t2 = takeTurn(state, null, b);
    expect(t2.some((x) => x.t === 'skillUse' && x.side === 'player' && x.auto === 'panic')).toBe(true);
    expect(t2.some((x) => x.t === 'panicRecover')).toBe(true);
    expect(playerStatus(state).canChoose).toBe(true);
  });
});
