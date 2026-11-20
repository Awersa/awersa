import Phaser from 'phaser';
import { COLORS, DAMAGE_TYPE_KO, FONT, GAME_HEIGHT, GAME_WIDTH, RESIST_KO } from '../config/display.ts';
import {
  BATTLE_END_REASON,
  createBattle,
  effectiveSkill,
  formatEvent,
  headsChance,
  isBossFloor,
  isStaggered,
  maxOneSidedDamage,
  playerStatus,
  powerRange,
  takeTurn,
  DAMAGE_TYPES,
  type BattleEvent,
  type BattleState,
  type Side,
  type UnitState,
} from '../core/index.ts';
import { gameContext } from '../game/context.ts';
import { getRun, setRun } from '../game/run.ts';
import { HpBar, SanityGauge, pips } from '../ui/Bar.ts';
import { Button } from '../ui/Button.ts';
import { LogPanel } from '../ui/LogPanel.ts';
import { makePressable } from '../ui/pressable.ts';
import { SkillCard } from '../ui/SkillCard.ts';
import { SceneKey } from './keys.ts';

const CX = GAME_WIDTH / 2;
const text = (scene: Phaser.Scene, x: number, y: number, size: number, color: string = COLORS.text) =>
  scene.add.text(x, y, '', { fontFamily: FONT, fontSize: `${size}px`, color });

/**
 * Battle screen (milestone 3: text-based results). The scene never computes rules itself:
 * it calls the core engine and renders the returned state + events.
 */
export class BattleScene extends Phaser.Scene {
  private state!: BattleState;
  private names!: Record<Side, string>;
  private selected: number | null = null;

