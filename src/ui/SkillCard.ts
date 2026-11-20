import Phaser from 'phaser';
import { COLORS, DAMAGE_TYPE_KO, FONT, SIN_KO } from '../config/display.ts';
import type { EffectiveSkill } from '../core/index.ts';
import { makePressable } from './pressable.ts';
import { TEX } from './placeholders.ts';
import { reducedMotion } from './fx.ts';

export interface CardInfo {
  skill: EffectiveSkill;
  min: number;
  max: number;
  /** Upper bound of damage dealt to the enemy if it lands everything. */
  maxDamage: number;
  /** Best case reaches the enemy's HP. */
  canKill: boolean;
  /** Whether killing is good (default rule) or a loss (optional duel rule). */
  killIsLoss: boolean;
  /** Short status summary, e.g. "출혈·호흡". */
  effects: string;
}

const W = 490;
const H = 350;

/** Hand card: name, power numbers, coin count and a lethal-risk warning. */
export class SkillCard extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly sub: Phaser.GameObjects.Text;
  private readonly range: Phaser.GameObjects.Text;
  private readonly detail: Phaser.GameObjects.Text;
  private readonly warn: Phaser.GameObjects.Text;
  private readonly coins: Phaser.GameObjects.Container;
  private readonly setPressEnabled: (on: boolean) => void;
  private selected = false;
  private readonly homeY: number;
  private lastKey: string | null = null;
  private dealing = false;
  private wantAlpha = 1;
  /** Order in the hand (staggers the first deal). */
  private readonly index: number;

  constructor(scene: Phaser.Scene, x: number, y: number, onPick: () => void, index = 0) {
    super(scene, x, y);
    this.homeY = y;
    this.index = index;
    this.bg = scene.add.rectangle(0, 0, W, H, COLORS.panel).setStrokeStyle(5, COLORS.panelLight);
    const t = (yy: number, size: number, color: string = COLORS.text) =>
      scene.add.text(0, yy, '', { fontFamily: FONT, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5);
    this.title = t(-130, 46);
    this.sub = t(-78, 30, COLORS.textDim);
    this.range = t(-10, 76);
    this.coins = scene.add.container(0, 62);
    this.detail = t(108, 30, COLORS.textDim);
    this.warn = t(146, 30, COLORS.danger);
    this.add([this.bg, this.title, this.sub, this.range, this.coins, this.detail, this.warn]);
    this.setSize(W, H);
    this.setPressEnabled = makePressable(this, onPick, { pressScale: 0.97 });
    scene.add.existing(this);
  }

  show(info: CardInfo): void {
    const s = info.skill;
    // A different card arrived in this hand slot → deal it in.
    const key = `${s.slot}:${s.id}`;
    if (key !== this.lastKey) {
      this.deal(this.lastKey === null ? this.index * 90 : 0);
      this.lastKey = key;
    }
    this.title.setText(`${s.slot} ${s.name}`);
    this.sub.setText(`${DAMAGE_TYPE_KO[s.damageType]} · ${info.effects || SIN_KO[s.sin]}`);
    this.sub.setColor(info.effects ? '#ffd6a0' : COLORS.textDim);
    this.range.setText(`${info.min} ~ ${info.max}`);
    this.detail.setText(`기본 ${s.basePower} · 코인 ${s.coinPower >= 0 ? '+' : ''}${s.coinPower} × ${s.coinCount}`);
    if (!info.canKill) this.warn.setText(`최대 피해 ${info.maxDamage}`).setColor(COLORS.textDim);
    else if (info.killIsLoss) this.warn.setText(`⚠ 치사 위험 (최대 ${info.maxDamage})`).setColor(COLORS.danger);
    else this.warn.setText(`★ 처치 가능 (최대 ${info.maxDamage})`).setColor(COLORS.ok);
    this.coins.removeAll(true);
    const gap = 46;
    for (let i = 0; i < s.coinCount; i++) {
      const cx = (i - (s.coinCount - 1) / 2) * gap;
      this.coins.add(this.scene.add.image(cx, 0, TEX.coinHeads).setDisplaySize(36, 36));
    }
  }

  /** Slides up from below with a slight spin. */
  private deal(delay: number): void {
    if (reducedMotion()) return;
    this.dealing = true;
    this.scene.tweens.killTweensOf(this);
    this.setY(this.homeY + 160).setAlpha(0).setAngle(this.index === 0 ? -6 : 6);
    this.scene.tweens.add({
      targets: this,
      y: this.homeY,
      alpha: { getStart: () => 0, getEnd: () => this.wantAlpha },
      angle: 0,
      delay,
      duration: 280,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.dealing = false;
        this.setAlpha(this.wantAlpha);
        if (this.selected) this.lift(true);
      },
    });
  }

  private lift(on: boolean): void {
    if (this.dealing || reducedMotion()) return;
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({ targets: this, y: on ? this.homeY - 26 : this.homeY, duration: 140, ease: 'Quad.easeOut' });
  }

  setSelected(on: boolean): void {
    if (on !== this.selected) this.lift(on);
    this.selected = on;
    this.bg.setStrokeStyle(on ? 10 : 5, on ? COLORS.gold : COLORS.panelLight);
    this.bg.fillColor = on ? COLORS.panelLight : COLORS.panel;
  }

  isSelected(): boolean {
    return this.selected;
  }

  setEnabled(on: boolean): void {
    this.setPressEnabled(on);
    this.wantAlpha = on ? 1 : 0.45;
    if (!this.dealing) this.setAlpha(this.wantAlpha);
  }
}
