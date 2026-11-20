import { REWARD_KINDS, type RewardDef } from './rewards.ts';
import {
  DAMAGE_TYPES,
  RESISTANCE_GRADES,
  SINS,
  SKILL_SLOTS,
  SKILL_TYPES,
  type SkillDef,
  type UnitDef,
} from './types.ts';

/**
 * Structural validation of game data JSON. Catches typos and bad numbers before they reach the
 * engine (e.g. NaN power, unknown skill ids, coinCount 0). Returns a list of human-readable errors.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min = -Infinity, max = Infinity): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isNum = (v: unknown, min = -Infinity, max = Infinity): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isStr = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isOneOf = <T extends string>(v: unknown, list: readonly T[]): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);
const ID = /^[a-z0-9_.-]{1,48}$/;

export function validateSkill(s: unknown, where: string): string[] {
  const e: string[] = [];
  if (!isObj(s)) return [`${where}: not an object`];
  if (!isStr(s.id) || !ID.test(s.id)) e.push(`${where}: bad id`);
  if (!isStr(s.name)) e.push(`${where}: bad name`);
  if (!isOneOf(s.type, SKILL_TYPES)) e.push(`${where}: bad type`);
  if (!isOneOf(s.damageType, DAMAGE_TYPES)) e.push(`${where}: bad damageType`);
  if (!isOneOf(s.sin, SINS)) e.push(`${where}: bad sin`);
  if (!isInt(s.basePower, 0, 999)) e.push(`${where}: basePower must be an integer 0..999`);
  if (!isInt(s.coinPower, -99, 99)) e.push(`${where}: coinPower must be an integer -99..99`);
  if (!isInt(s.coinCount, 1, 10)) e.push(`${where}: coinCount must be an integer 1..10`);
  if (s.levelOffset !== undefined && !isInt(s.levelOffset, -99, 99)) e.push(`${where}: bad levelOffset`);
  if (s.coinEffects !== undefined) {
    if (!Array.isArray(s.coinEffects) || s.coinEffects.some((c) => !Array.isArray(c)))
      e.push(`${where}: coinEffects must be an array of arrays`);
    else if (isInt(s.coinCount) && s.coinEffects.length > s.coinCount)
      e.push(`${where}: more coinEffects than coins`);
  }
  return e;
}

export function validateUnit(u: unknown, where: string, skills: ReadonlyMap<string, SkillDef>): string[] {
  const e: string[] = [];
  if (!isObj(u)) return [`${where}: not an object`];
  if (!isStr(u.id) || !ID.test(u.id)) e.push(`${where}: bad id`);
  if (!isStr(u.name)) e.push(`${where}: bad name`);
  if (!isInt(u.maxHp, 1, 99999)) e.push(`${where}: maxHp must be an integer 1..99999`);
  if (!Array.isArray(u.staggerThresholds) || u.staggerThresholds.some((t) => !isNum(t, 0, 1)))
    e.push(`${where}: staggerThresholds must be ratios in [0,1]`);
  if (typeof u.hasSanity !== 'boolean') e.push(`${where}: hasSanity must be boolean`);
  if (
    !Array.isArray(u.speedRange) ||
    u.speedRange.length !== 2 ||
    !isInt(u.speedRange[0], 0, 99) ||
    !isInt(u.speedRange[1], 0, 99) ||
    u.speedRange[0] > u.speedRange[1]
  )
    e.push(`${where}: speedRange must be [min,max] integers`);
  if (!isInt(u.speedDiceCount, 1, 5)) e.push(`${where}: speedDiceCount must be 1..5`);
  if (!isObj(u.resistances) || DAMAGE_TYPES.some((d) => !isOneOf((u.resistances as Obj)[d], RESISTANCE_GRADES)))
    e.push(`${where}: resistances must grade slash/pierce/blunt`);
  if (!isInt(u.offenseLevel, 0, 999) || !isInt(u.defenseLevel, 0, 999)) e.push(`${where}: bad levels`);
  if (!isObj(u.skills)) e.push(`${where}: skills missing`);
  else {
    for (const slot of SKILL_SLOTS) {
      const id = u.skills[slot];
      const sk = typeof id === 'string' ? skills.get(id) : undefined;
      if (!sk) e.push(`${where}: ${slot} references unknown skill ${String(id)}`);
      else if (sk.type !== 'attack') e.push(`${where}: ${slot} must be an attack skill`);
    }
    const d = u.skills.defense;
    if (d !== undefined) {
      const sk = typeof d === 'string' ? skills.get(d) : undefined;
      if (!sk) e.push(`${where}: defense references unknown skill ${String(d)}`);
      else if (sk.type === 'attack') e.push(`${where}: defense skill cannot be an attack`);
    }
  }
  if (u.aiWeights !== undefined) {
    if (!isObj(u.aiWeights) || Object.entries(u.aiWeights).some(([k, v]) => !isOneOf(k, SKILL_SLOTS) || !isNum(v, 0, 1000)))
      e.push(`${where}: bad aiWeights`);
  }
  if (u.boss !== undefined && typeof u.boss !== 'boolean') e.push(`${where}: boss must be boolean`);
  return e;
}

export function validateReward(r: unknown, where: string): string[] {
  const e: string[] = [];
  if (!isObj(r)) return [`${where}: not an object`];
  if (!isStr(r.id) || !ID.test(r.id)) e.push(`${where}: bad id`);
  if (!isStr(r.name)) e.push(`${where}: bad name`);
  if (!isOneOf(r.kind, REWARD_KINDS)) e.push(`${where}: bad kind`);
  if (!isNum(r.amount, 0, 9999)) e.push(`${where}: bad amount`);
  if (r.kind === 'heal' && !isNum(r.amount, 0, 1)) e.push(`${where}: heal amount is a ratio 0..1`);
  if ((r.kind === 'basePower' || r.kind === 'coinPower' || r.kind === 'coinCount' || r.kind === 'maxHp') && !isInt(r.amount))
    e.push(`${where}: amount must be an integer`);
  if (r.bossOnly !== undefined && typeof r.bossOnly !== 'boolean') e.push(`${where}: bossOnly must be boolean`);
  if (r.chance !== undefined && !isNum(r.chance, 0, 1)) e.push(`${where}: chance must be 0..1`);
  if (r.bossOnly === true && r.chance === undefined) e.push(`${where}: bossOnly reward needs a chance`);
  if (r.target !== undefined && r.target !== 'all' && r.target !== 'one') e.push(`${where}: bad target`);
  if (!isNum(r.weight, 0, 1000)) e.push(`${where}: bad weight`);
  return e;
}

export interface GameData {
  skills: SkillDef[];
  players: UnitDef[];
  enemies: UnitDef[];
  rewards: RewardDef[];
}

export function validateGameData(d: { skills: unknown; players: unknown; enemies: unknown; rewards: unknown }): string[] {
  const errors: string[] = [];
  const skills = new Map<string, SkillDef>();
  const arr = (v: unknown, name: string): unknown[] => {
    if (!Array.isArray(v)) {
      errors.push(`${name}: must be an array`);
      return [];
    }
    return v;
  };
  const dup = (ids: unknown[], name: string) => {
    const seen = new Set<unknown>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${name}: duplicate id ${String(id)}`);
      seen.add(id);
    }
  };

  const sk = arr(d.skills, 'skills');
  sk.forEach((s, i) => {
    const errs = validateSkill(s, `skills[${i}]`);
    errors.push(...errs);
    if (errs.length === 0) skills.set((s as SkillDef).id, s as SkillDef);
  });
  dup(sk.map((s) => (isObj(s) ? s.id : undefined)), 'skills');

  const players = arr(d.players, 'players');
  players.forEach((u, i) => errors.push(...validateUnit(u, `players[${i}]`, skills)));
  if (players.length === 0) errors.push('players: need at least one');
  const enemies = arr(d.enemies, 'enemies');
  enemies.forEach((u, i) => errors.push(...validateUnit(u, `enemies[${i}]`, skills)));
  if (!enemies.some((u) => isObj(u) && !u.boss)) errors.push('enemies: need at least one non-boss');
  dup([...players, ...enemies].map((u) => (isObj(u) ? u.id : undefined)), 'units');

  const rewards = arr(d.rewards, 'rewards');
  rewards.forEach((r, i) => errors.push(...validateReward(r, `rewards[${i}]`)));
  dup(rewards.map((r) => (isObj(r) ? r.id : undefined)), 'rewards');
  return errors;
}
