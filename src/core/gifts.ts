import type { Balance } from './balance.ts';
import type { Rng } from './rng.ts';
import { changeSanity } from './sanity.ts';
import { addStatus } from './status.ts';
import type { BattleEvent, GiftDef, GiftTrigger, UnitState } from './types.ts';

export function giftDef(bal: Balance, id: string): GiftDef | undefined {
  return bal.giftDefs.find((g) => g.id === id);
}

/** Fires every gift `owner` holds for `on`. `other` is the opponent ("target" in actions). */
export function fireGifts(
  owner: UnitState,
  other: UnitState,
  on: GiftTrigger,
  rng: Rng,
  bal: Balance,
  events: BattleEvent[],
): void {
  for (const id of owner.gifts) {
    const g = giftDef(bal, id);
    if (!g || g.trigger !== on) continue;
    if (owner.hp <= 0) return;
    if (g.chance !== undefined && g.chance < 1 && !rng.chance(g.chance)) continue;
    events.push({ t: 'gift', side: owner.side, gift: g.name, trigger: on });
    for (const a of g.actions) {
      switch (a.type) {
        case 'apply':
          addStatus(a.target === 'self' ? owner : other, a.status, a.potency, a.count, bal, events);
          break;
        case 'heal': {
          const before = owner.hp;
          owner.hp = Math.min(owner.maxHp, owner.hp + a.amount);
          if (owner.hp > before) events.push({ t: 'heal', side: owner.side, amount: owner.hp - before, hp: owner.hp });
          break;
        }
        case 'sanity':
          changeSanity(owner, a.amount, bal, events);
          break;
      }
    }
  }
}