  private enemyName!: Phaser.GameObjects.Text;
  private enemyHp!: HpBar;
  private enemyInfo!: Phaser.GameObjects.Text;
  private enemyStatus!: Phaser.GameObjects.Text;
  private intentText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private playerName!: Phaser.GameObjects.Text;
  private playerHp!: HpBar;
  private sanity!: SanityGauge;
  private playerInfo!: Phaser.GameObjects.Text;
  private cards: SkillCard[] = [];
  private actionBtn!: Button;
  private log!: LogPanel;
  private overlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super(SceneKey.Battle);
  }

  create(): void {
    const run = getRun();
    if (!run) {
      this.scene.start(SceneKey.Title);
      return;
    }
    const { bal } = gameContext();
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.selected = null;
    this.overlay = null;
    this.cards = [];

    const enemy = run.nextEnemy();
    const { state, events } = createBattle(run.player, enemy, run.battleSeed(), bal);
    this.state = state;
    this.names = { player: run.player.name, enemy: enemy.name };

    this.buildLayout(run.floor);
    this.log.push(`===== ${run.floor}층: ${enemy.name}${enemy.boss ? ' (보스)' : ''} =====`, ...this.lines(events));
    this.resultText.setText(
      `합 ${bal.battle.playerClashWinsToWin ?? '∞'}승을 하면 승리.\n` +
        (bal.battle.enemyHpZero === 'lose' ? '단, 누구든 체력이 0이 되면 패배 — 상대를 죽이지 마라.' : '체력이 0이 된 쪽이 패배. 상대가 먼저 합 3승을 해도 패배.'),
    );
    this.refresh();
  }

  // ---------------------------------------------------------------- layout

  private buildLayout(floor: number): void {
    const { bal } = gameContext();

    // Top bar
    new Button(this, 140, 80, '로그', () => this.log.open(), { width: 220, height: 130, fontSize: 44 });
    const leave = new Button(this, GAME_WIDTH - 140, 80, '포기', () => {
      if (leave.getData('armed')) {
        setRun(null);
        this.scene.start(SceneKey.Title);
        return;
      }
      leave.setData('armed', true).setText('정말?');
      this.time.delayedCall(2000, () => leave.active && leave.setData('armed', false).setText('포기'));
    }, { width: 220, height: 130, fontSize: 44 });
    text(this, CX, 80, 52)
      .setOrigin(0.5)
      .setText(`${floor}층${isBossFloor(floor, bal) ? ' · 보스' : ''}`);

    // Enemy block
    this.enemyName = text(this, 90, 195, 50).setOrigin(0, 0.5);
    this.enemyStatus = text(this, GAME_WIDTH - 90, 195, 44, COLORS.text).setOrigin(1, 0.5);
    this.enemyHp = new HpBar(this, 90, 260, GAME_WIDTH - 180, 50);
    this.enemyInfo = text(this, 90, 312, 32, COLORS.textDim);

    this.add.rectangle(230, 510, 280, 260, COLORS.red, 0.3).setStrokeStyle(4, COLORS.red);
    text(this, 230, 510, 40).setOrigin(0.5).setText('적');
    this.add.rectangle(700, 510, 580, 260, COLORS.panel).setStrokeStyle(4, COLORS.red);
    text(this, 430, 395, 30, COLORS.textDim).setText('적의 의도');
    this.intentText = text(this, 430, 435, 38).setWordWrapWidth(540, true).setLineSpacing(6);

    // Result panel
    this.add.rectangle(CX, 860, GAME_WIDTH - 60, 400, 0x0d0907).setStrokeStyle(3, COLORS.panelLight);
    this.resultText = text(this, 60, 678, 30).setWordWrapWidth(GAME_WIDTH - 120, true).setLineSpacing(8);

    // Player block
    this.playerName = text(this, 90, 1110, 50).setOrigin(0, 0.5);
    this.playerInfo = text(this, GAME_WIDTH - 90, 1110, 44).setOrigin(1, 0.5);
    this.playerHp = new HpBar(this, 90, 1175, GAME_WIDTH - 180, 50);
    this.sanity = new SanityGauge(this, 90, 1240, 420, 34, bal.sanity.max);

    // Hand
    for (let i = 0; i < bal.deck.handSize; i++) {
      const x = bal.deck.handSize === 1 ? CX : 285 + i * 510;
      this.cards.push(new SkillCard(this, x, 1490, () => this.pick(i)));
    }

    this.actionBtn = new Button(this, CX, 1800, '합 개시', () => this.confirm(), {
      width: GAME_WIDTH - 120,
      height: 170,
      fontSize: 60,
      fill: 0x5a2a1a,
    });

    this.log = new LogPanel(this);
  }

  // ---------------------------------------------------------------- render

  private refresh(): void {
    const { bal } = gameContext();
    const { player: p, enemy: e } = this.state;

    this.enemyName.setText(e.name);
    this.enemyHp.setValue(e.hp, e.maxHp, e.staggerThresholds, e.nextStaggerIndex);
    this.enemyStatus.setText(`${pips(e.clashWins, bal.battle.enemyClashWinsToWin)}${this.statusTag(e)}`);
    this.enemyInfo.setText(
      '내성 ' + DAMAGE_TYPES.map((d) => `${DAMAGE_TYPE_KO[d]} ${RESIST_KO[e.resistances[d]]}`).join(' · ') + `   속도 ${e.speed}`,
    );

    this.playerName.setText(p.name);
    this.playerHp.setValue(p.hp, p.maxHp, p.staggerThresholds, p.nextStaggerIndex);
    this.sanity.setValue(p.sanity, headsChance(p, bal));
    this.playerInfo.setText(`${pips(p.clashWins, bal.battle.playerClashWinsToWin)}${this.statusTag(p)}`);

    // Enemy intent
    if (this.state.enemyIntent) {
      const sk = effectiveSkill(e, this.state.enemyIntent);
      const r = powerRange(sk);
      const dmg = maxOneSidedDamage(e, sk, sk.coinCount, p, sk.coinCount, bal);
      this.intentText.setText(
        `${sk.slot} ${sk.name}\n위력 ${r.min} ~ ${r.max} · 코인 ${sk.coinCount}개\n${DAMAGE_TYPE_KO[sk.damageType]} · 최대 피해 ${dmg}`,
      );
      this.intentText.setColor(dmg >= p.hp ? COLORS.danger : COLORS.text);
    } else {
      this.intentText.setText(isStaggered(e) ? '흐트러짐 — 행동 불가' : '—').setColor(COLORS.textDim);
    }

    // Hand
    const status = playerStatus(this.state);
    p.hand.forEach((slot, i) => {
      const card = this.cards[i];
      if (!card) return;
      const sk = effectiveSkill(p, slot);
      const r = powerRange(sk);
      const maxDamage = maxOneSidedDamage(p, sk, sk.coinCount, e, sk.coinCount, bal);
      card.show({ skill: sk, ...r, maxDamage, canKill: maxDamage >= e.hp, killIsLoss: bal.battle.enemyHpZero === 'lose' });
      card.setEnabled(status.canChoose && !this.state.outcome);
      card.setSelected(this.selected === i);
    });

    if (this.state.outcome) this.actionBtn.setEnabled(false);
    else if (!status.canChoose) {
      this.actionBtn.setText(status.reason === 'stagger' ? '흐트러짐 — 턴 넘기기' : '패닉 — 무작위 행동').setEnabled(true);
    } else {
      this.actionBtn.setText(this.selected === null ? '스킬을 고르세요' : '합 개시').setEnabled(this.selected !== null);
    }
  }

  private statusTag(u: UnitState): string {
    const tags: string[] = [];
    if (isStaggered(u)) tags.push('흐트러짐');
    if (u.panic !== 'none') tags.push(u.panic === 'active' ? '패닉' : '패닉 직전');
    return tags.length ? `  [${tags.join(', ')}]` : '';
  }

  private lines(events: BattleEvent[]): string[] {
    return events.map((ev) => formatEvent(ev, this.names));
  }

  // ---------------------------------------------------------------- input

  private pick(i: number): void {
    if (this.state.outcome || !playerStatus(this.state).canChoose) return;
    this.selected = this.selected === i ? null : i;
    this.refresh();
  }

  private confirm(): void {
    if (this.state.outcome || this.overlay) return;
    const { bal } = gameContext();
    const status = playerStatus(this.state);
    if (status.canChoose && this.selected === null) return;
    const events = takeTurn(this.state, status.canChoose ? this.selected : null, bal);
    this.selected = null;

    const all = this.lines(events);
    this.log.push(...all);
    // Result panel: this turn only (stop before the next turn's header/intent).
    const nextTurn = events.findIndex((ev, i) => i > 0 && ev.t === 'turnStart');
    const shown = (nextTurn >= 0 ? events.slice(0, nextTurn) : events).filter((ev) => ev.t !== 'turnStart' && ev.t !== 'intent');
    const lines = this.lines(shown).map((l) => l.trim());
    // The panel fits 9 lines; the full turn is always in the log.
    this.resultText.setText(lines.length > 9 ? ['…', ...lines.slice(-8)].join('\n') : lines.join('\n'));

    this.refresh();
    if (this.state.outcome) this.showEnd(events.at(-1));
  }

  // ---------------------------------------------------------------- end of battle

  private showEnd(last: BattleEvent | undefined): void {
    const run = getRun();
    if (!run) return;
    const win = this.state.outcome === 'win';
    const reason = last?.t === 'battleEnd' ? BATTLE_END_REASON[last.reason] : '';

    const c = this.add.container(0, 0).setDepth(500);
    this.overlay = c;
    c.add(this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.92).setOrigin(0).setInteractive());
    c.add(
      text(this, CX, 330, 110, win ? COLORS.ok : COLORS.danger)
        .setOrigin(0.5)
        .setText(win ? '승리' : '패배'),
    );
    c.add(text(this, CX, 450, 44, COLORS.textDim).setOrigin(0.5).setText(reason));

    if (win) {
      c.add(text(this, CX, 580, 46).setOrigin(0.5).setText('보상을 하나 고르세요'));
      run.rewardOffers().forEach((offer, i) => {
        const y = 800 + i * 330;
        const box = this.add.container(CX, y);
        box.add([
          this.add.rectangle(0, 0, GAME_WIDTH - 120, 290, COLORS.panel).setStrokeStyle(5, COLORS.gold),
          text(this, 0, -80, 50).setOrigin(0.5).setText(offer.name),
          text(this, 0, 20, 34, COLORS.textDim)
            .setOrigin(0.5, 0)
            .setAlign('center')
            .setWordWrapWidth(GAME_WIDTH - 200, true)
            .setText(offer.description),
        ]);
        box.setSize(GAME_WIDTH - 120, 290);
        makePressable(box, () => {
          run.claimReward(offer);
          this.scene.restart();
        });
        c.add(box);
      });
    } else {
      c.add(
        text(this, CX, 700, 48)
          .setOrigin(0.5)
          .setAlign('center')
          .setText(`도달: ${run.floor}층\n격파: ${run.kills}`),
      );
      const again = new Button(this, CX, 1100, '타이틀로', () => {
        setRun(null);
        this.scene.start(SceneKey.Title);
      });
      const logBtn = new Button(this, CX, 1300, '로그 보기', () => this.log.open());
      c.add([again, logBtn]);
    }
  }
}
