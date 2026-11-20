import type { BattleEvent, Side } from './types.ts';

const STATUS_KO: Record<string, string> = { bleed: '출혈', burn: '화상', rupture: '파열', sinking: '침잠', tremor: '진동', poise: '호흡', charge: '충전' };
const st = (id: string) => STATUS_KO[id] ?? id;
/** "S2" stays as is; the defense action reads as "방어". */
export const slotLabel = (slot: string): string => (slot === 'defense' ? '방어' : slot);
/** "출혈 3/2", or "충전 2" for count-only statuses (potency 0). */
export const stackLabel = (name: string, potency: number, count: number): string =>
  potency > 0 ? `${name} ${potency}/${count}` : `${name} ${count}`;

export const BATTLE_END_REASON = {
  enemyHp: '상대 체력 0',
  playerHp: '내 체력 0',
  clashWins: '합 3승',
} as const;

const who = (s: Side, names: Record<Side, string>) => names[s];
const coins = (h: boolean[]) => h.map((x) => (x ? '●' : '○')).join('');

/** Human-readable Korean line for an event (used by the console sim and the text log panel). */
export function formatEvent(e: BattleEvent, names: Record<Side, string>): string {
  switch (e.t) {
    case 'turnStart':
      return `── ${e.turn}턴 ── 속도 ${names.player} ${e.speed.player} / ${names.enemy} ${e.speed.enemy}`;
    case 'intent':
      return `${names.enemy}의 의도: ${slotLabel(e.slot)} ${e.skill} (위력 ${e.min}~${e.max})`;
    case 'skillUse':
      return `${who(e.side, names)} → ${slotLabel(e.slot)} ${e.skill}${e.auto === 'panic' ? ' (패닉: 무작위)' : ''}`;
    case 'cannotAct':
      return `${who(e.side, names)} 행동 불가 (${e.reason === 'stagger' ? '흐트러짐' : '패닉'})`;
    case 'clashRound':
      return `  합 ${e.round}: ${coins(e.player.heads)} ${e.player.power} vs ${e.enemy.power} ${coins(e.enemy.heads)}` +
        (e.loser ? ` → ${who(e.loser, names)} 코인 파괴 (${e.player.coinsLeft}:${e.enemy.coinsLeft})` : ' → 동점, 재굴림');
    case 'clashEnd':
      return `  합 승리: ${who(e.winner, names)} (합 ${e.clashCount}회${e.tieBreak ? ', 동점 한도 초과' : ''})`;
    case 'coinHit':
      return `  ${who(e.attacker, names)} 코인${e.coin + 1} ${e.heads ? '앞' : '뒤'} 위력 ${e.power} → 피해 ${e.damage}${e.crit ? ' (치명!)' : ''}${e.blocked ? ` (막음 ${e.blocked})` : ''} (남은 HP ${e.targetHp})`;
    case 'sanity':
      return `  ${who(e.side, names)} 정신력 ${e.delta > 0 ? '+' : ''}${e.delta} → ${e.value}`;
    case 'stagger':
      return `  ★ ${who(e.side, names)} 흐트러짐!`;
    case 'staggerRecover':
      return `  ${who(e.side, names)} 흐트러짐 회복`;
    case 'panic':
      return `  ★ ${who(e.side, names)} 패닉!`;
    case 'panicRecover':
      return `  ${who(e.side, names)} 패닉 회복 (정신력 ${e.sanity})`;
    case 'clashWin':
      return `  ${who(e.side, names)} 합 승리 ${e.wins}${e.needed !== null ? `/${e.needed}` : ''}`;
    case 'guard':
      return `  ${who(e.side, names)} 수비 ${coins(e.heads)} → 보호막 ${e.shield}`;
    case 'evade':
      return `  ${who(e.side, names)} 회피 ${coins(e.heads)} ${e.power} vs ${e.attackPower} → ${e.success ? '회피 성공!' : '회피 실패'}`;
    case 'counter':
      return `  ${who(e.side, names)} 반격! (${e.skill})`;
    case 'defenseUnused':
      return `  ${who(e.side, names)} ${e.skill} — 공격이 없어 무의미`;
    case 'statusApply':
      return `  ${who(e.side, names)} ${stackLabel(st(e.status), e.potency, e.count)}`;
    case 'statusTrigger':
      return e.action === 'sanityLoss'
        ? `  ${who(e.side, names)} ${st(e.status)} 발동: 정신력 -${e.amount}`
        : e.action === 'staggerDamage'
          ? `  ${who(e.side, names)} ${st(e.status)} 폭발: 흐트러짐 피해 ${e.amount}`
          : `  ${who(e.side, names)} ${st(e.status)} 발동: 피해 ${e.amount} (남은 HP ${e.hp})`;
    case 'statusEnd':
      return `  ${who(e.side, names)} ${st(e.status)} 소멸`;
    case 'spend':
      return `  ${who(e.side, names)} ${st(e.status)} ${e.count} 소모 → 기본 위력 +${e.power}`;
    case 'gift':
      return `  ◆ ${who(e.side, names)} 기프트 [${e.gift}] 발동`;
    case 'heal':
      return `  ${who(e.side, names)} 체력 +${e.amount} (HP ${e.hp})`;
    case 'battleEnd':
      return `=== ${e.outcome === 'win' ? '승리' : '패배'} (${BATTLE_END_REASON[e.reason]}) ===`;
  }
}
