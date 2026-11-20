import Phaser from 'phaser';
import { FONT } from '../config/display.ts';

/**
 * A character/enemy picture slot. Uses the texture `key` if it was loaded, otherwise a colored
 * box with the name (placeholder). `setPose` swaps idle/attack textures when both exist.
 */
export class Portrait extends Phaser.GameObjects.Container {
  private readonly img: Phaser.GameObjects.Image | null;
  private readonly box: Phaser.GameObjects.Rectangle;
  private readonly base: string;
  private readonly boxW: number;
  private readonly boxH: number;
  private readonly color: number;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, assetBase: string | undefined, label: string, color: number) {
    super(scene, x, y);
    this.boxW = w;
    this.boxH = h;
    this.color = color;
    this.base = assetBase ?? '';
    const idle = `${this.base}.idle`;
    this.box = scene.add.rectangle(0, 0, w, h, color, 0.3).setStrokeStyle(4, color);
    this.add(this.box);
    if (assetBase && scene.textures.exists(idle)) {
      this.img = scene.add.image(0, 0, idle);
      this.fit();
      this.add(this.img);
    } else {
      this.img = null;
      this.add(scene.add.text(0, 0, label, { fontFamily: FONT, fontSize: '40px', color: '#f2e6d0', align: 'center' }).setOrigin(0.5));
    }
    scene.add.existing(this);
  }

  private fit(): void {
    if (!this.img) return;
    const s = Math.min(this.boxW / this.img.width, this.boxH / this.img.height);
    this.img.setScale(s);
  }

  setPose(pose: 'idle' | 'attack'): void {
    if (!this.img) return;
    const key = `${this.base}.${pose}`;
    this.img.setTexture(this.scene.textures.exists(key) ? key : `${this.base}.idle`);
    this.fit();
  }

  private homeX: number | null = null;
  private crack: Phaser.GameObjects.Graphics | null = null;

  /** Knocked away from the hit (strength 0..1), then settles back. */
  knock(strength: number): void {
    this.homeX ??= this.x;
    this.scene.tweens.killTweensOf(this);
    this.x = this.homeX;
    const dx = 14 + 30 * strength;
    this.scene.tweens.add({ targets: this, x: this.homeX - dx, duration: 60, yoyo: true, ease: 'Quad.easeOut', onComplete: () => this.setX(this.homeX!) });
    this.scene.tweens.add({ targets: this, scale: 1 - 0.05 * strength, duration: 60, yoyo: true });
  }

  /** Staggered look: tilted, desaturated, cracked. */
  setStaggered(on: boolean): void {
    this.setAngle(on ? -7 : 0);
    if (this.img) {
      if (on) this.img.setTint(0x8a8070);
      else this.img.clearTint();
    } else this.box.setStrokeStyle(4, on ? 0xf1c40f : this.color);
    if (on && !this.crack) {
      const g = this.scene.add.graphics();
      g.lineStyle(5, 0xf1c40f, 0.9);
      g.beginPath();
      g.moveTo(-this.boxW * 0.35, -this.boxH * 0.45);
      g.lineTo(-this.boxW * 0.05, -this.boxH * 0.1);
      g.lineTo(-this.boxW * 0.2, this.boxH * 0.05);
      g.lineTo(this.boxW * 0.15, this.boxH * 0.45);
      g.strokePath();
      this.crack = g;
      this.add(g);
    } else if (!on && this.crack) {
      this.crack.destroy();
      this.crack = null;
    }
  }

  flash(color = 0xffffff): void {
    if (this.img) {
      this.img.setTintFill(color);
      this.scene.time.delayedCall(90, () => this.img?.clearTint());
    } else {
      const prev = this.box.fillColor;
      this.box.setFillStyle(color, 0.9);
      this.scene.time.delayedCall(90, () => this.box.setFillStyle(prev, 0.3));
    }
  }
}
