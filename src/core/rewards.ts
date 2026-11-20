import type { Balance } from './balance.ts';
import type { Rng } from './rng.ts';
import { effectiveSkill, powerRange } from './skill.ts';
import { SKILL_SLOTS, type SkillSlot, type UnitState } from './types.ts';

export const REWARD_KINDS = ['basePower', 'coinPower', 'coinCount', 'heal', 'maxHp', 'gift'] as const;
export type RewardKind = (typeof REWARD_KINDS)[number];
const SKILL_KINDS: readonly RewardKind[] = ['basePower', 'coinPower', 'coinCount'];

/**
 * Reward template (src/data/rewards.json).
 *  basePower: "최소 합 위력 증가" — +amount base power (raises both min and max).
 *  coinPower: "최대 합 위력 증가" — +amount per-heads power (raises max only).
 *  coinCount: +amount coins on a skill (capped by balance.rewards.maxCoinCount).
 *  heal:      heal amount × maxHp (ratio).
 *  maxHp:     +amount max HP (and heals the same amount).
 *  gift:      a random passive gift the player doesn't own yet (src/data/gifts.json).
 * bossOnly rewards never appear in the normal weighted pool: after a boss battle each one is
 * offered with probability `chance` (it replaces the last regular offer).
 */
export interface RewardDef {
  id: string;
  name: string;
  kind: RewardKind;
  amount: number;
  /** For skill rewards: every attack skill, or one random slot. */
  target?: 'all' | 'one';
  weight: number;
  bossOnly?: boolean;
  /** bossOnly: probability (0..1) of being offered after a boss. */
  chance?: number;
}

export interface RewardOffer {
  defId: string;
  name: string;
  kind: RewardKind;
  amount: number;
  /** Slots it applies to (skill rewards). */
  slots: SkillSlot[];
  description: string;
  /** Came from the boss-only pool (UI may highlight it). */
  special?: boolean;
  /** kind 'gift': which gift. */
  giftId?: string;
}

export function isSkillReward(kind: RewardKind): boolean {
  return SKILL_KINDS.includes(kind);
}

export function applyReward(unit: UnitState, offer: RewardOffer, bal?: Balance): void {
  switch (offer.kind) {
    case 'basePower':
    case 'coinPower':
      for (const s of offer.slots) {
        const m = (unit.skillMods[s] ??= { basePower: 0, coinPower: 0 });
        m[offer.kind] += offer.amount;
      }
      return;
    case 'coinCount':
      for (const s of offer.slots) {
        const m = (unit.skillMods[s] ??= { basePower: 0, coinPower: 0 });
        const cap = bal?.rewards.maxCoinCount ?? Infinity;
        const room = Math.max(0, cap - effectiveSkill(unit, s).coinCount);
        m.coinCount = (m.coinCount ?? 0) + Math.min(offer.amount, room);
      }
      return;
    case 'heal':
      unit.hp = Math.min(unit.maxHp, unit.hp + Math.round(unit.maxHp * offer.amount));
      return;
    case 'maxHp':
      unit.maxHp += offer.amount;
      unit.hp += offer.amount;
      return;
    case 'gift':
      if (offer.giftId && !unit.gifts.includes(offer.giftId)) unit.gifts.push(offer.giftId);
      return;
  }
}

