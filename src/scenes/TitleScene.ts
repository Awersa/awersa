import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config/display';
import { Button } from '../ui/Button';
import { SceneKey } from './keys';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Title);
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    this.cameras.main.setBackgroundColor(COLORS.bg);

    // Placeholder emblem: a coin.
    this.add.circle(cx, 560, 170, COLORS.gold);
    this.add.circle(cx, 560, 140, COLORS.goldDark);

    this.add
      .text(cx, 860, 'CLASH DUEL', { fontFamily: FONT, fontSize: '120px', color: COLORS.text, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(cx, 980, '무한 합 모드', { fontFamily: FONT, fontSize: '60px', color: COLORS.textDim })
      .setOrigin(0.5);

    new Button(this, cx, 1340, '시작', () => this.scene.start(SceneKey.Battle));

    this.add
      .text(cx, GAME_HEIGHT - 80, `v${__APP_VERSION__}`, { fontFamily: FONT, fontSize: '32px', color: COLORS.textDim })
      .setOrigin(0.5);
  }
}
