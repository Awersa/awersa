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

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, assetBase: string | undefined, label: string, color: number) {
    super(scene, x, y);
    this.boxW = w;
    this.boxH = h;
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
