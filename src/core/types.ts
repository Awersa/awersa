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

/** Status / skill effect. Interpreted from milestone 5 on; carried as data until then. */
export interface Effect {
  type: string;
  potency?: number;
  count?: number;
  target?: 'self' | 'target';
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
  aiWeights?: Partial<Record<SkillSlot, number>>;
  boss?: boolean;
  /** Asset manifest key (milestone 7). */
  asset?: string;
}

/** Permanent upgrades to a skill (from rewards). */
export interface SkillMod {
  basePower: number;
  coinPower: number;
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
  aiWeights: Partial<Record<SkillSlot, number>>;
  boss: boolean;
}

export type BattleOutcome = 'win' | 'lose' | null;

export interface BattleState {
  turn: number;
  player: UnitState;
  enemy: UnitState;
  /** Enemy's chosen slot for this turn (shown to the player as intent). */
  enemyIntent: SkillSlot | null;
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
  | { t: 'intent'; slot: SkillSlot; skill: string; min: number; max: number }
  | { t: 'skillUse'; side: Side; slot: SkillSlot; skill: string; auto?: 'panic' }
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
    }
  | { t: 'sanity'; side: Side; delta: number; value: number }
  | { t: 'stagger'; side: Side }
  | { t: 'staggerRecover'; side: Side }
  | { t: 'panic'; side: Side }
  | { t: 'panicRecover'; side: Side; sanity: number }
  | { t: 'clashWin'; side: Side; wins: number; needed: number | null }
  | { t: 'battleEnd'; outcome: 'win' | 'lose'; reason: 'hp' | 'clashWins' };
