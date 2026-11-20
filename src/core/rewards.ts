import type { Balance } from './balance.ts';
import type { Rng } from './rng.ts';
import { powerRange, effectiveSkill } from './skill.ts';
import { SKILL_SLOTS, type SkillSlot, type UnitState } from './types.ts';

export const REWARD_KINDS = ['basePower', 'coinPower', 'heal', 'maxHp'] as const;
export type RewardKind = (typeof REWARD_KINDS)[number];

/**
 * Reward template (src/data/rewards.json).
 *  basePower: "최소 합 위력 증가" — +amount base power (raises both min and max).
 *  coinPower: "최대 합 위력 증가" — +amount per-heads power (raises max only).
 *  heal:      heal amount × maxHp (ratio).
 *  maxHp:     +amount max HP (and heals the same amount).
 */
export interface RewardDef {
  id: string;
  name: string;
  kind: RewardKind;
  amount: number;
  /** For skill rewards: every attack skill, or one random slot. */
  target?: 'all' | 'one';
  weight: number;
}

export interface RewardOffer {
  defId: string;
  name: string;
  kind: RewardKind;
  amount: number;
  /** Slots it applies to (skill rewards). */
  slots: SkillSlot[];
  description: string;
}

function describe(def: RewardDef, unit: UnitState, slots: SkillSlot[], bal: Balance): string {
  const range = (s: SkillSlot) => {
    const r = powerRange(effectiveSkill(unit, s));
    return `${r.min}~${r.max}`;
  };
  switch (def.kind) {
    case 'basePower':
    case 'coinPower': {
      const what = def.kind === 'basePower' ? `기본 위력 +${def.amount}` : `코인 위력 +${def.amount}`;
      const who =
        slots.length === SKILL_SLOTS.length
          ? '모든 공격 스킬'
          : slots.map((s) => `${s} ${unit.skills[s].name} (덱 ${bal.deck[s]}장)`).join(', ');
      return `${who}: ${what} (현재 ${slots.map(range).join(' / ')})`;
    }
    case 'heal':
      return `체력 ${Math.round(def.amount * 100)}% 회복 (${unit.hp}/${unit.maxHp})`;
    case 'maxHp':
      return `최대 체력 +${def.amount}`;
  }
}

/** Offers `bal.rewards.offerCount` distinct rewards (by def id), weighted. */
export function generateOffers(defs: readonly RewardDef[], unit: UnitState, rng: Rng, bal: Balance): RewardOffer[] {
  const pool = defs.filter((d) => d.weight > 0);
  const out: RewardOffer[] = [];
  while (out.length < bal.rewards.offerCount && pool.length > 0) {
    const def = rng.weighted(pool, (d) => d.weight);
    pool.splice(pool.indexOf(def), 1);
    const slots: SkillSlot[] =
      def.kind === 'basePower' || def.kind === 'coinPower'
        ? def.target === 'one'
          ? [rng.pick(SKILL_SLOTS)]
          : [...SKILL_SLOTS]
        : [];
    out.push({ defId: def.id, name: def.name, kind: def.kind, amount: def.amount, slots, description: describe(def, unit, slots, bal) });
  }
  return out;
}

export function applyReward(unit: UnitState, offer: RewardOffer): void {
  switch (offer.kind) {
    case 'basePower':
    case 'coinPower':
      for (const s of offer.slots) {
        const m = (unit.skillMods[s] ??= { basePower: 0, coinPower: 0 });
        m[offer.kind] += offer.amount;
      }
      return;
    case 'heal':
      unit.hp = Math.min(unit.maxHp, unit.hp + Math.round(unit.maxHp * offer.amount));
      return;
    case 'maxHp':
      unit.maxHp += offer.amount;
      unit.hp += offer.amount;
      return;
  }
}

/** Automatic recovery after a won battle (balance.rewards.healAfterBattle × max HP). */
export function recoverAfterBattle(unit: UnitState, bal: Balance): number {
  const before = unit.hp;
  unit.hp = Math.min(unit.maxHp, unit.hp + Math.round(unit.maxHp * Math.max(0, bal.rewards.healAfterBattle)));
  return unit.hp - before;
}
