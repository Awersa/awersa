import {
  applyReward,
  createBattle,
  createEnemyForFloor,
  createRng,
  createUnit,
  generateOffers,
  isBossFloor,
  pickEnemyDef,
  recoverAfterBattle,
  randomSeed,
  type BattleEvent,
  type BattleState,
  type RewardOffer,
  type Rng,
  type UnitState,
} from '../core/index.ts';
import { loadJson, removeKey, saveJson } from '../platform/storage.ts';
import { gameContext } from './context.ts';
import { recordRun } from './records.ts';
import { parseSave, serializeRun, type RunSnapshot } from './save.ts';

const SAVE_KEY = 'run';

/**
 * One endless-mode run. Phases: battle → (win) reward → battle on the next floor … → (lose) over.
 * Every state change is auto-saved, so closing the app resumes exactly where you were.
 */
export class RunSession {
  readonly characterId: string;
  floor: number;
  kills: number;
  readonly player: UnitState;
  battle: { enemyId: string; state: BattleState } | null;
  reward: { healed: number; offers: RewardOffer[] } | null;
  private readonly rng: Rng;

  private constructor(snap: RunSnapshot) {
    this.characterId = snap.characterId;
    this.floor = snap.floor;
    this.kills = snap.kills;
    this.player = snap.player;
    this.battle = snap.battle;
    this.reward = snap.reward;
    this.rng = createRng(0);
    this.rng.setState(snap.rngState);
  }

  static start(characterId: string, seed: number = randomSeed()): RunSession {
    const { data, skills, bal } = gameContext();
    const def = data.players.find((p) => p.id === characterId);
    if (!def) throw new Error(`unknown character ${characterId}`);
    return new RunSession({
      characterId,
      floor: 1,
      kills: 0,
      rngState: seed >>> 0,
      player: createUnit(def, skills, 'player', bal),
      battle: null,
      reward: null,
    });
  }

  /** The saved run, or null if there is none or it is invalid. */
  static load(): RunSession | null {
    const { data, skills, bal } = gameContext();
    const raw = loadJson<unknown>(SAVE_KEY, (v): v is unknown => v !== undefined, null);
    if (raw === null) return null;
    const snap = parseSave(raw, data, skills, bal);
    if (!snap) {
      removeKey(SAVE_KEY); // corrupted / tampered / old version: drop it
      return null;
    }
    return new RunSession(snap);
  }

  static hasSave(): boolean {
    return RunSession.load() !== null;
  }

  save(): void {
    saveJson(SAVE_KEY, serializeRun({
      characterId: this.characterId,
      floor: this.floor,
      kills: this.kills,
      rngState: this.rng.getState(),
      player: this.player,
      battle: this.battle,
      reward: this.reward,
    }));
  }

  /** Current battle, creating the next floor's battle if needed. `resumed` = loaded from a save. */
  ensureBattle(): { state: BattleState; events: BattleEvent[]; resumed: boolean } {
    if (this.battle) return { state: this.battle.state, events: [], resumed: true };
    const { data, skills, bal } = gameContext();
    const def = pickEnemyDef(data.enemies, this.floor, this.rng, bal);
    const enemy = createEnemyForFloor(def, skills, this.floor, bal);
    const { state, events } = createBattle(this.player, enemy, this.rng.int(0, 0xffffffff), bal);
    this.battle = { enemyId: def.id, state };
    this.reward = null;
    this.save();
    return { state, events, resumed: false };
  }

  /** Battle won: recover, roll reward offers, save. */
  winBattle(): void {
    const { data, bal } = gameContext();
    const healed = recoverAfterBattle(this.player, bal);
    const offers = generateOffers(data.rewards, this.player, this.rng, bal, isBossFloor(this.floor, bal));
    this.battle = null;
    this.reward = { healed, offers };
    this.save();
  }

  claimReward(offer: RewardOffer): void {
    applyReward(this.player, offer, gameContext().bal);
    this.kills++;
    this.floor++;
    this.reward = null;
    this.save();
  }

  /** Run lost: store the record and delete the save. Returns true on a new best floor. */
  finish(): boolean {
    removeKey(SAVE_KEY);
    return recordRun(this.characterId, this.floor, this.kills);
  }

  static discardSave(): void {
    removeKey(SAVE_KEY);
  }
}

let current: RunSession | null = null;
export const getRun = (): RunSession | null => current;
export const setRun = (r: RunSession | null): void => {
  current = r;
};
