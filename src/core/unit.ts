import type { Balance } from './balance.ts';
import type { Rng } from './rng.ts';
import { SKILL_SLOTS, type SkillDef, type SkillSlot, type Side, type UnitDef, type UnitState } from './types.ts';

export type SkillTable = Readonly<Record<string, SkillDef>>;

export function indexSkills(skills: readonly SkillDef[]): SkillTable {
  const t: Record<string, SkillDef> = {};
  for (const s of skills) t[s.id] = s;
  return t;
}

function getSkill(table: SkillTable, id: string, owner: string): SkillDef {
  const s = Object.prototype.hasOwnProperty.call(table, id) ? table[id] : undefined;
  if (!s) throw new Error(`unit "${owner}" references unknown skill "${id}"`);
  return structuredClone(s);
}

export function createUnit(def: UnitDef, skills: SkillTable, side: Side, bal: Balance): UnitState {
  const slotSkills = {} as Record<SkillSlot, SkillDef>;
  for (const slot of SKILL_SLOTS) slotSkills[slot] = getSkill(skills, def.skills[slot], def.id);
  return {
    side,
    defId: def.id,
    name: def.name,
    hp: def.maxHp,
    maxHp: def.maxHp,
    hasSanity: def.hasSanity,
    sanity: bal.sanity.start,
    staggerThresholds: [...def.staggerThresholds].sort((a, b) => b - a),
    nextStaggerIndex: 0,
    staggerTurnsLeft: 0,
    panic: 'none',
    resistances: { ...def.resistances },
    offenseLevel: def.offenseLevel,
    defenseLevel: def.defenseLevel,
    speedRange: [def.speedRange[0], def.speedRange[1]],
    speed: 0,
    skills: slotSkills,
    defenseSkill: def.skills.defense ? getSkill(skills, def.skills.defense, def.id) : null,
    skillMods: {},
    drawPile: [],
    hand: [],
    clashWins: 0,
    aiWeights: { ...bal.ai.defaultWeights, ...def.aiWeights },
    statuses: {},
    gifts: [],
    aiPattern: def.aiPattern ? [...def.aiPattern] : null,
    patternIndex: 0,
    boss: def.boss ?? false,
  };
}

/** Resets per-battle state (HP and skill upgrades carry over between battles). */
export function prepareForBattle(u: UnitState, rng: Rng, bal: Balance): void {
  u.sanity = bal.sanity.start;
  u.panic = 'none';
  u.staggerTurnsLeft = 0;
  u.clashWins = 0;
  u.statuses = {};
  u.patternIndex = 0;
  // Thresholds already below current HP can't trigger again.
  u.nextStaggerIndex = u.staggerThresholds.filter((t) => u.hp < t * u.maxHp).length;
  const deck: SkillSlot[] = [];
  for (const slot of SKILL_SLOTS) for (let i = 0; i < bal.deck[slot]; i++) deck.push(slot);
  u.drawPile = rng.shuffle(deck);
  u.hand = u.drawPile.splice(0, Math.min(bal.deck.handSize, u.drawPile.length));
}

/** Used card goes back into the pile, pile is reshuffled, a replacement is drawn into the same hand slot. */
export function cycleCard(u: UnitState, handIndex: number, rng: Rng): void {
  const used = u.hand[handIndex];
  if (used === undefined) throw new RangeError('cycleCard: bad hand index');
  u.drawPile = rng.shuffle([...u.drawPile, used]);
  const next = u.drawPile.shift();
  if (next === undefined) throw new Error('cycleCard: empty pile');
  u.hand[handIndex] = next;
}
