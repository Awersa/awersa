import {
  SKILL_SLOTS,
  createEnemyForFloor,
  createUnit,
  describeOffer,
  type Balance,
  type BattleState,
  type GameData,
  type PanicState,
  type RewardOffer,
  type SkillMod,
  type SkillSlot,
  type SkillTable,
  type StatusStack,
  type UnitState,
} from '../core/index.ts';

/**
 * Run save format (v1).
 *
 * Security / robustness: a save is untrusted input (anyone can edit localStorage). It therefore
 * holds only ids and numbers — never skill definitions, names or text — and is rebuilt from the
 * shipped game data on load. Every field is type- and range-checked; unknown ids, wrong shapes or
 * out-of-range numbers reject the whole save (the game then simply starts fresh). Status and gift
 * ids are looked up against the data, so keys like "__proto__" can never be written into objects.
 */

export const SAVE_VERSION = 1;

interface UnitDyn {
  hp: number;
  maxHp: number;
  sanity: number;
  nextStaggerIndex: number;
  staggerTurnsLeft: number;
  panic: PanicState;
  speed: number;
  drawPile: SkillSlot[];
  hand: SkillSlot[];
  clashWins: number;
  statuses: [string, number, number][];
  patternIndex: number;
}

export interface SaveV1 {
  v: 1;
  character: string;
  floor: number;
  kills: number;
  rng: number;
  player: { hp: number; maxHp: number; mods: [SkillSlot, number, number, number][]; gifts: string[] };
  battle: null | {
    enemy: string;
    turn: number;
    rng: number;
    intent: SkillSlot | 'defense' | null;
    player: UnitDyn;
    enemy_: UnitDyn;
  };
  reward: null | { healed: number; offers: { def: string; slots: SkillSlot[]; gift?: string }[] };
}

/** What a run looks like once rebuilt from a save. */
export interface RunSnapshot {
  characterId: string;
  floor: number;
  kills: number;
  rngState: number;
  player: UnitState;
  battle: { enemyId: string; state: BattleState } | null;
  reward: { healed: number; offers: RewardOffer[] } | null;
}

// ------------------------------------------------------------------ serialize

function dyn(u: UnitState): UnitDyn {
  return {
    hp: u.hp,
    maxHp: u.maxHp,
    sanity: u.sanity,
    nextStaggerIndex: u.nextStaggerIndex,
    staggerTurnsLeft: u.staggerTurnsLeft,
    panic: u.panic,
    speed: u.speed,
    drawPile: [...u.drawPile],
    hand: [...u.hand],
    clashWins: u.clashWins,
    statuses: Object.entries(u.statuses).map(([id, s]) => [id, s.potency, s.count]),
    patternIndex: u.patternIndex,
  };
}

export function serializeRun(s: RunSnapshot): SaveV1 {
  const p = s.player;
  return {
    v: 1,
    character: s.characterId,
    floor: s.floor,
    kills: s.kills,
    rng: s.rngState,
    player: {
      hp: p.hp,
      maxHp: p.maxHp,
      mods: SKILL_SLOTS.filter((k) => p.skillMods[k]).map((k) => {
        const m = p.skillMods[k]!;
        return [k, m.basePower, m.coinPower, m.coinCount ?? 0];
      }),
      gifts: [...p.gifts],
    },
    battle: s.battle
      ? {
          enemy: s.battle.enemyId,
          turn: s.battle.state.turn,
          rng: s.battle.state.rngState,
          intent: s.battle.state.enemyIntent,
          player: dyn(s.battle.state.player),
          enemy_: dyn(s.battle.state.enemy),
        }
      : null,
    reward: s.reward
      ? {
          healed: s.reward.healed,
          offers: s.reward.offers.map((o) => ({ def: o.defId, slots: [...o.slots], ...(o.giftId ? { gift: o.giftId } : {}) })),
        }
      : null,
  };
}

// ------------------------------------------------------------------ validate + rebuild

