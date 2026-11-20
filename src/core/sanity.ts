import type { Balance } from './balance.ts';
import type { BattleEvent, UnitState } from './types.ts';

/** Changes sanity (clamped). Triggers pending panic at the threshold. Units without sanity are untouched. */
export function changeSanity(unit: UnitState, delta: number, bal: Balance, events: BattleEvent[]): void {
  if (!unit.hasSanity || delta === 0) return;
  const before = unit.sanity;
  unit.sanity = Math.min(bal.sanity.max, Math.max(bal.sanity.min, unit.sanity + delta));
  const applied = unit.sanity - before;
  if (applied !== 0) events.push({ t: 'sanity', side: unit.side, delta: applied, value: unit.sanity });
  if (unit.sanity <= bal.sanity.panicThreshold && unit.panic === 'none') {
    unit.panic = 'pending';
    events.push({ t: 'panic', side: unit.side });
  }
}

export function clashSanityDelta(won: boolean, clashCount: number, bal: Balance): number {
  return won
    ? bal.sanity.clashWin + bal.sanity.clashWinPerClashCount * clashCount
    : bal.sanity.clashLose + bal.sanity.clashLosePerClashCount * clashCount;
}
