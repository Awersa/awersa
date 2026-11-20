import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config/display.ts';
import { gameContext } from '../game/context.ts';
import { RunSession, setRun } from '../game/run.ts';
import { powerRange } from '../core/index.ts';
import { Button } from '../ui/Button.ts';
import { SceneKey } from './keys.ts';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Title);
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const { data } = gameContext();
    this.cameras.main.setBackgroundColor(COLORS.bg);

    this.add.circle(cx, 380, 150, COLORS.gold);
    this.add.circle(cx, 380, 122, COLORS.goldDark);
    this.add
      .text(cx, 640, 'CLASH DUEL', { fontFamily: FONT, fontSize: '120px', color: COLORS.text, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add.text(cx, 750, '무한 합 모드', { fontFamily: FONT, fontSize: '56px', color: COLORS.textDim }).setOrigin(0.5);
    this.add.text(cx, 900, '캐릭터 선택', { fontFamily: FONT, fontSize: '48px', color: COLORS.text }).setOrigin(0.5);

    data.players.forEach((p, i) => {
      const s3 = data.skills.find((s) => s.id === p.skills.S3);
      const sub = s3 ? `HP ${p.maxHp} · S3 ${s3.name} ${powerRange(s3).min}~${powerRange(s3).max}` : `HP ${p.maxHp}`;
      new Button(this, cx, 1080 + i * 250, `${p.name}\n${sub}`, () => {
        setRun(new RunSession(p.id));
        this.scene.start(SceneKey.Battle);
      }, { width: 880, height: 210, fontSize: 44 });
    });

    this.add
      .text(cx, GAME_HEIGHT - 80, `v${__APP_VERSION__}`, { fontFamily: FONT, fontSize: '32px', color: COLORS.textDim })
      .setOrigin(0.5);
  }
}
