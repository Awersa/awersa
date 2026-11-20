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
import { ClashAnimator } from '../ui/ClashAnimator.ts';
import { ANIM_SPEEDS, getSettings, updateSettings, type AnimSpeed } from '../game/settings.ts';
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
  private animator!: ClashAnimator;
  private animating = false;
  private speedBtn!: Button;
  private enemyPortrait!: Phaser.GameObjects.Rectangle;

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
    this.animating = false;

    const enemy = run.nextEnemy();
    const { state, events } = createBattle(run.player, enemy, run.battleSeed(), bal);
    this.state = state;
    this.names = { player: run.player.name, enemy: enemy.name };

    this.buildLayout(run.floor);
    this.log.push(`===== ${run.floor}층: ${enemy.name}${enemy.boss ? ' (보스)' : ''} =====`, ...this.lines(events));
    this.resultText.setText(
      bal.battle.enemyHpZero === 'lose'
        ? '누구든 체력이 0이 되면 패배 — 상대를 죽이지 마라.'
        : '상대의 체력을 0으로 만들면 승리.\n합에서 이기면 남은 코인으로 일방 공격한다.',
    );
    this.animator = new ClashAnimator(this, {
      names: this.names,
      coinCount: (side, slot) => effectiveSkill(this.state[side], slot).coinCount,
      setHp: (side, hp, duration) => (side === 'player' ? this.playerHp : this.enemyHp).tweenHp(hp, duration),
      setSanity: (side, value) => side === 'player' && this.sanity.setValue(value, headsChance({ hasSanity: true, sanity: value }, bal)),
      setClashWins: (side, wins, needed) => {
        if (needed === null) return;
        (side === 'player' ? this.playerInfo : this.enemyStatus).setText(pips(wins, needed));
      },
      damageAnchor: (side) => (side === 'player' ? { x: CX, y: 1120 } : { x: 230, y: 470 }),
      flash: (side) => this.flash(side),
    });
    this.animator.setSpeed(getSettings().animSpeed);
    this.refresh();
  }

  // ---------------------------------------------------------------- layout

  private buildLayout(floor: number): void {
    const { bal } = gameContext();

    // Top bar
    new Button(this, 125, 80, '로그', () => this.log.open(), { width: 200, height: 130, fontSize: 44 });
    this.speedBtn = new Button(this, 345, 80, speedLabel(getSettings().animSpeed), () => this.cycleSpeed(), {
      width: 200,
      height: 130,
      fontSize: 40,
    });
    const leave = new Button(this, GAME_WIDTH - 125, 80, '포기', () => {
      if (leave.getData('armed')) {
        setRun(null);
        this.scene.start(SceneKey.Title);
        return;
      }
      leave.setData('armed', true).setText('정말?');
      this.time.delayedCall(2000, () => leave.active && leave.setData('armed', false).setText('포기'));
    }, { width: 200, height: 130, fontSize: 44 });
    text(this, 690, 80, 50)
      .setOrigin(0.5)
      .setText(`${floor}층${isBossFloor(floor, bal) ? ' · 보스' : ''}`);

    // Enemy block
    this.enemyName = text(this, 90, 195, 50).setOrigin(0, 0.5);
    this.enemyStatus = text(this, GAME_WIDTH - 90, 195, 44, COLORS.text).setOrigin(1, 0.5);
    this.enemyHp = new HpBar(this, 90, 260, GAME_WIDTH - 180, 50);
    this.enemyInfo = text(this, 90, 312, 32, COLORS.textDim);

    this.enemyPortrait = this.add.rectangle(230, 510, 280, 260, COLORS.red, 0.3).setStrokeStyle(4, COLORS.red);
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
    this.refreshUnits();
    this.refreshControls();
  }

  /** HP / sanity / intent. Not called while a turn is animating (the animator drives those). */
  private refreshUnits(): void {
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

  }

  /** Hand cards and the action button. */
  private refreshControls(): void {
    const { bal } = gameContext();
    const { player: p, enemy: e } = this.state;
    const status = playerStatus(this.state);
    p.hand.forEach((slot, i) => {
      const card = this.cards[i];
      if (!card) return;
      const sk = effectiveSkill(p, slot);
      const r = powerRange(sk);
      const maxDamage = maxOneSidedDamage(p, sk, sk.coinCount, e, sk.coinCount, bal);
      card.show({ skill: sk, ...r, maxDamage, canKill: maxDamage >= e.hp, killIsLoss: bal.battle.enemyHpZero === 'lose' });
      card.setEnabled(status.canChoose && !this.state.outcome && !this.animating);
      card.setSelected(this.selected === i);
    });

    if (this.state.outcome) this.actionBtn.setEnabled(false);
    else if (this.animating) this.actionBtn.setText('스킵 ▶▶').setEnabled(true);
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
    if (this.animating || this.state.outcome || !playerStatus(this.state).canChoose) return;
    this.selected = this.selected === i ? null : i;
    this.refresh();
  }

  private confirm(): void {
    if (this.animating) {
      this.animator.skip();
      return;
    }
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

    this.animating = true;
    this.resultText.setVisible(false);
    this.refreshControls();
    void this.animator.play(events).then(() => {
      if (!this.sys.isActive()) return;
      this.animating = false;
      this.resultText.setVisible(true);
      // The panel fits 9 lines; the full turn is always in the log.
      this.resultText.setText(lines.length > 9 ? ['…', ...lines.slice(-8)].join('\n') : lines.join('\n'));
      this.refresh();
      if (this.state.outcome) this.showEnd(events.at(-1));
    });
  }

  private cycleSpeed(): void {
    const cur = getSettings().animSpeed;
    const next = ANIM_SPEEDS[(ANIM_SPEEDS.indexOf(cur) + 1) % ANIM_SPEEDS.length]!;
    updateSettings({ animSpeed: next });
    this.animator.setSpeed(next);
    this.speedBtn.setText(speedLabel(next));
  }

  private flash(side: Side): void {
    if (side === 'enemy') {
      this.enemyPortrait.setFillStyle(0xffffff, 0.9);
      this.time.delayedCall(90, () => this.enemyPortrait.setFillStyle(COLORS.red, 0.3));
    } else {
      this.playerHp.setAlpha(0.3);
      this.time.delayedCall(90, () => this.playerHp.setAlpha(1));
    }
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
      const healed = run.recover();
      c.add(
        text(this, CX, 560, 40, COLORS.ok)
          .setOrigin(0.5)
          .setText(`전투 후 회복 +${healed}  (HP ${run.player.hp}/${run.player.maxHp})`),
      );
      c.add(text(this, CX, 630, 46).setOrigin(0.5).setText('보상을 하나 고르세요'));
      run.rewardOffers().forEach((offer, i) => {
        const y = 800 + i * 330;
        const box = this.add.container(CX, y);
        box.add([
          this.add
            .rectangle(0, 0, GAME_WIDTH - 120, 290, offer.special ? 0x3a2410 : COLORS.panel)
            .setStrokeStyle(offer.special ? 9 : 5, offer.special ? 0xffd166 : COLORS.gold),
          text(this, 0, -100, 46, offer.special ? '#ffd166' : COLORS.text)
            .setOrigin(0.5)
            .setText(offer.special ? `★ ${offer.name} (보스 보상)` : offer.name),
          text(this, 0, -60, 30, COLORS.textDim)
            .setOrigin(0.5, 0)
            .setAlign('center')
            .setLineSpacing(6)
            .setWordWrapWidth(GAME_WIDTH - 180, true)
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

function speedLabel(s: AnimSpeed): string {
  return s === 'skip' ? '연출 끔' : `×${s}`;
}
