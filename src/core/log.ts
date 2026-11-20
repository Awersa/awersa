import type { BattleEvent, Side } from './types.ts';

const who = (s: Side, names: Record<Side, string>) => names[s];
const coins = (h: boolean[]) => h.map((x) => (x ? '●' : '○')).join('');

/** Human-readable Korean line for an event (used by the console sim and the text log panel). */
export function formatEvent(e: BattleEvent, names: Record<Side, string>): string {
  switch (e.t) {
    case 'turnStart':
      return `── ${e.turn}턴 ── 속도 ${names.player} ${e.speed.player} / ${names.enemy} ${e.speed.enemy}`;
    case 'intent':
      return `${names.enemy}의 의도: ${e.slot} ${e.skill} (위력 ${e.min}~${e.max})`;
    case 'skillUse':
      return `${who(e.side, names)} → ${e.slot} ${e.skill}${e.auto === 'panic' ? ' (패닉: 무작위)' : ''}`;
    case 'cannotAct':
      return `${who(e.side, names)} 행동 불가 (${e.reason === 'stagger' ? '흐트러짐' : '패닉'})`;
    case 'clashRound':
      return `  합 ${e.round}: ${coins(e.player.heads)} ${e.player.power} vs ${e.enemy.power} ${coins(e.enemy.heads)}` +
        (e.loser ? ` → ${who(e.loser, names)} 코인 파괴 (${e.player.coinsLeft}:${e.enemy.coinsLeft})` : ' → 동점, 재굴림');
    case 'clashEnd':
      return `  합 승리: ${who(e.winner, names)} (합 ${e.clashCount}회${e.tieBreak ? ', 동점 한도 초과' : ''})`;
    case 'coinHit':
      return `  ${who(e.attacker, names)} 코인${e.coin + 1} ${e.heads ? '앞' : '뒤'} 위력 ${e.power} → 피해 ${e.damage} (남은 HP ${e.targetHp})`;
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
    case 'battleEnd':
      return `=== ${e.outcome === 'win' ? '승리' : '패배'} (${e.reason === 'hp' ? '체력 0' : '합 승리 수'}) ===`;
  }
}
