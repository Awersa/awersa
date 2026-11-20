import type { Balance } from './balance.ts';
import type { Rng } from './rng.ts';
import { SKILL_SLOTS, type UnitDef, type UnitState } from './types.ts';
import { createUnit, type SkillTable } from './unit.ts';

export function isBossFloor(floor: number, bal: Balance): boolean {
  return bal.floor.bossEvery > 0 && floor % bal.floor.bossEvery === 0;
}

/** Picks an enemy definition for the floor (boss pool on boss floors). */
export function pickEnemyDef(enemies: readonly UnitDef[], floor: number, rng: Rng, bal: Balance): UnitDef {
  const boss = isBossFloor(floor, bal);
  const pool = enemies.filter((e) => (e.boss ?? false) === boss);
  return rng.pick(pool.length > 0 ? pool : enemies);
}

/** Creates an enemy scaled for the floor (floor 1 = unscaled). */
export function createEnemyForFloor(def: UnitDef, skills: SkillTable, floor: number, bal: Balance): UnitState {
  const u = createUnit(def, skills, 'enemy', bal);
  const f = Math.max(0, Math.floor(floor) - 1);
  const hpMult = (1 + bal.floor.hpPerFloor * f) * (u.boss ? bal.floor.bossHpMultiplier : 1);
  u.maxHp = u.hp = Math.max(1, Math.round(def.maxHp * hpMult));
  const base = bal.floor.basePowerEveryFloors > 0 ? Math.floor(f / bal.floor.basePowerEveryFloors) : 0;
  const coin = bal.floor.coinPowerEveryFloors > 0 ? Math.floor(f / bal.floor.coinPowerEveryFloors) : 0;
  if (base || coin) for (const s of SKILL_SLOTS) u.skillMods[s] = { basePower: base, coinPower: coin };
  u.offenseLevel += bal.floor.levelPerFloor * f;
  u.defenseLevel += bal.floor.levelPerFloor * f;
  return u;
}
