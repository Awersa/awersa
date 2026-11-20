import type { Balance } from './balance.ts';
import { applyDamage, computeDamage } from './damage.ts';
import { applyEffects } from './effects.ts';
import type { Rng } from './rng.ts';
import { changeSanity } from './sanity.ts';
import { clashPower, flipCoins, headsChance } from './skill.ts';
import { rollCrit, trigger } from './status.ts';
import { fireGifts } from './gifts.ts';
import type { BattleEvent, EffectiveSkill, UnitState } from './types.ts';

/** How the target is defending against this one-sided attack. */
export type DefenseCtx =
  | { kind: 'guard'; shield: number }
  | { kind: 'evade'; skill: EffectiveSkill; active: boolean };

/**
 * One-sided attack: throws `coins` remaining coins one at a time. Power accumulates (base,
 * then +coinPower per heads so far) and every coin hits with the current power.
 *
 * Per coin: attacker's `coinThrown` statuses (bleed) → flip → target evade check →
 * crit (poise) → damage (minus guard shield) → target's `hitTaken` statuses (rupture, sinking)
 * → that coin's effects.
 */
export function oneSidedAttack(
  attacker: UnitState,
  skill: EffectiveSkill,
  coins: number,
  target: UnitState,
  clashCount: number,
  rng: Rng,
  bal: Balance,
  events: BattleEvent[],
  defense?: DefenseCtx,
): void {
  let power = skill.basePower;
  const chance = headsChance(attacker, bal);
  let taken = 0; // damage that got through a guard
  let landed = 0; // coins that reached the guard
  for (let c = 0; c < coins; c++) {
    if (target.hp <= 0 || attacker.hp <= 0) break;
    trigger(attacker, 'coinThrown', bal, events);
    if (attacker.hp <= 0) break;

    const heads = rng.chance(chance);
    if (heads) power += skill.coinPower;
    const hitPower = Math.max(0, power);

    if (defense?.kind === 'evade' && defense.active) {
      const eh = flipCoins(defense.skill.coinCount, headsChance(target, bal), rng);
      const ep = clashPower(defense.skill, eh);
      const success = ep > hitPower;
      events.push({ t: 'evade', side: target.side, heads: eh, power: ep, attackPower: hitPower, success });
      if (success) {
        changeSanity(target, bal.defense.evadeSanity, bal, events);
        continue;
      }
      defense.active = false;
    }

    const crit = rollCrit(attacker, rng, bal, events);
    let dmg = computeDamage(
      { power: hitPower, skill, attacker, target, clashCount, extra: crit ? bal.status.critMultiplier : 1 },
      bal,
    );
    let blocked = 0;
    if (defense?.kind === 'guard' && defense.shield > 0) {
      blocked = Math.min(defense.shield, dmg);
      defense.shield -= blocked;
      dmg -= blocked;
    }
    if (defense?.kind === 'guard') {
      landed++;
      taken += dmg;
    }
    const after: BattleEvent[] = []; // stagger is reported after the hit that caused it
    applyDamage(target, dmg, bal, after);
    events.push(
      {
        t: 'coinHit',
        attacker: attacker.side,
        coin: c,
        heads,
        power: hitPower,
        damage: dmg,
        targetHp: target.hp,
        ...(crit ? { crit: true } : {}),
        ...(blocked ? { blocked } : {}),
      },
      ...after,
    );
    if (target.hp <= 0) break;
    // A hit fully absorbed by a guard carries none of its on-hit effects.
    if (blocked > 0 && dmg === 0) continue;
    trigger(target, 'hitTaken', bal, events);
    applyEffects(skill.coinEffects?.[c], attacker, target, bal, events);
    fireGifts(attacker, target, 'coinHit', rng, bal, events);
  }
  if (defense?.kind === 'guard') finishGuard(attacker, target, defense, landed, taken, bal, events);
}

/**
 * After the attack against a guard:
 *  - perfect guard (every landed hit fully absorbed) → +perfectGuardSanity
 *  - leftover shield × guardRetaliateMultiplier is dealt back to the attacker
 */
function finishGuard(
  attacker: UnitState,
  guarder: UnitState,
  g: Extract<DefenseCtx, { kind: 'guard' }>,
  landed: number,
  taken: number,
  bal: Balance,
  events: BattleEvent[],
): void {
  if (guarder.hp <= 0) return;
  if (landed > 0 && taken === 0) {
    events.push({ t: 'perfectGuard', side: guarder.side });
    changeSanity(guarder, bal.defense.perfectGuardSanity, bal, events);
  }
  const dmg = Math.floor(g.shield * bal.defense.guardRetaliateMultiplier);
  if (dmg > 0 && attacker.hp > 0) {
    const after: BattleEvent[] = [];
    applyDamage(attacker, dmg, bal, after);
    events.push({ t: 'guardRetaliate', side: guarder.side, damage: dmg, targetHp: attacker.hp }, ...after);
  }
}
