import type { Balance } from './balance.ts';
import { applyDamage } from './damage.ts';
import type { Rng } from './rng.ts';
import { changeSanity } from './sanity.ts';
import type { BattleEvent, StatusAction, StatusDef, StatusId, StatusTrigger, UnitState } from './types.ts';

/**
 * Data-driven status effects. Each status (src/data/statuses.json) lists triggers
 * ("when") × actions ("what"), so new statuses can be added by data alone as long as
 * they combine existing triggers/actions.
 */

function def(bal: Balance, id: StatusId): StatusDef | undefined {
  return bal.statusDefs.find((d) => d.id === id);
}

export function statusName(bal: Balance, id: StatusId): string {
  return def(bal, id)?.name ?? id;
}

export function addStatus(
  u: UnitState,
  id: StatusId,
  potency: number,
  count: number,
  bal: Balance,
  events: BattleEvent[],
): void {
  if (!def(bal, id) || u.hp <= 0) return;
  const cur = u.statuses[id] ?? { potency: 0, count: 0 };
  const next = {
    potency: Math.min(bal.status.maxPotency, Math.max(0, cur.potency + potency)),
    count: Math.min(bal.status.maxCount, Math.max(0, cur.count + count)),
  };
  // A status needs both potency and count to exist (count-only statuses such as charge use potency 0+).
  if (next.count <= 0) {
    if (u.statuses[id]) remove(u, id, events);
    return;
  }
  u.statuses[id] = next;
  events.push({ t: 'statusApply', side: u.side, status: id, potency: next.potency, count: next.count });
}

function remove(u: UnitState, id: StatusId, events: BattleEvent[]): void {
  delete u.statuses[id];
  events.push({ t: 'statusEnd', side: u.side, status: id });
}

function consume(u: UnitState, id: StatusId, n: number, events: BattleEvent[]): void {
  const s = u.statuses[id];
  if (!s) return;
  s.count -= n;
  if (s.count <= 0) remove(u, id, events);
}

function act(u: UnitState, id: StatusId, action: StatusAction, potency: number, bal: Balance, events: BattleEvent[]): void {
  switch (action) {
    case 'damage': {
      const tail: BattleEvent[] = [];
      applyDamage(u, potency, bal, tail);
      events.push({ t: 'statusTrigger', side: u.side, status: id, action, amount: potency, hp: u.hp }, ...tail);
      return;
    }
    case 'sanityLoss': {
      if (u.hasSanity) {
        events.push({ t: 'statusTrigger', side: u.side, status: id, action, amount: potency, hp: u.hp });
        changeSanity(u, -potency, bal, events);
      } else act(u, id, 'damage', potency, bal, events);
      return;
    }
    case 'staggerDamage': {
      // Counts as `potency` extra HP loss for stagger checks only: crossing a threshold staggers early.
      const tail: BattleEvent[] = [];
      const realHp = u.hp;
      u.hp = Math.max(1, u.hp - potency);
      applyDamage(u, 0, bal, tail);
      u.hp = realHp;
      events.push({ t: 'statusTrigger', side: u.side, status: id, action, amount: potency, hp: u.hp }, ...tail);
      return;
    }
    case 'crit':
    case 'none':
      return;
  }
}

/** Fires every status on `u` that reacts to `on`. Returns nothing; damage/sanity are applied directly. */
export function trigger(u: UnitState, on: StatusTrigger, bal: Balance, events: BattleEvent[]): void {
  for (const id of Object.keys(u.statuses)) {
    const d = def(bal, id);
    const s = u.statuses[id];
    if (!d || !s) continue;
    for (const t of d.triggers) {
      if (t.on !== on || t.action === 'crit') continue;
      if (u.hp <= 0) return;
      act(u, id, t.action, s.potency, bal, events);
      consume(u, id, t.consume ?? 1, events);
      if (!u.statuses[id]) break;
    }
  }
}

/** Crit roll from statuses with a `coinHit → crit` trigger. Consumes count on a crit. */
export function rollCrit(u: UnitState, rng: Rng, bal: Balance, events: BattleEvent[]): boolean {
  for (const id of Object.keys(u.statuses)) {
    const d = def(bal, id);
    const s = u.statuses[id];
    if (!d || !s) continue;
    const t = d.triggers.find((x) => x.on === 'coinHit' && x.action === 'crit');
    if (!t) continue;
    if (rng.chance(s.potency * bal.status.critChancePerPotency)) {
      consume(u, id, t.consume ?? 1, events);
      return true;
    }
  }
  return false;
}

/** Turn end: `turnEnd` triggers (e.g. burn), then natural decay. */
export function statusTurnEnd(u: UnitState, bal: Balance, events: BattleEvent[]): void {
  trigger(u, 'turnEnd', bal, events);
  for (const id of Object.keys(u.statuses)) {
    const decay = def(bal, id)?.turnEndDecay ?? 0;
    if (decay > 0) consume(u, id, decay, events);
  }
}
