import type { Balance } from './balance.ts';
import type { Rng } from './rng.ts';
import { headsChance } from './skill.ts';
import type { BattleEvent, DamageType, EffectiveSkill, UnitState } from './types.ts';

export function isStaggered(u: UnitState): boolean {
  return u.staggerTurnsLeft > 0;
}

export function resistanceMultiplier(target: UnitState, type: DamageType, bal: Balance): number {
  const grade = isStaggered(target) ? bal.stagger.resistanceOverride : target.resistances[type];
  return bal.resistance[grade];
}

/** (atk − def) / (|atk − def| + C), added to the multiplier. Range (−1, 1). */
export function levelModifier(attackLevel: number, defenseLevel: number, bal: Balance): number {
  const diff = attackLevel - defenseLevel;
  return diff / (Math.abs(diff) + bal.level.divisorConstant);
}

export interface DamageInput {
  power: number;
  skill: Pick<EffectiveSkill, 'damageType' | 'levelOffset'>;
  attacker: UnitState;
  target: UnitState;
  clashCount: number;
  /** Extra multiplier from buffs/debuffs (milestone 5). */
  extra?: number;
}

export function computeDamage(i: DamageInput, bal: Balance): number {
  if (i.power <= 0) return 0;
  const resist = resistanceMultiplier(i.target, i.skill.damageType, bal);
  if (resist <= 0) return 0;
  const clashBonus = 1 + bal.clash.bonusPerClash * i.clashCount;
  const level = Math.max(
    0,
    1 + levelModifier(i.attacker.offenseLevel + (i.skill.levelOffset ?? 0), i.target.defenseLevel, bal),
  );
  const raw = i.power * resist * clashBonus * level * (i.extra ?? 1);
  if (raw <= 0) return 0;
  // Epsilon guards against float error (100 × 1.15 = 114.999…).
  return Math.max(bal.battle.minHitDamage, Math.floor(raw + 1e-9));
}

/** Applies damage and checks stagger thresholds. Several thresholds crossed at once = one stagger. */
export function applyDamage(target: UnitState, amount: number, bal: Balance, events: BattleEvent[]): void {
  target.hp = Math.max(0, target.hp - amount);
  let crossed = false;
  while (
    target.nextStaggerIndex < target.staggerThresholds.length &&
    target.hp < (target.staggerThresholds[target.nextStaggerIndex] as number) * target.maxHp
  ) {
    target.nextStaggerIndex++;
    crossed = true;
  }
  if (crossed && target.hp > 0 && !isStaggered(target)) {
    // +1 because the countdown also ticks at the end of the current turn.
    target.staggerTurnsLeft = bal.stagger.recoverAfterTurns + 1;
    events.push({ t: 'stagger', side: target.side });
  }
}

/**
 * One-sided attack: throws `coins` remaining coins one at a time. Power accumulates
 * (base, then +coinPower for each heads so far) and every coin hits with the current power.
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
): void {
  let power = skill.basePower;
  const chance = headsChance(attacker, bal);
  for (let c = 0; c < coins; c++) {
    if (target.hp <= 0) break;
    const heads = rng.chance(chance);
    if (heads) power += skill.coinPower;
    const hitPower = Math.max(0, power);
    const dmg = computeDamage({ power: hitPower, skill, attacker, target, clashCount }, bal);
    const after: BattleEvent[] = []; // stagger is reported after the hit that caused it
    applyDamage(target, dmg, bal, after);
    events.push({ t: 'coinHit', attacker: attacker.side, coin: c, heads, power: hitPower, damage: dmg, targetHp: target.hp }, ...after);
  }
}

/**
 * Upper bound of one-sided damage if every coin lands its best face (used for the
 * "lethal risk" warning: under the duel rule, killing the opponent loses the battle).
 */
export function maxOneSidedDamage(
  attacker: UnitState,
  skill: EffectiveSkill,
  coins: number,
  target: UnitState,
  clashCount: number,
  bal: Balance,
): number {
  let power = skill.basePower;
  let total = 0;
  for (let c = 0; c < coins; c++) {
    if (skill.coinPower > 0) power += skill.coinPower;
    total += computeDamage({ power: Math.max(0, power), skill, attacker, target, clashCount }, bal);
  }
  return total;
}
