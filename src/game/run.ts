import {
  applyReward,
  createEnemyForFloor,
  createRng,
  createUnit,
  generateOffers,
  pickEnemyDef,
  randomSeed,
  type Rng,
  type RewardOffer,
  type UnitState,
} from '../core/index.ts';
import { gameContext } from './context.ts';

/**
 * One endless-mode run: the player unit (HP + upgrades carry over), current floor and run RNG.
 * Saving / resuming arrives in milestone 6.
 */
export class RunSession {
  floor = 1;
  kills = 0;
  readonly player: UnitState;
  private readonly rng: Rng;

  constructor(characterId: string, seed: number = randomSeed()) {
    const { data, skills, bal } = gameContext();
    const def = data.players.find((p) => p.id === characterId);
    if (!def) throw new Error(`unknown character ${characterId}`);
    this.player = createUnit(def, skills, 'player', bal);
    this.rng = createRng(seed);
  }

  nextEnemy(): UnitState {
    const { data, skills, bal } = gameContext();
    return createEnemyForFloor(pickEnemyDef(data.enemies, this.floor, this.rng, bal), skills, this.floor, bal);
  }

  battleSeed(): number {
    return this.rng.int(0, 0xffffffff);
  }

  rewardOffers(): RewardOffer[] {
    const { data, bal } = gameContext();
    return generateOffers(data.rewards, this.player, this.rng, bal);
  }

  claimReward(offer: RewardOffer): void {
    applyReward(this.player, offer);
    this.kills++;
    this.floor++;
  }
}

let current: RunSession | null = null;
export const getRun = (): RunSession | null => current;
export const setRun = (r: RunSession | null): void => {
  current = r;
};
