import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBattle, takeTurn, playerStatus } from '../src/core/battle.ts';
import { createEnemyForFloor } from '../src/core/floor.ts';
import { generateOffers } from '../src/core/rewards.ts';
import { createRng } from '../src/core/rng.ts';
import { createUnit, indexSkills } from '../src/core/unit.ts';
import { addStatus } from '../src/core/status.ts';
import { parseSave, serializeRun, type RunSnapshot } from '../src/game/save.ts';
import type { BattleState } from '../src/core/types.ts';
import { bal, data } from './helpers.ts';

function midBattle(): RunSnapshot {
  const b = bal();
  const d = data();
  const sk = indexSkills(d.skills);
  const player = createUnit(d.players[0]!, sk, 'player', b);
  player.skillMods.S2 = { basePower: 3, coinPower: 1, coinCount: 1 };
  player.gifts = ['rusty_blade'];
  const edef = d.enemies.find((e) => e.id === 'rust')!;
  const enemy = createEnemyForFloor(edef, sk, 3, b);
  const { state } = createBattle(player, enemy, 42, b);
  takeTurn(state, 0, b);
  addStatus(enemy, 'bleed', 2, 2, b, []);
  return { characterId: player.defId, floor: 3, kills: 2, rngState: 777, player, battle: { enemyId: edef.id, state }, reward: null };
}

const roundTrip = (s: RunSnapshot) => {
  const d = data();
  return parseSave(JSON.parse(JSON.stringify(serializeRun(s))), d, indexSkills(d.skills), bal());
};

describe('save / load', () => {
  it('round-trips a mid-battle run', () => {
    const s = midBattle();
    const r = roundTrip(s)!;
    expect(r).not.toBeNull();
    expect(r.floor).toBe(3);
    expect(r.player.skillMods.S2).toEqual({ basePower: 3, coinPower: 1, coinCount: 1 });
    expect(r.player.gifts).toEqual(['rusty_blade']);
    const a = s.battle!.state;
    const b = r.battle!.state;
    expect(b.turn).toBe(a.turn);
    expect(b.enemyIntent).toBe(a.enemyIntent);
    expect(b.enemy.hp).toBe(a.enemy.hp);
    expect(b.enemy.statuses).toEqual(a.enemy.statuses);
    expect(b.player.hand).toEqual(a.player.hand);
  });

  it('a resumed battle plays out exactly like the original', () => {
    const s = midBattle();
    const r = roundTrip(s)!;
    const B = bal();
    const play = (st: BattleState) => {
      const out: unknown[] = [];
      for (let i = 0; i < 30 && !st.outcome; i++) out.push(...takeTurn(st, playerStatus(st).canChoose ? 0 : null, B));
      return out;
    };
    expect(play(r.battle!.state)).toEqual(play(s.battle!.state));
  });

  it('round-trips the reward phase', () => {
    const b = bal();
    const d = data();
    const sk = indexSkills(d.skills);
    const player = createUnit(d.players[1]!, sk, 'player', b);
    const offers = generateOffers(d.rewards, player, createRng(3), b, true);
    const r = roundTrip({ characterId: player.defId, floor: 5, kills: 4, rngState: 1, player, battle: null, reward: { healed: 12, offers } })!;
    expect(r.reward!.offers.map((o) => [o.defId, o.slots, o.giftId])).toEqual(offers.map((o) => [o.defId, o.slots, o.giftId]));
    expect(r.reward!.offers.map((o) => o.description)).toEqual(offers.map((o) => o.description));
  });

  it('rejects tampered or broken saves instead of crashing', () => {
    const d = data();
    const sk = indexSkills(d.skills);
    const good = JSON.parse(JSON.stringify(serializeRun(midBattle())));
    const bad = (mutate: (x: any) => void) => {
      const x = structuredClone(good);
      mutate(x);
      return parseSave(x, d, sk, bal());
    };
    expect(parseSave(good, d, sk, bal())).not.toBeNull();
    expect(bad((x) => (x.v = 2))).toBeNull();
    expect(bad((x) => (x.character = 'hacker'))).toBeNull();
    expect(bad((x) => (x.player.hp = 1e9))).toBeNull();
    expect(bad((x) => (x.player.hp = 'lots'))).toBeNull();
    expect(bad((x) => (x.floor = -1))).toBeNull();
    expect(bad((x) => (x.player.gifts = ['__proto__']))).toBeNull();
    expect(bad((x) => (x.battle.enemy_.statuses = [['__proto__', 1, 1]]))).toBeNull();
    expect(bad((x) => (x.battle.player.hand = ['S9']))).toBeNull();
    expect(bad((x) => (x.battle.player.hand = ['S1', 'S1', 'S1', 'S1', 'S1', 'S1', 'S1']))).toBeNull();
    expect(bad((x) => (x.player.mods = [['S1', 0, 0, 99]]))).toBeNull(); // more coins than allowed
    expect(bad((x) => (x.battle.intent = '<script>'))).toBeNull();
    expect(parseSave(null, d, sk, bal())).toBeNull();
    expect(parseSave('garbage', d, sk, bal())).toBeNull();
    expect(parseSave([], d, sk, bal())).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('RunSession with storage', () => {
  class Mem {
    m = new Map<string, string>();
    getItem(k: string) { return this.m.get(k) ?? null; }
    setItem(k: string, v: string) { this.m.set(k, v); }
    removeItem(k: string) { this.m.delete(k); }
  }
  let mem: Mem;
  beforeEach(() => {
    mem = new Mem();
    (globalThis as { localStorage?: unknown }).localStorage = mem;
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('auto-saves, resumes, and clears the save + records the run on loss', async () => {
    const { RunSession } = await import('../src/game/run.ts');
    const { loadRecords } = await import('../src/game/records.ts');
    const run = RunSession.start('hangyeol', 5);
    const { state } = run.ensureBattle();
    takeTurn(state, 0, bal());
    run.save();
    const loaded = RunSession.load()!;
    expect(loaded.battle!.state.turn).toBe(state.turn);
    expect(loaded.battle!.state.enemy.hp).toBe(state.enemy.hp);
    expect(loaded.finish()).toBe(true);
    expect(RunSession.load()).toBeNull();
    expect(loadRecords().best.hangyeol).toEqual({ floor: 1, kills: 0 });
    expect(loadRecords().runs).toBe(1);
  });

  it('drops a corrupted save', async () => {
    const { RunSession } = await import('../src/game/run.ts');
    mem.setItem('clashduel.run', '{"v":1,"character":"hangyeol"');
    expect(RunSession.load()).toBeNull();
    mem.setItem('clashduel.run', JSON.stringify({ v: 1, character: 'hangyeol', floor: 1 }));
    expect(RunSession.load()).toBeNull();
    expect(mem.getItem('clashduel.run')).toBeNull();
  });
});
