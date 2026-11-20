import { loadJson, saveJson } from '../platform/storage.ts';

export type AnimSpeed = 1 | 2 | 'skip';
export const ANIM_SPEEDS: readonly AnimSpeed[] = [1, 2, 'skip'];

export interface Settings {
  animSpeed: AnimSpeed;
}

const DEFAULTS: Settings = { animSpeed: 1 };

const isSettings = (v: unknown): v is Settings =>
  typeof v === 'object' && v !== null && ANIM_SPEEDS.includes((v as Settings).animSpeed);

let cache: Settings | null = null;

export function getSettings(): Settings {
  cache ??= { ...DEFAULTS, ...loadJson('settings', isSettings, DEFAULTS) };
  return cache;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  if (isSettings(next)) {
    cache = next;
    saveJson('settings', next);
  }
  return getSettings();
}
