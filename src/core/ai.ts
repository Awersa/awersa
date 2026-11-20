import type { Rng } from './rng.ts';
import type { UnitState } from './types.ts';

/** Returns the hand index the enemy will use (weighted random by slot). Boss patterns come later. */
export function chooseEnemyHandIndex(enemy: UnitState, rng: Rng): number {
  const indices = enemy.hand.map((_, i) => i);
  return rng.weighted(indices, (i) => enemy.aiWeights[enemy.hand[i]!] ?? 1);
}
