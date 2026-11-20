import { loadJson, saveJson } from '../platform/storage.ts';

export interface Best {
  floor: number;
  kills: number;
}
export interface Records {
  runs: number;
  best: Record<string, Best>;
}

const EMPTY: Records = { runs: 0, best: {} };
const ID = /^[a-z0-9_.-]{1,48}$/;

function isRecords(v: unknown): v is Records {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Records;
  if (!Number.isInteger(r.runs) || r.runs < 0) return false;
  if (typeof r.best !== 'object' || r.best === null || Array.isArray(r.best)) return false;
  return Object.entries(r.best).every(
    ([k, b]) => ID.test(k) && typeof b === 'object' && b !== null && Number.isInteger(b.floor) && b.floor >= 1 && Number.isInteger(b.kills) && b.kills >= 0,
  );
}

export function loadRecords(): Records {
  const r = loadJson('records', isRecords, EMPTY);
  // Rebuild without the prototype so odd keys can never matter.
  const best: Record<string, Best> = Object.create(null) as Record<string, Best>;
  for (const [k, b] of Object.entries(r.best)) best[k] = { floor: b.floor, kills: b.kills };
  return { runs: r.runs, best };
}

/** Records a finished run. Returns true if it set a new best floor for that character. */
export function recordRun(characterId: string, floor: number, kills: number): boolean {
  const r = loadRecords();
  const prev = r.best[characterId];
  const isBest = !prev || floor > prev.floor;
  if (isBest) r.best[characterId] = { floor, kills };
  saveJson('records', { runs: r.runs + 1, best: { ...r.best } });
  return isBest;
}
