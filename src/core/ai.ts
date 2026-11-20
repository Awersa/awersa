import type { Rng } from './rng.ts';
import type { UnitState } from './types.ts';

/**
 * Enemy action: a hand index, or 'defense' (weighted by aiWeights.defense when it has a defense skill).
 * Weighted random by slot. Boss patterns come later.
 */
export function chooseEnemyAction(enemy: UnitState, rng: Rng): number | 'defense' {
  const options: (number | 'defense')[] = enemy.hand.map((_, i) => i);
  if (enemy.defenseSkill && (enemy.aiWeights.defense ?? 0) > 0) options.push('defense');
  return rng.weighted(options, (o) => (o === 'defense' ? (enemy.aiWeights.defense ?? 0) : (enemy.aiWeights[enemy.hand[o]!] ?? 1)));
}
