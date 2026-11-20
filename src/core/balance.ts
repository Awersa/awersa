import type { ResistanceGrade, SkillSlot } from './types.ts';

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
  ai: { defaultWeights: Record<SkillSlot, number> };
  floor: {
    hpPerFloor: number;
    basePowerEveryFloors: number;
    coinPowerEveryFloors: number;
    levelPerFloor: number;
    bossEvery: number;
    bossHpMultiplier: number;
  };
  rewards: { offerCount: number };
  features: { sinAndEgo: boolean };
}
