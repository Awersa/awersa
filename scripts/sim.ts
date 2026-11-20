/**
 * Console battle simulator (no UI).
 *
 *   npm run sim                                  # win-rate table + endless-run stats
 *   npm run sim -- --log --seed 7 --char hangyeol --enemy thug   # one battle, full log
 *   npm run sim -- --n 5000                      # more samples
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  applyReward,
  createBattle,
  createEnemyForFloor,
  createRng,
  createUnit,
  effectiveSkill,
  formatEvent,
  generateOffers,
  headsChance,
  indexSkills,
  maxOneSidedDamage,
  pickEnemyDef,
  playerStatus,
  takeTurn,
  validateGameData,
  type Balance,
  type BattleState,
  type GameData,
  type Rng,
  type UnitState,
} from '../src/core/index.ts';

const readJson = (p: string): unknown => JSON.parse(readFileSync(new URL(`../src/data/${p}`, import.meta.url), 'utf8'));
const bal = readJson('balance.json') as Balance;
const rawData = {
  skills: readJson('skills.json'),
  players: readJson('characters.json'),
  enemies: readJson('enemies.json'),
  rewards: readJson('rewards.json'),
};
const errors = validateGameData(rawData);
if (errors.length) {
  console.error('Invalid game data:\n' + errors.join('\n'));
  process.exit(1);
}
const data = rawData as unknown as GameData;
const skills = indexSkills(data.skills);

const { values: args } = parseArgs({
  options: {
    log: { type: 'boolean', default: false },
    seed: { type: 'string', default: '1' },
    char: { type: 'string' },
    enemy: { type: 'string' },
    floor: { type: 'string', default: '1' },
    n: { type: 'string', default: '2000' },
  },
});

type Policy = (s: BattleState) => number;
const randomPolicy = (rng: Rng): Policy => (s) => rng.int(0, s.player.hand.length - 1);
/**
 * Picks the card with the highest expected clash power, but avoids cards whose best case
 * could kill the enemy (duel rule) when a safer card exists.
 */
const smartPolicy: Policy = (s) => {
  const p = s.player;
  const ch = headsChance(p, bal);
  const scored = p.hand.map((slot, i) => {
    const sk = effectiveSkill(p, slot);
    const lethal = bal.battle.enemyHpZero === 'lose' && maxOneSidedDamage(p, sk, sk.coinCount, s.enemy, sk.coinCount, bal) >= s.enemy.hp;
    return { i, lethal, value: sk.basePower + sk.coinPower * sk.coinCount * ch + sk.coinCount * 0.5 };
  });
  const safe = scored.filter((x) => !x.lethal);
  const pool = safe.length > 0 ? safe : scored.map((x) => ({ ...x, value: -x.value }));
  return pool.reduce((a, b) => (b.value > a.value ? b : a)).i;
};

function fight(player: UnitState, enemy: UnitState, seed: number, policy: Policy, log = false): BattleState {
  const names = { player: player.name, enemy: enemy.name };
  const { state, events } = createBattle(player, enemy, seed, bal);
  if (log) events.forEach((e) => console.log(formatEvent(e, names)));
  let guard = 0;
  while (!state.outcome) {
    if (++guard > 500) throw new Error('battle did not end');
    const choice = playerStatus(state).canChoose ? policy(state) : null;
    const ev = takeTurn(state, choice, bal);
    if (log) ev.forEach((e) => console.log(formatEvent(e, names)));
  }
  return state;
}

const playerDef = (id?: string) => data.players.find((p) => p.id === (id ?? data.players[0]!.id))!;
const enemyDef = (id: string) => data.enemies.find((e) => e.id === id)!;

if (args.log) {
  const pd = playerDef(args.char);
  const ed = args.enemy ? enemyDef(args.enemy) : data.enemies[0]!;
  if (!pd || !ed) throw new Error('unknown --char / --enemy');
  const s = fight(createUnit(pd, skills, 'player', bal), createEnemyForFloor(ed, skills, Number(args.floor), bal), Number(args.seed), smartPolicy, true);
  console.log(`\n최종 HP: ${s.player.name} ${s.player.hp}/${s.player.maxHp}, ${s.enemy.name} ${s.enemy.hp}/${s.enemy.maxHp}, ${s.turn}턴`);
  process.exit(0);
}

const N = Math.max(1, Number(args.n) || 2000);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);

console.log(`\n[1층 단판 승률] (N=${N}, 풀 HP 기준)  똑똑한 선택 / 무작위 선택`);
for (const pd of data.players) {
  for (const ed of data.enemies) {
    const floor = ed.boss ? bal.floor.bossEvery : 1;
    let smart = 0, rand = 0, hpLeft = 0;
    for (let i = 0; i < N; i++) {
      const s = fight(createUnit(pd, skills, 'player', bal), createEnemyForFloor(ed, skills, floor, bal), i + 1, smartPolicy);
      if (s.outcome === 'win') { smart++; hpLeft += s.player.hp / s.player.maxHp; }
      const r = fight(createUnit(pd, skills, 'player', bal), createEnemyForFloor(ed, skills, floor, bal), i + 1, randomPolicy(createRng(i * 7 + 3)));
      if (r.outcome === 'win') rand++;
    }
    console.log(`  ${pd.name} vs ${ed.name}${ed.boss ? `(${floor}층 보스)` : ''}: ${pct(smart / N)} / ${pct(rand / N)}  (승리 시 남은 HP 평균 ${pct(hpLeft / Math.max(1, smart))})`);
  }
}

console.log(`\n[무한 모드 런] (N=${N}, 똑똑한 선택, 보상은 무작위 선택, HP 이어짐)`);
for (const pd of data.players) {
  const reached: number[] = [];
  let firstLoss = 0;
  const lossBy = { hp: 0, kill: 0, clashWins: 0 };
  for (let i = 0; i < N; i++) {
    const rng = createRng(1000 + i);
    const player = createUnit(pd, skills, 'player', bal);
    let floor = 1;
    for (;;) {
      const enemy = createEnemyForFloor(pickEnemyDef(data.enemies, floor, rng, bal), skills, floor, bal);
      const s = fight(player, enemy, rng.int(0, 2 ** 31), smartPolicy);
      if (s.outcome === 'lose') {
        if (s.player.hp <= 0) lossBy.hp++;
        else if (s.enemy.hp <= 0) lossBy.kill++;
        else lossBy.clashWins++;
        break;
      }
      applyReward(player, rng.pick(generateOffers(data.rewards, player, rng, bal)));
      floor++;
      if (floor > 200) break;
    }
    if (floor === 1) firstLoss++;
    reached.push(floor);
  }
  reached.sort((a, b) => a - b);
  const q = (p: number) => reached[Math.floor(p * (reached.length - 1))];
  const avg = reached.reduce((a, b) => a + b, 0) / reached.length;
  const bossClear = reached.filter((f) => f > bal.floor.bossEvery).length / N;
  console.log(`  ${pd.name}: 1층 패배 ${pct(firstLoss / N)} | 도달 층 평균 ${avg.toFixed(1)} · 중앙값 ${q(0.5)} · 상위10% ${q(0.9)} · 최고 ${reached.at(-1)} | 첫 보스 돌파 ${pct(bossClear)} | 패배 원인: 내 체력 ${pct(lossBy.hp / N)}${bal.battle.enemyHpZero === 'lose' ? ` · 상대 사망 ${pct(lossBy.kill / N)}` : ''} · 합 패배 ${pct(lossBy.clashWins / N)}`);
}
