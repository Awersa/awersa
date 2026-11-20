import raw from '../data/balance.json';
import statuses from '../data/statuses.json';
import gifts from '../data/gifts.json';
import type { Balance } from '../core/balance.ts';
import type { GiftDef, StatusDef } from '../core/types.ts';

/** Typed view of src/data/balance.json (+ statuses.json). Edit the JSON, not this file. */
export const BALANCE: Balance = {
  ...(raw as unknown as Omit<Balance, 'statusDefs' | 'giftDefs'>),
  statusDefs: statuses as unknown as StatusDef[],
  giftDefs: gifts as unknown as GiftDef[],
};
