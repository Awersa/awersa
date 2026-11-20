/**
 * Core battle types. Pure data — no Phaser / DOM.
 */

export const DAMAGE_TYPES = ['slash', 'pierce', 'blunt'] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

export const SINS = ['wrath', 'lust', 'sloth', 'gluttony', 'gloom', 'pride', 'envy'] as const;
export type Sin = (typeof SINS)[number];

export const SKILL_TYPES = ['attack', 'guard', 'evade', 'counter'] as const;
export type SkillType = (typeof SKILL_TYPES)[number];

export const SKILL_SLOTS = ['S1', 'S2', 'S3'] as const;
export type SkillSlot = (typeof SKILL_SLOTS)[number];

export const RESISTANCE_GRADES = ['fatal', 'weak', 'normal', 'endured', 'ineffective', 'immune'] as const;
export type ResistanceGrade = (typeof RESISTANCE_GRADES)[number];

export type Side = 'player' | 'enemy';
export const otherSide = (s: Side): Side => (s === 'player' ? 'enemy' : 'player');

/** Status effect identifiers are data (src/data/statuses.json); the engine treats them as strings. */
export type StatusId = string;

export interface StatusStack {
  potency: number;
  count: number;
}

/**
 * Skill effect (data).
 *  apply: add potency/count of a status to the target (default) or self.
 *  burst: trigger the status's "burst" behaviour on the target (e.g. tremor burst).
 *  spend: (onUse) spend `count` of a status on self; if available, +`power` base power for this use.
 */
export interface Effect {
  type: 'apply' | 'burst' | 'spend';
  status: StatusId;
  potency?: number;
  count?: number;
  power?: number;
  target?: 'self' | 'target';
}

/** When a status reacts, and what it does (src/data/statuses.json). */
export const STATUS_TRIGGERS = ['coinThrown', 'hitTaken', 'turnEnd', 'burst', 'coinHit'] as const;
export type StatusTrigger = (typeof STATUS_TRIGGERS)[number];
export const STATUS_ACTIONS = ['damage', 'sanityLoss', 'staggerDamage', 'crit', 'none'] as const;
export type StatusAction = (typeof STATUS_ACTIONS)[number];

export interface StatusDef {
  id: StatusId;
  name: string;
  /** Reactions. Each one that fires uses the potency and consumes `consume` count (default 1). */
  triggers: { on: StatusTrigger; action: StatusAction; consume?: number }[];
  /** Count lost at every turn end regardless of triggers. */
  turnEndDecay: number;
  description: string;
}

export interface SkillDef {
  id: string;
  name: string;
  type: SkillType;
  damageType: DamageType;
  sin: Sin;
  basePower: number;
  /** Added per heads. May be negative. */
  coinPower: number;
  coinCount: number;
  coinEffects?: Effect[][];
  onUse?: Effect[];
  levelOffset?: number;
}

export interface UnitDef {
  id: string;
  name: string;
  maxHp: number;
  /** HP ratios, descending, e.g. [0.7, 0.4]. */
  staggerThresholds: number[];
  hasSanity: boolean;
  speedRange: [number, number];
  speedDiceCount: number;
  resistances: Record<DamageType, ResistanceGrade>;
  offenseLevel: number;
  defenseLevel: number;
  /** Skill ids per slot. */
  skills: Record<SkillSlot, string> & { defense?: string };
  /** Enemy AI preference per slot (weighted random among the hand). */
  aiWeights?: Partial<Record<SkillSlot | 'defense', number>>;
  boss?: boolean;
  /** Asset manifest key (milestone 7). */
  asset?: string;
}

/** Permanent upgrades to a skill (from rewards). */
export interface SkillMod {
  basePower: number;
  coinPower: number;
  /** Extra coins (boss reward). Optional so older saves/mods stay valid. */
  coinCount?: number;
}

export type PanicState = 'none' | 'pending' | 'active';

export interface UnitState {
  side: Side;
  defId: string;
  name: string;
  hp: number;
  maxHp: number;
  hasSanity: boolean;
  sanity: number;
  staggerThresholds: number[];
  /** Index of the next threshold that can still trigger a stagger. */
  nextStaggerIndex: number;
  /** >0 while staggered; counts down at each turn end. */
  staggerTurnsLeft: number;
  panic: PanicState;
  resistances: Record<DamageType, ResistanceGrade>;
  offenseLevel: number;
  defenseLevel: number;
  speedRange: [number, number];
  speed: number;
  skills: Record<SkillSlot, SkillDef>;
  defenseSkill: SkillDef | null;
  skillMods: Partial<Record<SkillSlot, SkillMod>>;
  drawPile: SkillSlot[];
  hand: SkillSlot[];
  clashWins: number;
  aiWeights: Partial<Record<SkillSlot | 'defense', number>>;
  statuses: Record<StatusId, StatusStack>;
  boss: boolean;
}

export type BattleOutcome = 'win' | 'lose' | null;

export interface BattleState {
  turn: number;
  player: UnitState;
  enemy: UnitState;
  /** Enemy's chosen action for this turn (shown to the player as intent). */
  enemyIntent: SkillSlot | 'defense' | null;
  outcome: BattleOutcome;
  rngState: number;
}

/** Skill with permanent mods applied — what the engine actually uses. */
export interface EffectiveSkill extends SkillDef {
  slot: SkillSlot | 'defense';
}

export interface CoinFace {
  heads: boolean;
}

export type BattleEvent =
  | { t: 'turnStart'; turn: number; speed: Record<Side, number> }
  | { t: 'intent'; slot: SkillSlot | 'defense'; skill: string; min: number; max: number }
  | { t: 'skillUse'; side: Side; slot: SkillSlot | 'defense'; skill: string; auto?: 'panic' }
  | { t: 'cannotAct'; side: Side; reason: 'stagger' | 'panic' }
  | {
      t: 'clashRound';
      round: number;
      player: { heads: boolean[]; power: number; coinsLeft: number };
      enemy: { heads: boolean[]; power: number; coinsLeft: number };
      /** Side that lost a coin; null on a tie. */
      loser: Side | null;
    }
  | { t: 'clashEnd'; winner: Side; clashCount: number; tieBreak: boolean }
  | {
      t: 'coinHit';
      attacker: Side;
      coin: number;
      heads: boolean;
      power: number;
      damage: number;
      targetHp: number;
      crit?: boolean;
      /** Damage absorbed by a guard. */
      blocked?: number;
    }
  | { t: 'sanity'; side: Side; delta: number; value: number }
  | { t: 'stagger'; side: Side }
  | { t: 'staggerRecover'; side: Side }
  | { t: 'panic'; side: Side }
  | { t: 'panicRecover'; side: Side; sanity: number }
  | { t: 'clashWin'; side: Side; wins: number; needed: number | null }
  | { t: 'guard'; side: Side; skill: string; heads: boolean[]; shield: number }
  | { t: 'evade'; side: Side; heads: boolean[]; power: number; attackPower: number; success: boolean }
  | { t: 'counter'; side: Side; skill: string }
  | { t: 'defenseUnused'; side: Side; skill: string }
  | { t: 'statusApply'; side: Side; status: StatusId; potency: number; count: number }
  | { t: 'statusTrigger'; side: Side; status: StatusId; action: StatusAction; amount: number; hp: number }
  | { t: 'statusEnd'; side: Side; status: StatusId }
  | { t: 'spend'; side: Side; status: StatusId; count: number; power: number }
  | { t: 'battleEnd'; outcome: 'win' | 'lose'; reason: 'enemyHp' | 'playerHp' | 'clashWins' };
