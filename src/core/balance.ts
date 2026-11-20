import type { GiftDef, ResistanceGrade, SkillSlot, StatusDef } from './types.ts';

/** Shape of src/data/balance.json. The engine receives it as a parameter (never imports JSON). */
export interface Balance {
  coin: { baseHeadsChance: number; sanityToChance: number };
  sanity: {
    min: number;
    max: number;
    start: number;
    clashWin: number;
    clashLose: number;
    clashWinPerClashCount: number;
    clashLosePerClashCount: number;
    panicThreshold: number;
    panicBehavior: 'random' | 'skip';
    panicRecoverSanity: number;
  };
  clash: { bonusPerClash: number; maxTieRerolls: number };
  resistance: Record<ResistanceGrade, number>;
  level: { divisorConstant: number };
  stagger: { resistanceOverride: ResistanceGrade; recoverAfterTurns: number };
  deck: Record<SkillSlot, number> & { handSize: number };
  battle: {
    /** Player wins the battle after this many clash wins. null = disabled (HP only). */
    playerClashWinsToWin: number | null;
    /** Player loses the battle when the enemy reaches this many clash wins. null = disabled. */
    enemyClashWinsToWin: number | null;
    /** What happens when the ENEMY's HP reaches 0. 'lose' = duel rule: killing the opponent is a loss. */
    enemyHpZero: 'win' | 'lose';
    /** Damage numbers: minimum damage of a hit whose (power × multiplier) is > 0. */
    minHitDamage: number;
  };
  ai: { defaultWeights: Record<SkillSlot, number> & { defense?: number } };
  defense: {
    /** Guard shield = guard power × this. */
    guardShieldMultiplier: number;
    /** Sanity gained per successful evade. */
    evadeSanity: number;
    /** Leftover guard shield × this is dealt back to the attacker. 0 disables. */
    guardRetaliateMultiplier: number;
    /** Sanity gained when a guard absorbs every hit. */
    perfectGuardSanity: number;
  };
  status: {
    critMultiplier: number;
    /** Poise-style crit chance per potency (spec says potency% → 0.01; default 0.05). */
    critChancePerPotency: number;
    maxPotency: number;
    maxCount: number;
  };
  /** Status definitions, merged in from src/data/statuses.json when the game data loads. */
  statusDefs: StatusDef[];
  /** Gift definitions, merged in from src/data/gifts.json when the game data loads. */
  giftDefs: GiftDef[];
  floor: {
    hpPerFloor: number;
    basePowerEveryFloors: number;
    coinPowerEveryFloors: number;
    levelPerFloor: number;
    /** Accelerating growth: extra base power = floor((floor-1)² / this). 0 disables. Keeps endless runs finite. */
    basePowerAccelDivisor: number;
    bossEvery: number;
    bossHpMultiplier: number;
  };
  rewards: {
    offerCount: number;
    /** HP ratio of max HP recovered automatically after every won battle. */
    healAfterBattle: number;
    /** Coin-count rewards never raise a skill above this many coins. */
    maxCoinCount: number;
  };
  features: { sinAndEgo: boolean };
}
