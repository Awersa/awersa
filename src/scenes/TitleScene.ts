import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config/display.ts';
import { gameContext } from '../game/context.ts';
import { loadRecords } from '../game/records.ts';
import { RunSession, setRun } from '../game/run.ts';
import { Button } from '../ui/Button.ts';
import { playBgm, stopBgm } from '../game/audio.ts';
import { getSettings, updateSettings } from '../game/settings.ts';
import { SceneKey } from './keys.ts';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Title);
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const { data } = gameContext();
    this.cameras.main.setBackgroundColor(COLORS.bg);
    const saved = RunSession.load();
    const records = loadRecords();
    if (this.textures.exists('bg.title')) {
      const bg = this.add.image(cx, GAME_HEIGHT / 2, 'bg.title').setAlpha(0.5);
      bg.setScale(Math.max(GAME_WIDTH / bg.width, GAME_HEIGHT / bg.height));
    }
    playBgm(this, 'bgm.title');
    const soundLabel = () => (getSettings().sound ? '소리 켬' : '소리 끔');
    const soundBtn: Button = new Button(this, GAME_WIDTH - 140, 80, soundLabel(), () => {
      updateSettings({ sound: !getSettings().sound });
      if (getSettings().sound) playBgm(this, 'bgm.title');
      else stopBgm();
      soundBtn.setText(soundLabel());
    }, { width: 230, height: 130, fontSize: 40, fill: COLORS.panel });

    this.add.circle(cx, 300, 130, COLORS.gold);
    this.add.circle(cx, 300, 104, COLORS.goldDark);
    this.add
      .text(cx, 520, 'CLASH DUEL', { fontFamily: FONT, fontSize: '120px', color: COLORS.text, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add.text(cx, 625, '무한 합 모드', { fontFamily: FONT, fontSize: '54px', color: COLORS.textDim }).setOrigin(0.5);

    let y = 790;
    if (saved) {
      const ch = data.players.find((p) => p.id === saved.characterId);
      new Button(this, cx, y, `이어하기\n${ch?.name ?? ''} · ${saved.floor}층 · HP ${saved.player.hp}/${saved.player.maxHp}`, () => {
        setRun(saved);
        this.scene.start(saved.reward ? SceneKey.Reward : SceneKey.Battle);
      }, { width: 880, height: 200, fontSize: 46, fill: 0x2f4a2a, stroke: 0x7fd18b });
      y += 250;
    }

    this.add.text(cx, y, saved ? '새로 시작 (진행 중인 런은 사라집니다)' : '캐릭터 선택', {
      fontFamily: FONT,
      fontSize: saved ? '34px' : '48px',
      color: saved ? COLORS.textDim : COLORS.text,
    }).setOrigin(0.5);
    y += 140;

    data.players.forEach((p) => {
      const best = records.best[p.id];
      const sub = best ? `최고 ${best.floor}층` : '기록 없음';
      const label = `${p.name}\nHP ${p.maxHp} · ${sub}`;
      const btn: Button = new Button(this, cx, y, label, () => {
        if (saved && !btn.getData('armed')) {
          btn.setData('armed', true).setText(`${p.name}\n한 번 더 누르면 새로 시작`);
          this.time.delayedCall(2500, () => btn.active && btn.setData('armed', false).setText(label));
          return;
        }
        if (saved) RunSession.discardSave();
        const run = RunSession.start(p.id);
        setRun(run);
        this.scene.start(SceneKey.Battle);
      }, { width: 880, height: 190, fontSize: 44 });
      y += 230;
    });

    this.add
      .text(cx, GAME_HEIGHT - 80, `v${__APP_VERSION__}${records.runs ? ` · 총 ${records.runs}회 도전` : ''}`, {
        fontFamily: FONT,
        fontSize: '32px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5);
  }
}
