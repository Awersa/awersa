import { chooseEnemyHandIndex } from './ai.ts';
import type { Balance } from './balance.ts';
import { resolveClash } from './clash.ts';
import { isStaggered, oneSidedAttack } from './damage.ts';
import { createRng, type Rng } from './rng.ts';
import { changeSanity, clashSanityDelta } from './sanity.ts';
import { effectiveSkill, powerRange } from './skill.ts';
import { cycleCard, prepareForBattle } from './unit.ts';
import type { BattleEvent, BattleState, Side, UnitState } from './types.ts';

/**
 * Battle flow (1 speed die each):
 *   createBattle → [turn starts, enemy intent is set] → takeTurn(choice) → … until state.outcome.
 * Every function returns the events that happened so the UI can animate them; the UI never computes rules.
 */

function withRng<T>(state: BattleState, fn: (rng: Rng) => T): T {
  const rng = createRng(0);
  rng.setState(state.rngState);
  const out = fn(rng);
  state.rngState = rng.getState();
  return out;
}

export function createBattle(
  player: UnitState,
  enemy: UnitState,
  seed: number,
  bal: Balance,
): { state: BattleState; events: BattleEvent[] } {
  const state: BattleState = { turn: 0, player, enemy, enemyIntent: null, outcome: null, rngState: seed >>> 0 };
  const events: BattleEvent[] = [];
  withRng(state, (rng) => {
    prepareForBattle(player, rng, bal);
    prepareForBattle(enemy, rng, bal);
    startTurn(state, rng, bal, events);
  });
  return { state, events };
}

function canAct(u: UnitState): boolean {
  return !isStaggered(u) && u.hp > 0;
}

function startTurn(state: BattleState, rng: Rng, bal: Balance, events: BattleEvent[]): void {
  state.turn++;
  for (const u of [state.player, state.enemy]) {
    if (u.panic === 'pending') u.panic = 'active';
    u.speed = rng.int(u.speedRange[0], u.speedRange[1]);
  }
  events.push({ t: 'turnStart', turn: state.turn, speed: { player: state.player.speed, enemy: state.enemy.speed } });

  state.enemyIntent = null;
  if (canAct(state.enemy) && state.enemy.hand.length > 0) {
    const idx = chooseEnemyHandIndex(state.enemy, rng);
    const slot = state.enemy.hand[idx]!;
    state.enemyIntent = slot;
    const sk = effectiveSkill(state.enemy, slot);
    events.push({ t: 'intent', slot, skill: sk.name, ...powerRange(sk) });
  }
}

/** What the player may do this turn. */
export function playerStatus(state: BattleState): {
  canChoose: boolean;
  reason: 'stagger' | 'panic' | null;
} {
  const p = state.player;
  if (state.outcome) return { canChoose: false, reason: null };
  if (isStaggered(p)) return { canChoose: false, reason: 'stagger' };
  if (p.panic === 'active') return { canChoose: false, reason: 'panic' };
  return { canChoose: true, reason: null };
}

/**
 * Resolves the current turn. `handIndex` is the player's chosen card; it is ignored (may be null)
 * when the player cannot choose (stagger / panic). Throws on an invalid index.
 */
