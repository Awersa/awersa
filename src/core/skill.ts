import type { Balance } from './balance.ts';
import type { Rng } from './rng.ts';
import type { EffectiveSkill, SkillSlot, UnitState } from './types.ts';

/** Skill in a slot with the unit's permanent mods applied. */
export function effectiveSkill(unit: UnitState, slot: SkillSlot): EffectiveSkill {
  const def = unit.skills[slot];
  const mod = unit.skillMods[slot];
  return {
    ...def,
    slot,
    basePower: def.basePower + (mod?.basePower ?? 0),
    coinPower: def.coinPower + (mod?.coinPower ?? 0),
    coinCount: def.coinCount + (mod?.coinCount ?? 0),
  };
}

/** Power range of a skill if all coins are thrown (before clash bonuses). */
export function powerRange(skill: Pick<EffectiveSkill, 'basePower' | 'coinPower' | 'coinCount'>): {
  min: number;
  max: number;
} {
  const all = skill.coinPower * skill.coinCount;
  return {
    min: Math.max(0, skill.basePower + Math.min(0, all)),
    max: Math.max(0, skill.basePower + Math.max(0, all)),
  };
}

/** Heads probability: base + sanity × factor (units without sanity always use the base), clamped to [0, 1]. */
export function headsChance(unit: Pick<UnitState, 'hasSanity' | 'sanity'>, bal: Balance): number {
  const s = unit.hasSanity ? unit.sanity : 0;
  return Math.min(1, Math.max(0, bal.coin.baseHeadsChance + s * bal.coin.sanityToChance));
}

export function flipCoins(n: number, chance: number, rng: Rng): boolean[] {
  return Array.from({ length: n }, () => rng.chance(chance));
}

/** Clash power for a set of flips. Never below 0. */
export function clashPower(skill: Pick<EffectiveSkill, 'basePower' | 'coinPower'>, heads: boolean[]): number {
  const h = heads.filter(Boolean).length;
  return Math.max(0, skill.basePower + h * skill.coinPower);
}
