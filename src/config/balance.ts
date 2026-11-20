import raw from '../data/balance.json';

/** Typed view of src/data/balance.json. Edit the JSON, not this file. */
export type Balance = Omit<typeof raw, '$comment'>;
export const BALANCE: Balance = raw;
