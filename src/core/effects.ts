import type { Balance } from './balance.ts';
import { addStatus, trigger } from './status.ts';
import type { BattleEvent, Effect, EffectiveSkill, UnitState } from './types.ts';

/** Applies a list of skill effects from `user` (coin hit effects or onUse effects). */
export function applyEffects(
  effects: readonly Effect[] | undefined,
  user: UnitState,
  target: UnitState,
  bal: Balance,
  events: BattleEvent[],
): void {
  for (const e of effects ?? []) {
    const who = e.target === 'self' ? user : target;
    switch (e.type) {
      case 'apply':
        addStatus(who, e.status, e.potency ?? 0, e.count ?? 0, bal, events);
        break;
      case 'burst':
        if (who.statuses[e.status]) trigger(who, 'burst', bal, events);
        break;
      case 'spend':
        break; // handled by useSkill (it changes the skill's power for this use)
    }
  }
}

/**
 * Called when a skill is used: resolves `spend` effects (may raise this use's base power) and
 * applies the other onUse effects. Returns the skill as it will be used this turn.
 */
export function useSkill(skill: EffectiveSkill, user: UnitState, target: UnitState, bal: Balance, events: BattleEvent[]): EffectiveSkill {
  const out = { ...skill };
  for (const e of skill.onUse ?? []) {
    if (e.type !== 'spend') continue;
    const have = user.statuses[e.status]?.count ?? 0;
    const need = e.count ?? 1;
    if (have < need) continue;
    const s = user.statuses[e.status]!;
    s.count -= need;
    if (s.count <= 0) {
      delete user.statuses[e.status];
      events.push({ t: 'statusEnd', side: user.side, status: e.status });
    }
    out.basePower += e.power ?? 0;
    events.push({ t: 'spend', side: user.side, status: e.status, count: need, power: e.power ?? 0 });
  }
  applyEffects(skill.onUse, user, target, bal, events);
  return out;
}
