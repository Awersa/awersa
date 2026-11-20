import Phaser from 'phaser';
import { COLORS, DAMAGE_TYPE_KO, FONT, GAME_HEIGHT, GAME_WIDTH, RESIST_KO } from '../config/display.ts';
import {
  BATTLE_END_REASON,
  effectiveSkill,
  formatEvent,
  headsChance,
  isBossFloor,
  isStaggered,
  maxOneSidedDamage,
  playerStatus,
  powerRange,
  takeTurn,
  actionSkill,
  statusName,
  stackLabel,
  type Balance,
  type EffectiveSkill,
  type SkillSlot,
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
import { Portrait } from '../ui/portrait.ts';
import { reducedMotion } from '../ui/fx.ts';
import { playBgm, sfx } from '../game/audio.ts';
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
  private selected: number | 'defense' | null = null;
  private defenseBtn!: Button;
  private enemyStatuses!: Phaser.GameObjects.Text;
  private playerStatuses!: Phaser.GameObjects.Text;

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
  private newBest = false;
  /** What each side used this turn (for hit sounds). */
  private turnSlots: Partial<Record<Side, SkillSlot | 'defense'>> = {};
  /** Stagger state at the start of the animating turn (fighters start in that stance). */
  private staggeredBefore: Record<Side, boolean> = { player: false, enemy: false };
  private animating = false;
  private speedBtn!: Button;
  private enemyPortrait!: Portrait;
  private intentBox!: Phaser.GameObjects.Rectangle;
  private lastIntent = '';
  private panicVeil!: Phaser.GameObjects.Rectangle;

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
    this.cameras.main.fadeIn(250, 18, 13, 11);
    this.lastIntent = '';
    this.selected = null;
    this.overlay = null;
    this.cards = [];
    this.animating = false;
    this.newBest = false;

    const { state, events, resumed } = run.ensureBattle();
    const enemy = state.enemy;
    this.state = state;
    this.names = { player: run.player.name, enemy: enemy.name };

    const bgKey = enemy.boss && this.textures.exists('bg.boss') ? 'bg.boss' : 'bg.battle';
    if (this.textures.exists(bgKey)) {
      const bg = this.add.image(CX, GAME_HEIGHT / 2, bgKey).setAlpha(0.35);
      bg.setScale(Math.max(GAME_WIDTH / bg.width, GAME_HEIGHT / bg.height));
    }
    playBgm(this, enemy.boss ? 'bgm.boss' : 'bgm.battle');
    this.buildLayout(run.floor);
    this.log.push(
      `===== ${run.floor}층: ${enemy.name}${enemy.boss ? ' (보스)' : ''}${resumed ? ' — 이어하기' : ''} =====`,
      ...this.lines(events),
    );
    this.resultText.setText(
      bal.battle.enemyHpZero === 'lose'
        ? '누구든 체력이 0이 되면 패배 — 상대를 죽이지 마라.'
        : '상대의 체력을 0으로 만들면 승리.\n합에서 이기면 남은 코인으로 일방 공격한다.',
    );
    this.animator = new ClashAnimator(this, {
      names: this.names,
      coinCount: (side, slot) => actionSkill(this.state[side], slot).coinCount,
      statusLabel: (id) => statusName(bal, id),
      setHp: (side, hp, duration) => (side === 'player' ? this.playerHp : this.enemyHp).tweenHp(hp, duration),
      setSanity: (side, value) => side === 'player' && this.sanity.setValue(value, headsChance({ hasSanity: true, sanity: value }, bal)),
      setClashWins: (side, wins, needed) => {
        if (needed === null) return;
        (side === 'player' ? this.playerInfo : this.enemyStatus).setText(pips(wins, needed));
      },
      flash: (side) => this.flash(side),
      sfx: (key) => sfx(this, key),
      damageType: (side) => {
        const slot = this.turnSlots[side];
        return slot ? actionSkill(this.state[side], slot).damageType : null;
      },
      pose: (side, pose) => side === 'enemy' && this.enemyPortrait.setPose(pose),
      knockback: (side, strength) => {
        if (reducedMotion()) return;
        if (side === 'enemy') this.enemyPortrait.knock(strength);
        else {
          this.tweens.killTweensOf(this.playerHp);
          this.playerHp.x = 90;
          this.tweens.add({ targets: this.playerHp, x: 90 + 10 + 18 * strength, duration: 50, yoyo: true, repeat: 1, onComplete: () => this.playerHp.setX(90) });
        }
      },
      setStaggered: (side, on) => (side === 'enemy' ? this.enemyPortrait.setStaggered(on) : this.setPlayerStaggerLook(on)),
      fighter: (side) => {
        const u = this.state[side];
        const dt = u.skills.S1.damageType;
        return {
          weapon: dt === 'pierce' ? 'spear' : dt === 'blunt' ? 'hammer' : 'sword',
          ...(u.asset ? { asset: u.asset } : {}),
          staggered: this.staggeredBefore[side],
        };
      },
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
        if (this.animating) return;
        const run = getRun();
        const best = run?.finish() ?? false;
        setRun(null);
        this.scene.start(SceneKey.GameOver, run ? { characterId: run.characterId, floor: run.floor, kills: run.kills, best, reason: '포기' } : {});
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

    this.enemyPortrait = new Portrait(this, 230, 510, 280, 260, this.state.enemy.asset, '적', COLORS.red);
    this.intentBox = this.add.rectangle(700, 510, 580, 260, COLORS.panel).setStrokeStyle(4, COLORS.red);
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
      this.cards.push(new SkillCard(this, x, 1490, () => this.pick(i), i));
    }

    this.defenseBtn = new Button(this, 250, 1800, '방어', () => this.pick('defense'), {
      width: 400,
      height: 170,
      fontSize: 34,
      fill: 0x1f2a33,
      stroke: 0x6fa8d6,
    });
    this.actionBtn = new Button(this, 765, 1800, '합 개시', () => this.confirm(), {
      width: 510,
      height: 170,
      fontSize: 52,
      fill: 0x5a2a1a,
    });
    this.enemyStatuses = text(this, 230, 600, 28, '#ffd6a0').setOrigin(0.5).setAlign('center').setLineSpacing(4);
    this.playerStatuses = text(this, 90, 1288, 30, '#ffd6a0').setOrigin(0, 0.5);

    this.panicVeil = this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x5a1d7a, 0).setDepth(350).setVisible(false);
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
    this.enemyStatuses.setText(this.statusList(e, '\n'));
    this.playerStatuses.setText(this.statusList(p, ' · '));

    // Enemy intent
    if (this.state.enemyIntent === 'defense') {
      const sk = actionSkill(e, 'defense');
      const r = powerRange(sk);
      this.intentText
        .setText(`방어: ${DEFENSE_KO[sk.type]}\n${sk.name}\n위력 ${r.min} ~ ${r.max} · ${DEFENSE_HINT[sk.type]}`)
        .setColor('#9fd0ff');
    } else if (this.state.enemyIntent) {
      const sk = effectiveSkill(e, this.state.enemyIntent);
      const r = powerRange(sk);
      const dmg = maxOneSidedDamage(e, sk, sk.coinCount, p, sk.coinCount, bal);
      this.intentText.setText(
        `${sk.slot} ${sk.name}\n위력 ${r.min} ~ ${r.max} · 코인 ${sk.coinCount}개\n${DAMAGE_TYPE_KO[sk.damageType]}${effectSummary(sk, bal, ' · ')} · 최대 ${dmg}`,
      );
      this.intentText.setColor(dmg >= p.hp ? COLORS.danger : COLORS.text);
    } else {
      this.intentText.setText(isStaggered(e) ? '흐트러짐 — 행동 불가' : '—').setColor(COLORS.textDim);
    }
    if (this.intentText.text !== this.lastIntent) {
      if (this.lastIntent !== '' && getSettings().animSpeed !== 'skip') {
        this.intentText.setAlpha(0).setX(460);
        this.tweens.add({ targets: this.intentText, alpha: 1, x: 430, duration: 240, ease: 'Cubic.easeOut' });
        this.intentBox.setStrokeStyle(8, 0xff8a7a);
        this.time.delayedCall(260, () => this.intentBox.setStrokeStyle(4, COLORS.red));
      }
      this.lastIntent = this.intentText.text;
    }

    this.enemyPortrait.setStaggered(isStaggered(e));
    this.setPlayerStaggerLook(isStaggered(p));
    this.setPanicVeil(p.panic !== 'none');
  }

  private setPlayerStaggerLook(on: boolean): void {
    this.playerName.setColor(on ? '#f1c40f' : COLORS.text);
    this.tweens.killTweensOf(this.playerName);
    this.playerName.setAngle(0);
    if (on && !reducedMotion()) this.tweens.add({ targets: this.playerName, angle: -4, duration: 120, yoyo: true, repeat: 3 });
  }

  private setPanicVeil(on: boolean): void {
    this.tweens.killTweensOf(this.panicVeil);
    this.panicVeil.setVisible(on).setFillStyle(0x5a1d7a, on ? 0.12 : 0);
    if (on && !reducedMotion()) this.tweens.add({ targets: this.panicVeil, fillAlpha: 0.24, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** Small "N턴" badge between turns. */
  private turnBadge(): void {
    if (getSettings().animSpeed === 'skip' || this.state.outcome) return;
    const t = text(this, CX, 700, 46, '#ffe08a').setOrigin(0.5).setText(`${this.state.turn}턴`).setDepth(420).setAlpha(0).setScale(0.7);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: 670, delay: 650, duration: 300, onComplete: () => t.destroy() });
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
      card.show({
        skill: sk,
        ...r,
        maxDamage,
        canKill: maxDamage >= e.hp,
        killIsLoss: bal.battle.enemyHpZero === 'lose',
        effects: effectSummary(sk, bal, ''),
      });
      card.setEnabled(status.canChoose && !this.state.outcome && !this.animating);
      card.setSelected(this.selected === i);
    });

    // Defense button
    if (p.defenseSkill) {
      const d = actionSkill(p, 'defense');
      const r = powerRange(d);
      const sel = this.selected === 'defense';
      this.defenseBtn.setText(`${sel ? '▶ ' : ''}${DEFENSE_KO[d.type]}: ${d.name}\n위력 ${r.min}~${r.max}`);
      this.defenseBtn.setEnabled(status.canDefend && !this.state.outcome && !this.animating);
      this.defenseBtn.setHighlight(sel);
    } else this.defenseBtn.setVisible(false);

    if (this.state.outcome) this.actionBtn.setEnabled(false);
    else if (this.animating) this.actionBtn.setText('스킵 ▶▶').setEnabled(true);
    else if (!status.canChoose) {
      this.actionBtn.setText(status.reason === 'stagger' ? '흐트러짐\n턴 넘기기' : '패닉\n무작위 행동').setEnabled(true);
    } else {
      this.actionBtn
        .setText(this.selected === null ? '스킬 선택' : this.selected === 'defense' ? '방어 개시' : '합 개시')
        .setEnabled(this.selected !== null);
    }
  }

  private statusList(u: UnitState, sep: string): string {
    const { bal } = gameContext();
    return Object.entries(u.statuses)
      .map(([id, s]) => stackLabel(statusName(bal, id), s.potency, s.count))
      .join(sep);
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

  private pick(i: number | 'defense'): void {
    if (this.animating || this.state.outcome || !playerStatus(this.state).canChoose) return;
    if (i === 'defense' && !playerStatus(this.state).canDefend) return;
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
    this.staggeredBefore = { player: isStaggered(this.state.player), enemy: isStaggered(this.state.enemy) };
    const events = takeTurn(this.state, status.canChoose ? this.selected : null, bal);
    this.turnSlots = {};
    for (const ev of events) if (ev.t === 'skillUse' && !this.turnSlots[ev.side]) this.turnSlots[ev.side] = ev.slot;
    this.selected = null;
    // Persist immediately (before the animation), so closing the app never loses a turn or a result.
    const run = getRun();
    if (run) {
      if (this.state.outcome === 'win') run.winBattle();
      else if (this.state.outcome === 'lose') this.newBest = run.finish();
      else run.save();
    }

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
      else this.turnBadge();
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
    if (side === 'enemy') this.enemyPortrait.flash();
    else {
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
    sfx(this, win ? 'sfx.victory' : 'sfx.defeat');
    c.add(this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.8).setOrigin(0).setInteractive());
    const title = text(this, CX, 760, 140, win ? COLORS.ok : COLORS.danger).setOrigin(0.5).setText(win ? '승리' : '패배');
    title.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    c.add([title, text(this, CX, 900, 44, COLORS.textDim).setOrigin(0.5).setText(reason)]);
    c.add(
      new Button(this, CX, 1150, win ? '보상 받기' : '결과 보기', () => {
        if (win) this.scene.start(SceneKey.Reward);
        else {
          setRun(null);
          this.scene.start(SceneKey.GameOver, { characterId: run.characterId, floor: run.floor, kills: run.kills, best: this.newBest, reason });
        }
      }),
    );
    c.add(new Button(this, CX, 1350, '로그 보기', () => this.log.open(), { fill: COLORS.panel }));
  }
}

function speedLabel(s: AnimSpeed): string {
  return s === 'skip' ? '연출 끔' : `×${s}`;
}

const DEFENSE_KO = { attack: '공격', guard: '수비', evade: '회피', counter: '반격' } as const;
const DEFENSE_HINT = { attack: '', guard: '피해 감소', evade: '코인 무효화', counter: '맞받아 합' } as const;

/** Short list of the statuses a skill applies, e.g. "출혈·호흡" (prefixed with `prefix` when non-empty). */
function effectSummary(sk: EffectiveSkill, bal: Balance, prefix: string): string {
  const ids = new Set<string>();
  for (const e of [...(sk.onUse ?? []), ...(sk.coinEffects ?? []).flat()]) ids.add(e.type === 'burst' ? `${e.status}!` : e.status);
  if (ids.size === 0) return '';
  const names = [...ids].map((id) => (id.endsWith('!') ? `${statusName(bal, id.slice(0, -1))}폭발` : statusName(bal, id)));
  return prefix + names.join('·');
}
