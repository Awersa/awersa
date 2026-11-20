import { chooseEnemyAction } from './ai.ts';
import { oneSidedAttack } from './attack.ts';
import { useSkill } from './effects.ts';
import { fireGifts } from './gifts.ts';
import { statusTurnEnd } from './status.ts';
import type { Balance } from './balance.ts';
import { resolveClash } from './clash.ts';
import { isStaggered } from './damage.ts';
import { createRng, type Rng } from './rng.ts';
import { changeSanity, clashSanityDelta } from './sanity.ts';
import { clashPower, effectiveSkill, flipCoins, headsChance, powerRange } from './skill.ts';
import { cycleCard, prepareForBattle } from './unit.ts';
import type { BattleEvent, BattleState, EffectiveSkill, Side, SkillSlot, UnitState } from './types.ts';

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
    fireGifts(player, enemy, 'battleStart', rng, bal, events);
    fireGifts(enemy, player, 'battleStart', rng, bal, events);
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
  fireGifts(state.player, state.enemy, 'turnStart', rng, bal, events);
  fireGifts(state.enemy, state.player, 'turnStart', rng, bal, events);

  state.enemyIntent = null;
  if (canAct(state.enemy) && (state.enemy.hand.length > 0 || state.enemy.defenseSkill)) {
    const intent = chooseEnemyAction(state.enemy, rng);
    state.enemyIntent = intent;
    const sk = actionSkill(state.enemy, intent);
    events.push({ t: 'intent', slot: intent, skill: sk.name, ...powerRange(sk) });
  }
}

/** The skill behind an action (attack slot or the defense skill), with permanent mods. */
export function actionSkill(u: UnitState, action: SkillSlot | 'defense'): EffectiveSkill {
  if (action === 'defense') {
    if (!u.defenseSkill) throw new Error(`${u.name} has no defense skill`);
    return { ...u.defenseSkill, slot: 'defense' };
  }
  return effectiveSkill(u, action);
}

/** What the player may do this turn. */
export function playerStatus(state: BattleState): {
  canChoose: boolean;
  canDefend: boolean;
  reason: 'stagger' | 'panic' | null;
} {
  const p = state.player;
  if (state.outcome) return { canChoose: false, canDefend: false, reason: null };
  if (isStaggered(p)) return { canChoose: false, canDefend: false, reason: 'stagger' };
  if (p.panic === 'active') return { canChoose: false, canDefend: false, reason: 'panic' };
  return { canChoose: true, canDefend: p.defenseSkill !== null, reason: null };
}

export type PlayerChoice = number | 'defense' | null;

interface Action {
  unit: UnitState;
  skill: EffectiveSkill;
}

/**
 * Resolves the current turn. `choice` is a hand index or 'defense'; it is ignored (may be null)
 * when the player cannot choose (stagger / panic). Throws on an invalid choice.
 */
export function takeTurn(state: BattleState, choice: PlayerChoice, bal: Balance): BattleEvent[] {
  if (state.outcome) throw new Error('takeTurn: battle is over');
  const events: BattleEvent[] = [];
  const { player, enemy } = state;
  const status = playerStatus(state);
  if (status.canChoose) {
    const validCard = typeof choice === 'number' && Number.isInteger(choice) && choice >= 0 && choice < player.hand.length;
    const validDefense = choice === 'defense' && status.canDefend;
    if (!validCard && !validDefense) throw new RangeError('takeTurn: invalid choice');
  }

  withRng(state, (rng) => {
    // --- decide actions ---
    let pChoice: number | 'defense' | null = null;
    if (status.canChoose) pChoice = choice;
    else if (status.reason === 'panic') {
      if (bal.sanity.panicBehavior === 'random' && player.hand.length > 0) pChoice = rng.int(0, player.hand.length - 1);
      else events.push({ t: 'cannotAct', side: 'player', reason: 'panic' });
    } else if (status.reason === 'stagger') events.push({ t: 'cannotAct', side: 'player', reason: 'stagger' });

    // The enemy acts on its announced intent. A pattern move may use a skill that isn't in hand.
    let eChoice: number | 'defense' | SkillSlot | null = null;
    if (state.enemyIntent && canAct(enemy)) {
      if (state.enemyIntent === 'defense') eChoice = 'defense';
      else {
        const idx = enemy.hand.indexOf(state.enemyIntent);
        eChoice = idx >= 0 ? idx : state.enemyIntent;
      }
    } else if (isStaggered(enemy)) events.push({ t: 'cannotAct', side: 'enemy', reason: 'stagger' });

    const take = (u: UnitState, c: number | 'defense' | SkillSlot | null, panic: boolean): Action | null => {
      if (c === null) return null;
      const slot = typeof c === 'number' ? u.hand[c]! : c;
      const skill = actionSkill(u, slot);
      events.push({ t: 'skillUse', side: u.side, slot, skill: skill.name, ...(panic ? { auto: 'panic' as const } : {}) });
      if (typeof c === 'number') cycleCard(u, c, rng);
      return { unit: u, skill };
    };
    let p = take(player, pChoice, status.reason === 'panic');
    let e = take(enemy, eChoice, false);
    // onUse effects (spend charge, self buffs) — in speed order, player first on ties
    const order = player.speed >= enemy.speed ? [p, e] : [e, p];
    for (const a of order) {
      if (!a) continue;
      const other = a.unit === player ? enemy : player;
      const used = useSkill(a.skill, a.unit, other, bal, events);
      if (a === p) p = { ...p, skill: used };
      else e = { ...e!, skill: used };
    }

    resolve(state, p, e, rng, bal, events);

    // --- outcome ---
    checkOutcome(state, bal, events);
    if (state.outcome) return;

    // --- turn end ---
    for (const u of [player, enemy]) {
      statusTurnEnd(u, bal, events);
      if (u.panic === 'active') {
        u.panic = 'none';
        u.sanity = bal.sanity.panicRecoverSanity;
        events.push({ t: 'panicRecover', side: u.side, sanity: u.sanity });
      }
      if (u.staggerTurnsLeft > 0 && --u.staggerTurnsLeft === 0) events.push({ t: 'staggerRecover', side: u.side });
    }
    checkOutcome(state, bal, events); // turn-end damage (burn) can end the battle
    if (state.outcome) return;
    startTurn(state, rng, bal, events);
  });
  return events;
}