export function takeTurn(state: BattleState, handIndex: number | null, bal: Balance): BattleEvent[] {
  if (state.outcome) throw new Error('takeTurn: battle is over');
  const events: BattleEvent[] = [];
  const { player, enemy } = state;
  const status = playerStatus(state);
  if (status.canChoose) {
    if (handIndex === null || !Number.isInteger(handIndex) || handIndex < 0 || handIndex >= player.hand.length) {
      throw new RangeError('takeTurn: invalid hand index');
    }
  }

  withRng(state, (rng) => {
    // --- decide actions ---
    let pIndex: number | null = null;
    if (status.canChoose) pIndex = handIndex;
    else if (status.reason === 'panic') {
      if (bal.sanity.panicBehavior === 'random' && player.hand.length > 0) pIndex = rng.int(0, player.hand.length - 1);
      else events.push({ t: 'cannotAct', side: 'player', reason: 'panic' });
    } else if (status.reason === 'stagger') events.push({ t: 'cannotAct', side: 'player', reason: 'stagger' });

    let eIndex: number | null = null;
    if (state.enemyIntent && canAct(enemy)) eIndex = enemy.hand.indexOf(state.enemyIntent);
    else if (isStaggered(enemy)) events.push({ t: 'cannotAct', side: 'enemy', reason: 'stagger' });

    const pSlot = pIndex !== null ? player.hand[pIndex]! : null;
    const eSlot = eIndex !== null && eIndex >= 0 ? enemy.hand[eIndex]! : null;
    if (pSlot) {
      events.push({ t: 'skillUse', side: 'player', slot: pSlot, skill: player.skills[pSlot].name, ...(status.reason === 'panic' ? { auto: 'panic' as const } : {}) });
      cycleCard(player, pIndex!, rng);
    }
    if (eSlot) {
      events.push({ t: 'skillUse', side: 'enemy', slot: eSlot, skill: enemy.skills[eSlot].name });
      cycleCard(enemy, eIndex!, rng);
    }

    // --- resolve ---
    if (pSlot && eSlot) {
      const pSkill = effectiveSkill(player, pSlot);
      const eSkill = effectiveSkill(enemy, eSlot);
      const res = resolveClash(player, pSkill, enemy, eSkill, rng, bal, events);
      const winner = res.winner === 'player' ? player : enemy;
      const loser = res.winner === 'player' ? enemy : player;
      changeSanity(winner, clashSanityDelta(true, res.clashCount, bal), bal, events);
      changeSanity(loser, clashSanityDelta(false, res.clashCount, bal), bal, events);
      winner.clashWins++;
      const needed = res.winner === 'player' ? bal.battle.playerClashWinsToWin : bal.battle.enemyClashWinsToWin;
      events.push({ t: 'clashWin', side: res.winner, wins: winner.clashWins, needed });
      oneSidedAttack(winner, res.winner === 'player' ? pSkill : eSkill, res.winnerCoins, loser, res.clashCount, rng, bal, events);
    } else if (pSlot) {
      const sk = effectiveSkill(player, pSlot);
      oneSidedAttack(player, sk, sk.coinCount, enemy, 0, rng, bal, events);
    } else if (eSlot) {
      const sk = effectiveSkill(enemy, eSlot);
      oneSidedAttack(enemy, sk, sk.coinCount, player, 0, rng, bal, events);
    }

    // --- outcome ---
    checkOutcome(state, bal, events);
    if (state.outcome) return;

    // --- turn end ---
    for (const u of [player, enemy]) {
      if (u.panic === 'active') {
        u.panic = 'none';
        u.sanity = bal.sanity.panicRecoverSanity;
        events.push({ t: 'panicRecover', side: u.side, sanity: u.sanity });
      }
      if (u.staggerTurnsLeft > 0 && --u.staggerTurnsLeft === 0) events.push({ t: 'staggerRecover', side: u.side });
    }
    startTurn(state, rng, bal, events);
  });
  return events;
}

function checkOutcome(state: BattleState, bal: Balance, events: BattleEvent[]): void {
  const end = (outcome: 'win' | 'lose', reason: 'enemyHp' | 'playerHp' | 'clashWins') => {
    state.outcome = outcome;
    state.enemyIntent = null;
    events.push({ t: 'battleEnd', outcome, reason });
  };
  if (state.enemy.hp <= 0) return end(bal.battle.enemyHpZero, 'enemyHp');
  if (state.player.hp <= 0) return end('lose', 'playerHp');
  const need: Record<Side, number | null> = {
    player: bal.battle.playerClashWinsToWin,
    enemy: bal.battle.enemyClashWinsToWin,
  };
  for (const side of ['player', 'enemy'] as const) {
    const n = need[side];
    if (n !== null && state[side].clashWins >= n) return end(side === 'player' ? 'win' : 'lose', 'clashWins');
  }
}