/** Human-readable effect with before → after numbers. */
export function describeOffer(offer: Omit<RewardOffer, 'description'>, unit: UnitState, bal: Balance): string {
  const after = structuredClone(unit);
  applyReward(after, { ...offer, description: '' }, bal);
  const range = (u: UnitState, s: SkillSlot) => {
    const r = powerRange(effectiveSkill(u, s));
    return `${r.min}~${r.max}`;
  };
  switch (offer.kind) {
    case 'basePower':
    case 'coinPower':
    case 'coinCount': {
      const what =
        offer.kind === 'basePower'
          ? `기본 위력 +${offer.amount}`
          : offer.kind === 'coinPower'
            ? `코인 위력 +${offer.amount}`
            : `코인 +${offer.amount}개`;
      const lines = offer.slots.map((s) => {
        const coins =
          offer.kind === 'coinCount'
            ? ` · 코인 ${effectiveSkill(unit, s).coinCount}→${effectiveSkill(after, s).coinCount}개`
            : '';
        return `${s} ${unit.skills[s].name} (덱 ${bal.deck[s]}장): ${range(unit, s)} → ${range(after, s)}${coins}`;
      });
      const head = offer.slots.length === SKILL_SLOTS.length ? `모든 공격 스킬 ${what}` : what;
      return [head, ...lines].join('\n');
    }
    case 'heal':
      return `체력 ${Math.round(offer.amount * 100)}% 회복\nHP ${unit.hp} → ${after.hp} / ${unit.maxHp}`;
    case 'maxHp':
      return `최대 체력 +${offer.amount}\nHP ${unit.hp}/${unit.maxHp} → ${after.hp}/${after.maxHp}`;
    case 'gift':
      return `패시브 기프트\n${bal.giftDefs.find((g) => g.id === offer.giftId)?.description ?? ''}`;
  }
}

function makeOffer(def: RewardDef, unit: UnitState, rng: Rng, bal: Balance): RewardOffer | null {
  if (def.kind === 'heal' && unit.hp >= unit.maxHp) return null; // a no-op choice
  if (def.kind === 'gift') {
    const unowned = bal.giftDefs.filter((g) => !unit.gifts.includes(g.id));
    if (unowned.length === 0) return null;
    const g = rng.pick(unowned);
    const base = { defId: def.id, name: g.name, kind: def.kind, amount: 1, slots: [] as SkillSlot[], giftId: g.id };
    return { ...base, description: describeOffer(base, unit, bal) };
  }
  let slots: SkillSlot[] = [];
  if (isSkillReward(def.kind)) {
    let pool = [...SKILL_SLOTS];
    if (def.kind === 'coinCount') pool = pool.filter((s) => effectiveSkill(unit, s).coinCount < bal.rewards.maxCoinCount);
    if (pool.length === 0) return null;
    slots = def.target === 'one' ? [rng.pick(pool)] : pool;
  }
  const base = { defId: def.id, name: def.name, kind: def.kind, amount: def.amount, slots, ...(def.bossOnly ? { special: true } : {}) };
  return { ...base, description: describeOffer(base, unit, bal) };
}

/**
 * Offers `bal.rewards.offerCount` distinct rewards (by def id), weighted.
 * After a boss (`afterBoss`), each bossOnly reward is rolled against its `chance`.
 */
export function generateOffers(
  defs: readonly RewardDef[],
  unit: UnitState,
  rng: Rng,
  bal: Balance,
  afterBoss = false,
): RewardOffer[] {
  const pool = defs.filter((d) => !d.bossOnly && d.weight > 0);
  const out: RewardOffer[] = [];
  while (out.length < bal.rewards.offerCount && pool.length > 0) {
    const def = rng.weighted(pool, (d) => d.weight);
    pool.splice(pool.indexOf(def), 1);
    const offer = makeOffer(def, unit, rng, bal);
    if (offer) out.push(offer);
  }
  if (afterBoss) {
    let replace = out.length - 1; // special offers replace regular ones from the end
    for (const def of defs) {
      if (!def.bossOnly || !rng.chance(def.chance ?? 0)) continue;
      const offer = makeOffer(def, unit, rng, bal);
      if (!offer) continue;
      if (out.length < bal.rewards.offerCount) out.push(offer);
      else if (replace >= 0) out[replace--] = offer;
    }
  }
  return out;
}

/** Automatic recovery after a won battle (balance.rewards.healAfterBattle × max HP). */
export function recoverAfterBattle(unit: UnitState, bal: Balance): number {
  const before = unit.hp;
  unit.hp = Math.min(unit.maxHp, unit.hp + Math.round(unit.maxHp * Math.max(0, bal.rewards.healAfterBattle)));
  return unit.hp - before;
}
