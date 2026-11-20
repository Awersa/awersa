import type { Rng } from './rng.ts';
import type { SkillSlot, UnitState } from './types.ts';

/**
 * Enemy action for this turn.
 * - Pattern AI (bosses): follows `aiPattern` in a cycle. Pattern moves may use any skill, in hand or not.
 * - Otherwise: weighted random among the hand (+ 'defense' weighted by aiWeights.defense).
 */
export function chooseEnemyAction(enemy: UnitState, rng: Rng): SkillSlot | 'defense' {
  const pattern = enemy.aiPattern;
  if (pattern && pattern.length > 0) {
    const move = pattern[enemy.patternIndex % pattern.length]!;
    enemy.patternIndex++;
    if (move !== 'defense' || enemy.defenseSkill) return move;
  }
  const options: (number | 'defense')[] = enemy.hand.map((_, i) => i);
  if (enemy.defenseSkill && (enemy.aiWeights.defense ?? 0) > 0) options.push('defense');
  const pick = rng.weighted(options, (o) => (o === 'defense' ? (enemy.aiWeights.defense ?? 0) : (enemy.aiWeights[enemy.hand[o]!] ?? 1)));
  return pick === 'defense' ? 'defense' : enemy.hand[pick]!;
}
