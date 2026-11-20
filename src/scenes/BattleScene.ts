import Phaser from 'phaser';
import { COLORS, FONT, GAME_WIDTH } from '../config/display';
import { Button } from '../ui/Button';
import { SceneKey } from './keys';

/**
 * Battle screen skeleton (milestone 1): enemy on top, player at the bottom, hand area.
 * Real battle wiring comes in milestone 3 — this scene will only *render* events emitted by src/core.
 */
export class BattleScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Battle);
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    this.cameras.main.setBackgroundColor(COLORS.bg);

    // Enemy slot
    this.add.rectangle(cx, 480, 420, 520, COLORS.red, 0.35).setStrokeStyle(4, COLORS.red);
    this.add.text(cx, 480, '적', { fontFamily: FONT, fontSize: '64px', color: COLORS.text }).setOrigin(0.5);

    // Player slot
    this.add.rectangle(cx, 1130, 420, 520, COLORS.gold, 0.25).setStrokeStyle(4, COLORS.gold);
    this.add.text(cx, 1130, '플레이어', { fontFamily: FONT, fontSize: '64px', color: COLORS.text }).setOrigin(0.5);

    // Hand area placeholder
    this.add.rectangle(cx, 1640, GAME_WIDTH - 60, 360, COLORS.panel).setStrokeStyle(4, COLORS.panelLight);
    this.add
      .text(cx, 1640, '스킬 손패 (마일스톤 3)', { fontFamily: FONT, fontSize: '44px', color: COLORS.textDim })
      .setOrigin(0.5);

    new Button(this, 170, 90, '← 타이틀', () => this.scene.start(SceneKey.Title), {
      width: 300,
      height: 130,
      fontSize: 42,
    });

    this.add
      .text(GAME_WIDTH - 40, 90, '1층', { fontFamily: FONT, fontSize: '52px', color: COLORS.text })
      .setOrigin(1, 0.5);

  }
}
