import Phaser from 'phaser';
import { COLORS, FONT } from '../config/display.ts';

/** HP bar with stagger threshold markers. */
export class HpBar extends Phaser.GameObjects.Container {
  private readonly fill: Phaser.GameObjects.Rectangle;
  /** Lags behind the fill so damage reads as a white chunk draining away. */
  private readonly ghost: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private readonly markers: Phaser.GameObjects.Rectangle[] = [];
  private readonly barW: number;
  private readonly barH: number;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number) {
    super(scene, x, y);
    this.barW = w;
    this.barH = h;
    const bg = scene.add.rectangle(0, 0, w, h, COLORS.hpBack).setOrigin(0, 0.5).setStrokeStyle(3, 0x000000);
    this.ghost = scene.add.rectangle(0, 0, w, h, 0xffffff, 0.75).setOrigin(0, 0.5);
    this.fill = scene.add.rectangle(0, 0, w, h, COLORS.hp).setOrigin(0, 0.5);
    this.label = scene.add
      .text(w / 2, 0, '', { fontFamily: FONT, fontSize: `${Math.round(h * 0.7)}px`, color: COLORS.text, stroke: '#000', strokeThickness: 5 })
      .setOrigin(0.5);
    this.add([bg, this.ghost, this.fill, this.label]);
    scene.add.existing(this);
  }

  private maxHp = 1;

  setValue(hp: number, maxHp: number, thresholds: number[], nextThreshold: number): void {
    this.maxHp = maxHp;
    this.scene.tweens.killTweensOf(this.fill);
    this.scene.tweens.killTweensOf(this.ghost);
    const r = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    this.fill.width = this.barW * r;
    this.ghost.width = this.barW * r;
    this.label.setText(`${hp} / ${maxHp}`);
    this.markers.forEach((m) => m.destroy());
    this.markers.length = 0;
    thresholds.forEach((t, i) => {
      const used = i < nextThreshold;
      const m = this.scene.add
        .rectangle(this.barW * t, 0, 6, this.barH + 16, used ? 0x555555 : COLORS.stagger)
        .setAlpha(used ? 0.5 : 1);
      this.markers.push(m);
      this.addAt(m, 3);
    });
  }

  /** Animated HP change during clash playback (markers are refreshed later by setValue). */
  tweenHp(hp: number, duration: number): void {
    const r = this.maxHp > 0 ? Math.max(0, Math.min(1, hp / this.maxHp)) : 0;
    this.label.setText(`${hp} / ${this.maxHp}`);
    this.scene.tweens.killTweensOf(this.fill);
    this.scene.tweens.killTweensOf(this.ghost);
    const w = this.barW * r;
    if (duration <= 0) {
      this.fill.width = w;
      this.ghost.width = w;
      return;
    }
    if (w >= this.fill.width) {
      // healing: both grow together
      this.scene.tweens.add({ targets: [this.fill, this.ghost], width: w, duration, ease: 'Cubic.easeOut' });
      return;
    }
    this.fill.width = w; // the red bar drops at once…
    this.scene.tweens.add({ targets: this.ghost, width: w, delay: duration * 1.2, duration: duration * 1.6, ease: 'Cubic.easeIn' }); // …the white ghost drains after
  }
}

/** Sanity gauge −45..+45 filled from the center. */
export class SanityGauge extends Phaser.GameObjects.Container {
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private readonly barW: number;
  private readonly max: number;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, max: number) {
    super(scene, x, y);
    this.barW = w;
    this.max = max;
    const bg = scene.add.rectangle(0, 0, w, h, 0x1b1b2a).setOrigin(0, 0.5).setStrokeStyle(3, 0x000000);
    const mid = scene.add.rectangle(w / 2, 0, 4, h + 10, 0xffffff).setAlpha(0.6);
    this.fill = scene.add.rectangle(w / 2, 0, 0, h, COLORS.sanityPos).setOrigin(0, 0.5);
    this.label = scene.add
      .text(w + 20, 0, '', { fontFamily: FONT, fontSize: '36px', color: COLORS.text })
      .setOrigin(0, 0.5);
    this.add([bg, this.fill, mid, this.label]);
    scene.add.existing(this);
  }

  setValue(sanity: number, headsChance: number): void {
    const half = this.barW / 2;
    const len = (Math.min(this.max, Math.abs(sanity)) / this.max) * half;
    this.fill.fillColor = sanity >= 0 ? COLORS.sanityPos : COLORS.sanityNeg;
    this.fill.x = sanity >= 0 ? half : half - len;
    this.fill.width = len;
    this.label.setText(`정신력 ${sanity > 0 ? '+' : ''}${sanity}  (앞면 ${Math.round(headsChance * 100)}%)`);
  }
}

/** ●●○ clash-win pips. */
export function pips(wins: number, needed: number | null): string {
  if (needed === null) return '';
  return '●'.repeat(Math.min(wins, needed)) + '○'.repeat(Math.max(0, needed - wins));
}
