import Phaser from 'phaser';
import { COLORS, FONT, MIN_TOUCH } from '../config/display';

export interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: number;
  fill?: number;
}

/**
 * Large touch-friendly button. Fires on pointer *up* inside the button (so a finger that
 * slides off cancels the press), with a short cooldown to swallow double-taps.
 */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private pressed = false;
  private lastFire = 0;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    onClick: () => void,
    opts: ButtonOptions = {},
  ) {
    super(scene, x, y);
    const w = Math.max(opts.width ?? 560, MIN_TOUCH);
    const h = Math.max(opts.height ?? 150, MIN_TOUCH);
    const fill = opts.fill ?? COLORS.panelLight;

    this.bg = scene.add.rectangle(0, 0, w, h, fill).setStrokeStyle(6, COLORS.gold);
    this.label = scene.add
      .text(0, 0, text, { fontFamily: FONT, fontSize: `${opts.fontSize ?? 56}px`, color: COLORS.text })
      .setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.setSize(w, h);
    this.setInteractive({ useHandCursor: true });

    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.pressed = true;
      this.setScale(0.96);
    });
    this.on('pointerout', () => {
      this.pressed = false;
      this.setScale(1);
    });
    this.on('pointerup', () => {
      const wasPressed = this.pressed;
      this.pressed = false;
      this.setScale(1);
      const now = scene.time.now;
      if (!wasPressed || !this.enabled || now - this.lastFire < 250) return;
      this.lastFire = now;
      onClick();
    });

    scene.add.existing(this);
  }

  setEnabled(on: boolean): this {
    this.enabled = on;
    this.setAlpha(on ? 1 : 0.45);
    return this;
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }
}
