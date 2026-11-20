import { BALANCE } from '../config/balance.ts';
import { loadGameData } from '../data/index.ts';
import { indexSkills, type Balance, type GameData, type SkillTable } from '../core/index.ts';

export interface GameContext {
  bal: Balance;
  data: GameData;
  skills: SkillTable;
}

let ctx: GameContext | null = null;

/** Loads + validates game data once. Throws a readable error if JSON is broken. */
export function gameContext(): GameContext {
  if (!ctx) {
    const data = loadGameData();
    ctx = { bal: BALANCE, data, skills: indexSkills(data.skills) };
  }
  return ctx;
}
