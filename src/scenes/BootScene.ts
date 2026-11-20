import Phaser from 'phaser';
import { COLORS, FONT, GAME_WIDTH } from '../config/display.ts';
import { gameContext } from '../game/context.ts';
import { SceneKey } from './keys.ts';

/** Validates game data, then goes to the title. Shows the errors on screen if data is broken. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    try {
      gameContext();
    } catch (err) {
      this.cameras.main.setBackgroundColor(COLORS.bg);
      this.add
        .text(40, 60, '데이터 오류\n\n' + (err instanceof Error ? err.message : String(err)), {
          fontFamily: FONT,
          fontSize: '30px',
          color: COLORS.danger,
          wordWrap: { width: GAME_WIDTH - 80, useAdvancedWrap: true },
        });
      return;
    }
    this.scene.start(SceneKey.Title);
  }
}
