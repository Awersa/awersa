import Phaser from 'phaser';
import { COLORS, FONT, MIN_TOUCH } from '../config/display.ts';
import { makePressable } from './pressable.ts';

export interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: number;
  fill?: number;
  stroke?: number;
}

/** Large touch-friendly button. */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private readonly setPressEnabled: (on: boolean) => void;
  private readonly baseStroke: number;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, opts: ButtonOptions = {}) {
    super(scene, x, y);
    const w = Math.max(opts.width ?? 560, MIN_TOUCH);
    const h = Math.max(opts.height ?? 150, MIN_TOUCH);
    this.baseStroke = opts.stroke ?? COLORS.gold;
    this.bg = scene.add.rectangle(0, 0, w, h, opts.fill ?? COLORS.panelLight).setStrokeStyle(6, opts.stroke ?? COLORS.gold);
    this.label = scene.add
      .text(0, 0, text, { fontFamily: FONT, fontSize: `${opts.fontSize ?? 56}px`, color: COLORS.text, align: 'center' })
      .setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.setSize(w, h);
    this.setPressEnabled = makePressable(this, onClick);
    scene.add.existing(this);
  }

  setEnabled(on: boolean): this {
    this.setPressEnabled(on);
    this.setAlpha(on ? 1 : 0.4);
    return this;
  }

  /** Thick bright outline to show a toggled/selected state. */
  setHighlight(on: boolean): this {
    this.bg.setStrokeStyle(on ? 12 : 6, on ? 0xffffff : this.baseStroke);
    return this;
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }
}
