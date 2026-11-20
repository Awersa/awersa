import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config/display.ts';
import { effectiveSkill, giftDef, isBossFloor, powerRange, SKILL_SLOTS } from '../core/index.ts';
import { gameContext } from '../game/context.ts';
import { getRun } from '../game/run.ts';
import { makePressable } from '../ui/pressable.ts';
import { SceneKey } from './keys.ts';

const CX = GAME_WIDTH / 2;
const t = (s: Phaser.Scene, x: number, y: number, size: number, color: string = COLORS.text) =>
  s.add.text(x, y, '', { fontFamily: FONT, fontSize: `${size}px`, color });

/** Reward choice after a won battle (3 offers). The run is already saved in this phase. */
export class RewardScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Reward);
  }

  create(): void {
    const run = getRun();
    if (!run?.reward) {
      this.scene.start(run ? SceneKey.Battle : SceneKey.Title);
      return;
    }
    const { bal } = gameContext();
    const p = run.player;
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.cameras.main.fadeIn(250, 18, 13, 11);

    t(this, CX, 110, 64, COLORS.ok).setOrigin(0.5).setText(`${run.floor}층 ${isBossFloor(run.floor, bal) ? '보스 ' : ''}돌파!`);
    t(this, CX, 195, 36, COLORS.textDim)
      .setOrigin(0.5)
      .setText(`전투 후 회복 +${run.reward.healed}  ·  HP ${p.hp}/${p.maxHp}`);

    // Current build summary
    const build = SKILL_SLOTS.map((s) => {
      const sk = effectiveSkill(p, s);
      const r = powerRange(sk);
      return `${s} ${r.min}~${r.max} (코인 ${sk.coinCount})`;
    }).join('   ');
    t(this, CX, 260, 30, COLORS.textDim).setOrigin(0.5).setText(build);
    const gifts = p.gifts.map((g) => giftDef(bal, g)?.name ?? g);
    t(this, CX, 310, 30, '#ffd6a0')
      .setOrigin(0.5)
      .setAlign('center')
      .setWordWrapWidth(GAME_WIDTH - 80, true)
      .setText(gifts.length ? `기프트: ${gifts.join(' · ')}` : '기프트 없음');

    t(this, CX, 420, 50).setOrigin(0.5).setText('보상을 하나 고르세요');

    let chosen = false;
    run.reward.offers.forEach((offer, i) => {
      const y = 640 + i * 400;
      const box = this.add.container(CX, y);
      const special = offer.special ?? false;
      const isGift = offer.kind === 'gift';
      const stroke = special ? 0xffd166 : isGift ? 0xb48cff : COLORS.gold;
      box.add([
        this.add.rectangle(0, 0, GAME_WIDTH - 100, 360, special ? 0x3a2410 : isGift ? 0x2a2038 : COLORS.panel).setStrokeStyle(special ? 9 : 6, stroke),
        t(this, 0, -130, 50, special ? '#ffd166' : isGift ? '#d9c2ff' : COLORS.text)
          .setOrigin(0.5)
          .setText(special ? `★ ${offer.name} (보스 보상)` : isGift ? `◆ ${offer.name}` : offer.name),
        t(this, 0, -80, 34, COLORS.textDim)
          .setOrigin(0.5, 0)
          .setAlign('center')
          .setLineSpacing(8)
          .setWordWrapWidth(GAME_WIDTH - 180, true)
          .setText(offer.description),
      ]);
      box.setSize(GAME_WIDTH - 100, 360);
      makePressable(box, () => {
        if (chosen) return;
        chosen = true;
        run.claimReward(offer);
        this.cameras.main.fadeOut(180);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(SceneKey.Battle));
      });
      box.setAlpha(0).setY(y + 30);
      this.tweens.add({ targets: box, alpha: 1, y, duration: 260, delay: i * 90, ease: 'Cubic.easeOut' });
    });

    t(this, CX, GAME_HEIGHT - 70, 30, COLORS.textDim).setOrigin(0.5).setText('자동 저장됨 — 앱을 꺼도 여기서 이어집니다');
  }
}
