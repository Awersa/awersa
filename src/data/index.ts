import skills from './skills.json';
import characters from './characters.json';
import enemies from './enemies.json';
import rewards from './rewards.json';
import statuses from './statuses.json';
import { validateGameData, type GameData } from '../core/validate.ts';

/** Game data, validated once at startup. Throws with a readable list if a JSON file is malformed. */
export function loadGameData(): GameData {
  const raw = { statuses, skills, players: characters, enemies, rewards };
  const errors = validateGameData(raw);
  if (errors.length) throw new Error('Invalid game data:\n' + errors.join('\n'));
  return raw as unknown as GameData;
}
