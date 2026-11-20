import type { Balance } from './balance.ts';
import type { Rng } from './rng.ts';
import { clashPower, flipCoins, headsChance } from './skill.ts';
import type { BattleEvent, EffectiveSkill, Side, UnitState } from './types.ts';

export interface ClashResult {
  winner: Side;
  clashCount: number;
  /** Coins the winner still has for the one-sided attack. */
  winnerCoins: number;
  tieBreak: boolean;
}

/**
 * Clash loop:
 *   both sides throw all remaining coins → lower power loses one coin (tie: nobody, reroll)
 *   until one side has 0 coins.
 * Every round (ties included) counts toward clashCount.
 * Safety: after `maxTieRerolls` consecutive ties, a coin flip decides who loses a coin (logged as tieBreak).
 */
export function resolveClash(
  player: UnitState,
  playerSkill: EffectiveSkill,
  enemy: UnitState,
  enemySkill: EffectiveSkill,
  rng: Rng,
  bal: Balance,
  events: BattleEvent[],
): ClashResult {
  let pCoins = playerSkill.coinCount;
  let eCoins = enemySkill.coinCount;
  const pChance = headsChance(player, bal);
  const eChance = headsChance(enemy, bal);
  let round = 0;
  let ties = 0;
  let tieBreak = false;

  while (pCoins > 0 && eCoins > 0) {
    round++;
    const pHeads = flipCoins(pCoins, pChance, rng);
    const eHeads = flipCoins(eCoins, eChance, rng);
    const pPow = clashPower(playerSkill, pHeads);
    const ePow = clashPower(enemySkill, eHeads);
    let loser: Side | null = null;
    if (pPow > ePow) loser = 'enemy';
    else if (ePow > pPow) loser = 'player';
    else if (++ties >= bal.clash.maxTieRerolls) {
      loser = rng.chance(0.5) ? 'enemy' : 'player';
      tieBreak = true;
      ties = 0;
    }
    if (loser === 'enemy') eCoins--;
    if (loser === 'player') pCoins--;
    if (loser) ties = 0;
    events.push({
      t: 'clashRound',
      round,
      player: { heads: pHeads, power: pPow, coinsLeft: pCoins },
      enemy: { heads: eHeads, power: ePow, coinsLeft: eCoins },
      loser,
    });
  }

  const winner: Side = pCoins > 0 ? 'player' : 'enemy';
  events.push({ t: 'clashEnd', winner, clashCount: round, tieBreak });
  return { winner, clashCount: round, winnerCoins: winner === 'player' ? pCoins : eCoins, tieBreak };
}
