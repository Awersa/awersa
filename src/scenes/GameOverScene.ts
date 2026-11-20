import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config/display.ts';
import { gameContext } from '../game/context.ts';
import { loadRecords } from '../game/records.ts';
import { RunSession, setRun } from '../game/run.ts';
import { Button } from '../ui/Button.ts';
import { SceneKey } from './keys.ts';

export interface GameOverData {
  characterId?: string;
  floor?: number;
  kills?: number;
  best?: boolean;
  reason?: string;
}

const CX = GAME_WIDTH / 2;

/** End of a run: reached floor, kills, personal best. (The record is already stored by RunSession.finish.) */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.GameOver);
  }

  create(d: GameOverData): void {
    const { data } = gameContext();
    this.cameras.main.setBackgroundColor(COLORS.bg);
    const ch = data.players.find((p) => p.id === d.characterId);
    const rec = loadRecords();
    const best = d.characterId ? rec.best[d.characterId] : undefined;
    const txt = (y: number, size: number, color: string = COLORS.text) =>
      this.add.text(CX, y, '', { fontFamily: FONT, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5);

    txt(360, 120, COLORS.danger).setText('런 종료');
    if (d.reason) txt(480, 40, COLORS.textDim).setText(d.reason);
    txt(680, 60).setText(`${ch?.name ?? ''}`);
    txt(820, 96).setText(`${d.floor ?? 1}층 도달`);
    txt(930, 46, COLORS.textDim).setText(`격파 ${d.kills ?? 0}`);
    if (d.best) {
      const nb = txt(1050, 64, '#ffd166').setText('★ 최고 기록 갱신! ★');
      this.tweens.add({ targets: nb, scale: 1.08, yoyo: true, repeat: -1, duration: 600 });
    } else if (best) txt(1050, 40, COLORS.textDim).setText(`최고 기록: ${best.floor}층 (격파 ${best.kills})`);

    if (d.characterId && ch) {
      new Button(this, CX, 1300, `${ch.name}로 다시`, () => {
        const run = RunSession.start(ch.id);
        setRun(run);
        this.scene.start(SceneKey.Battle);
      });
    }
    new Button(this, CX, 1500, '타이틀로', () => this.scene.start(SceneKey.Title), { fill: COLORS.panel });
    txt(GAME_HEIGHT - 80, 30, COLORS.textDim).setText(`총 ${rec.runs}회 도전`);
  }
}
