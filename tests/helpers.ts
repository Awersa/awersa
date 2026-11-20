import balanceJson from '../src/data/balance.json';
import skillsJson from '../src/data/skills.json';
import charactersJson from '../src/data/characters.json';
import enemiesJson from '../src/data/enemies.json';
import rewardsJson from '../src/data/rewards.json';
import statusesJson from '../src/data/statuses.json';
import { createRng, type Rng } from '../src/core/rng.ts';
import type { Balance } from '../src/core/balance.ts';
import type { GameData } from '../src/core/validate.ts';
import { createUnit, indexSkills } from '../src/core/unit.ts';
import type { SkillDef, UnitDef, UnitState } from '../src/core/types.ts';

export const bal = (): Balance => structuredClone({ ...balanceJson, statusDefs: statusesJson }) as unknown as Balance;
export const data = (): GameData =>
  structuredClone({ statuses: statusesJson, skills: skillsJson, players: charactersJson, enemies: enemiesJson, rewards: rewardsJson }) as unknown as GameData;

/** RNG whose coin flips (chance) follow a script; everything else is a real seeded RNG. */
export function scriptedRng(flips: boolean[], seed = 1): Rng & { remaining: () => number } {
  const base = createRng(seed);
  let i = 0;
  return {
    ...base,
    chance: () => {
      if (i >= flips.length) throw new Error('scriptedRng: out of scripted flips');
      return flips[i++]!;
    },
    remaining: () => flips.length - i,
  };
}

export function skill(over: Partial<SkillDef> = {}): SkillDef {
  return { id: 'sk', name: '테스트', type: 'attack', damageType: 'slash', sin: 'wrath', basePower: 4, coinPower: 3, coinCount: 2, ...over };
}

export function unitDef(over: Partial<UnitDef> = {}): UnitDef {
  return {
    id: 'u',
    name: '유닛',
    maxHp: 100,
    staggerThresholds: [0.6, 0.3],
    hasSanity: true,
    speedRange: [3, 3],
    speedDiceCount: 1,
    resistances: { slash: 'normal', pierce: 'normal', blunt: 'normal' },
    offenseLevel: 30,
    defenseLevel: 30,
    skills: { S1: 's1', S2: 's2', S3: 's3' },
    ...over,
  };
}

/** Unit whose three slots all use the given skill shape. */
export function makeUnit(side: 'player' | 'enemy', sk: Partial<SkillDef> = {}, def: Partial<UnitDef> = {}, b = bal()): UnitState {
  const table = indexSkills([
    skill({ ...sk, id: 's1' }),
    skill({ ...sk, id: 's2' }),
    skill({ ...sk, id: 's3' }),
  ]);
  return createUnit(unitDef(def), table, side, b);
}