const isAttack = (a: Action | null): a is Action => a !== null && a.skill.type === 'attack';
const isDefense = (a: Action | null): a is Action => a !== null && a.skill.type !== 'attack';

function clash(a: Action, b: Action, rng: Rng, bal: Balance, events: BattleEvent[]): void {
  // resolveClash is written player-vs-enemy; keep that orientation.
  const [p, e] = a.unit.side === 'player' ? [a, b] : [b, a];
  const res = resolveClash(p.unit, p.skill, e.unit, e.skill, rng, bal, events);
  const win = res.winner === 'player' ? p : e;
  const lose = res.winner === 'player' ? e : p;
  changeSanity(win.unit, clashSanityDelta(true, res.clashCount, bal), bal, events);
  changeSanity(lose.unit, clashSanityDelta(false, res.clashCount, bal), bal, events);
  fireGifts(win.unit, lose.unit, 'clashWin', rng, bal, events);
  fireGifts(lose.unit, win.unit, 'clashLose', rng, bal, events);
  win.unit.clashWins++;
  const needed = res.winner === 'player' ? bal.battle.playerClashWinsToWin : bal.battle.enemyClashWinsToWin;
  events.push({ t: 'clashWin', side: res.winner, wins: win.unit.clashWins, needed });
  oneSidedAttack(win.unit, win.skill, res.winnerCoins, lose.unit, res.clashCount, rng, bal, events);
}

function resolve(state: BattleState, p: Action | null, e: Action | null, rng: Rng, bal: Balance, events: BattleEvent[]): void {
  if (isAttack(p) && isAttack(e)) return clash(p, e, rng, bal, events);

  const atk = isAttack(p) ? p : isAttack(e) ? e : null;
  const def = atk === p ? e : p;
  if (!atk) {
    // nobody attacked: defenses are wasted
    for (const d of [p, e]) if (isDefense(d)) events.push({ t: 'defenseUnused', side: d.unit.side, skill: d.skill.name });
    return;
  }
  const tgt = atk.unit === state.player ? state.enemy : state.player;

  if (isDefense(def)) {
    switch (def.skill.type) {
      case 'counter':
        events.push({ t: 'counter', side: def.unit.side, skill: def.skill.name });
        return clash(atk, def, rng, bal, events);
      case 'guard': {
        const heads = flipCoins(def.skill.coinCount, headsChance(def.unit, bal), rng);
        const shield = Math.floor(clashPower(def.skill, heads) * bal.defense.guardShieldMultiplier);
        events.push({ t: 'guard', side: def.unit.side, skill: def.skill.name, heads, shield });
        return oneSidedAttack(atk.unit, atk.skill, atk.skill.coinCount, def.unit, 0, rng, bal, events, { kind: 'guard', shield });
      }
      case 'evade':
        return oneSidedAttack(atk.unit, atk.skill, atk.skill.coinCount, def.unit, 0, rng, bal, events, {
          kind: 'evade',
          skill: def.skill,
          active: true,
        });
    }
  }
  oneSidedAttack(atk.unit, atk.skill, atk.skill.coinCount, tgt, 0, rng, bal, events);
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