class Invalid extends Error {}
const fail = (why: string): never => {
  throw new Invalid(why);
};
type Obj = Record<string, unknown>;
const obj = (v: unknown, w: string): Obj => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : fail(`${w}: object`));
const arr = (v: unknown, w: string, max: number): unknown[] => (Array.isArray(v) && v.length <= max ? v : fail(`${w}: array`));
const int = (v: unknown, w: string, min: number, max: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fail(`${w}: int ${min}..${max}`);
const slot = (v: unknown, w: string): SkillSlot => ((SKILL_SLOTS as readonly unknown[]).includes(v) ? (v as SkillSlot) : fail(`${w}: slot`));
const oneOf = <T extends string>(v: unknown, list: readonly T[], w: string): T => (list.includes(v as T) ? (v as T) : fail(`${w}: enum`));

const MAX = 1_000_000;

function applyDyn(u: UnitState, raw: unknown, w: string, bal: Balance, deckSize: number): void {
  const d = obj(raw, w);
  u.maxHp = int(d.maxHp, `${w}.maxHp`, 1, MAX);
  u.hp = int(d.hp, `${w}.hp`, 1, u.maxHp); // a saved battle is never already lost
  u.sanity = int(d.sanity, `${w}.sanity`, bal.sanity.min, bal.sanity.max);
  u.nextStaggerIndex = int(d.nextStaggerIndex, `${w}.nextStaggerIndex`, 0, u.staggerThresholds.length);
  u.staggerTurnsLeft = int(d.staggerTurnsLeft, `${w}.staggerTurnsLeft`, 0, 99);
  u.panic = oneOf(d.panic, ['none', 'pending', 'active'] as const, `${w}.panic`);
  u.speed = int(d.speed, `${w}.speed`, 0, 999);
  u.drawPile = arr(d.drawPile, `${w}.drawPile`, deckSize).map((x, i) => slot(x, `${w}.drawPile[${i}]`));
  u.hand = arr(d.hand, `${w}.hand`, deckSize).map((x, i) => slot(x, `${w}.hand[${i}]`));
  if (u.drawPile.length + u.hand.length !== deckSize) fail(`${w}: deck size`);
  u.clashWins = int(d.clashWins, `${w}.clashWins`, 0, MAX);
  u.patternIndex = int(d.patternIndex, `${w}.patternIndex`, 0, MAX);
  const statuses: Record<string, StatusStack> = {};
  for (const [i, e] of arr(d.statuses, `${w}.statuses`, 50).entries()) {
    const t = arr(e, `${w}.statuses[${i}]`, 3);
    const def = bal.statusDefs.find((s) => s.id === t[0]);
    if (!def) fail(`${w}.statuses[${i}]: unknown status`);
    statuses[def!.id] = {
      potency: int(t[1], `${w}.statuses[${i}].potency`, 0, bal.status.maxPotency),
      count: int(t[2], `${w}.statuses[${i}].count`, 1, bal.status.maxCount),
    };
  }
  u.statuses = statuses;
}

/**
 * Validates an untrusted save and rebuilds the run from game data.
 * Returns null (never throws) when the save is missing, from another version, or invalid.
 */
export function parseSave(raw: unknown, data: GameData, skills: SkillTable, bal: Balance): RunSnapshot | null {
  try {
    const s = obj(raw, 'save');
    if (s.v !== SAVE_VERSION) return null;
    const def = data.players.find((p) => p.id === s.character) ?? fail('character');
    const floor = int(s.floor, 'floor', 1, 100_000);
    const kills = int(s.kills, 'kills', 0, 100_000);
    const rngState = int(s.rng, 'rng', 0, 0xffffffff);
    const deckSize = SKILL_SLOTS.reduce((n, k) => n + bal.deck[k], 0);

    const player = createUnit(def, skills, 'player', bal);
    const ps = obj(s.player, 'player');
    player.maxHp = int(ps.maxHp, 'player.maxHp', 1, MAX);
    player.hp = int(ps.hp, 'player.hp', 1, player.maxHp);
    const mods: Partial<Record<SkillSlot, SkillMod>> = {};
    for (const [i, m] of arr(ps.mods, 'player.mods', 3).entries()) {
      const t = arr(m, `player.mods[${i}]`, 4);
      const k = slot(t[0], `player.mods[${i}].slot`);
      mods[k] = {
        basePower: int(t[1], 'mod.basePower', -999, 9999),
        coinPower: int(t[2], 'mod.coinPower', -999, 9999),
        coinCount: int(t[3], 'mod.coinCount', 0, Math.max(0, bal.rewards.maxCoinCount - player.skills[k].coinCount)),
      };
    }
    player.skillMods = mods;
    const gifts: string[] = [];
    for (const [i, g] of arr(ps.gifts, 'player.gifts', bal.giftDefs.length).entries()) {
      const gd = bal.giftDefs.find((x) => x.id === g) ?? fail(`player.gifts[${i}]`);
      if (gifts.includes(gd.id)) fail('duplicate gift');
      gifts.push(gd.id);
    }
    player.gifts = gifts;

    let battle: RunSnapshot['battle'] = null;
    if (s.battle !== null) {
      const b = obj(s.battle, 'battle');
      const edef = data.enemies.find((e) => e.id === b.enemy) ?? fail('battle.enemy');
      const enemy = createEnemyForFloor(edef, skills, floor, bal);
      applyDyn(player, b.player, 'battle.player', bal, deckSize);
      applyDyn(enemy, b.enemy_, 'battle.enemy', bal, deckSize);
      if (player.maxHp !== int(obj(s.player, 'player').maxHp, 'maxHp', 1, MAX)) fail('maxHp mismatch');
      const intent =
        b.intent === null ? null : b.intent === 'defense' ? (enemy.defenseSkill ? 'defense' : fail('intent')) : slot(b.intent, 'battle.intent');
      battle = {
        enemyId: edef.id,
        state: {
          turn: int(b.turn, 'battle.turn', 1, MAX),
          player,
          enemy,
          enemyIntent: intent,
          outcome: null,
          rngState: int(b.rng, 'battle.rng', 0, 0xffffffff),
        },
      };
    }

    let reward: RunSnapshot['reward'] = null;
    if (s.reward !== null) {
      if (battle) fail('battle and reward at once');
      const r = obj(s.reward, 'reward');
      const offers: RewardOffer[] = [];
      for (const [i, o] of arr(r.offers, 'reward.offers', 10).entries()) {
        const oo = obj(o, `reward.offers[${i}]`);
        const rd = data.rewards.find((x) => x.id === oo.def) ?? fail(`reward.offers[${i}].def`);
        const slots = arr(oo.slots, 'slots', 3).map((x) => slot(x, 'slot'));
        let giftId: string | undefined;
        if (rd.kind === 'gift') {
          giftId = (bal.giftDefs.find((g) => g.id === oo.gift) ?? fail('offer gift')).id;
          if (player.gifts.includes(giftId)) fail('offer of an owned gift');
        }
        const base = {
          defId: rd.id,
          name: giftId ? bal.giftDefs.find((g) => g.id === giftId)!.name : rd.name,
          kind: rd.kind,
          amount: rd.amount,
          slots,
          ...(rd.bossOnly ? { special: true } : {}),
          ...(giftId ? { giftId } : {}),
        };
        offers.push({ ...base, description: describeOffer(base, player, bal) });
      }
      if (offers.length === 0) fail('no offers');
      reward = { healed: int(r.healed, 'reward.healed', 0, MAX), offers };
    }
    if (!battle && !reward) fail('neither battle nor reward');

    return { characterId: def.id, floor, kills, rngState, player, battle, reward };
  } catch (e) {
    if (e instanceof Invalid) return null;
    throw e; // a real bug, not bad data
  }
}
