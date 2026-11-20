import raw from '../data/balance.json';
import type { Balance } from '../core/balance.ts';

/** Typed view of src/data/balance.json. Edit the JSON, not this file. */
export const BALANCE: Balance = raw as Balance;
