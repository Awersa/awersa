import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config/display.ts';
import { makePressable } from './pressable.ts';

const MAX_LINES = 300;
const VISIBLE = 34;

/** Full-screen, collapsible battle log. Drag up/down to scroll. Rendered on canvas (no DOM/HTML). */
export class LogPanel extends Phaser.GameObjects.Container {
  private readonly lines: string[] = [];
  private readonly bodyText: Phaser.GameObjects.Text;
  private offset = 0; // lines scrolled up from the bottom
  private dragStartY: number | null = null;
  private dragStartOffset = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    const bg = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.92).setOrigin(0).setInteractive();
    this.bodyText = scene.add.text(40, 150, '', {
      fontFamily: FONT,
      fontSize: '32px',
      color: COLORS.text,
      lineSpacing: 10,
      wordWrap: { width: GAME_WIDTH - 80, useAdvancedWrap: true },
    });
    const title = scene.add.text(40, 60, '전투 로그', { fontFamily: FONT, fontSize: '48px', color: COLORS.text });
    const close = scene.add.container(GAME_WIDTH - 150, 75);
    close.add([
      scene.add.rectangle(0, 0, 240, 130, COLORS.panelLight).setStrokeStyle(4, COLORS.gold),
      scene.add.text(0, 0, '닫기', { fontFamily: FONT, fontSize: '44px', color: COLORS.text }).setOrigin(0.5),
    ]);
    close.setSize(240, 130);
    makePressable(close, () => this.setVisible(false));

    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragStartY = p.y;
      this.dragStartOffset = this.offset;
    });
    bg.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragStartY === null || !p.isDown) return;
      const dl = Math.round((p.y - this.dragStartY) / 42);
      this.offset = Math.max(0, Math.min(Math.max(0, this.lines.length - VISIBLE), this.dragStartOffset + dl));
      this.render();
    });
    bg.on('pointerup', () => (this.dragStartY = null));

    this.add([bg, title, this.bodyText, close]);
    this.setDepth(1000).setVisible(false);
    scene.add.existing(this);
  }

  push(...lines: string[]): void {
    this.lines.push(...lines);
    if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES);
    this.offset = 0;
    this.render();
  }

  open(): void {
    this.offset = 0;
    this.render();
    this.setVisible(true);
  }

  private render(): void {
    const end = this.lines.length - this.offset;
    this.bodyText.setText(this.lines.slice(Math.max(0, end - VISIBLE), end).join('\n'));
  }
}
