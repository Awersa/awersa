import { loadJson, saveJson } from '../platform/storage.ts';

export type AnimSpeed = 1 | 2 | 'skip';
export const ANIM_SPEEDS: readonly AnimSpeed[] = [1, 2, 'skip'];

export interface Settings {
  animSpeed: AnimSpeed;
  sound: boolean;
  /** 0..1 */
  sfxVolume: number;
  /** 0..1 */
  bgmVolume: number;
}

const DEFAULTS: Settings = { animSpeed: 1, sound: true, sfxVolume: 0.8, bgmVolume: 0.5 };

const vol = (x: unknown) => typeof x === 'number' && x >= 0 && x <= 1;

/** Older saved settings may lack the newer fields; those fall back to defaults. */
const isSettings = (v: unknown): v is Partial<Settings> => {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<Settings>;
  return (
    (s.animSpeed === undefined || ANIM_SPEEDS.includes(s.animSpeed)) &&
    (s.sound === undefined || typeof s.sound === 'boolean') &&
    (s.sfxVolume === undefined || vol(s.sfxVolume)) &&
    (s.bgmVolume === undefined || vol(s.bgmVolume))
  );
};

let cache: Settings | null = null;

export function getSettings(): Settings {
  if (!cache) {
    const raw = loadJson<Partial<Settings>>('settings', isSettings, {});
    cache = {
      animSpeed: raw.animSpeed ?? DEFAULTS.animSpeed,
      sound: raw.sound ?? DEFAULTS.sound,
      sfxVolume: raw.sfxVolume ?? DEFAULTS.sfxVolume,
      bgmVolume: raw.bgmVolume ?? DEFAULTS.bgmVolume,
    };
  }
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
