import Phaser from 'phaser';

/** Asset keys (same names the milestone-7 manifest will use). */
export const TEX = {
  coinHeads: 'ui.coin.heads',
  coinTails: 'ui.coin.tails',
  coinBroken: 'ui.coin.broken',
} as const;

const COIN = 72;

/** Generates placeholder textures for any key that isn't loaded yet. */
export function ensurePlaceholderTextures(scene: Phaser.Scene): void {
  const make = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({}, false);
    draw(g);
    g.generateTexture(key, COIN, COIN);
    g.destroy();
  };
  const r = COIN / 2;
  make(TEX.coinHeads, (g) => {
    g.fillStyle(0xd9a441).fillCircle(r, r, r - 2);
    g.fillStyle(0xf3cf6b).fillCircle(r, r, r - 12);
    g.lineStyle(4, 0x8a5a12).strokeCircle(r, r, r - 3);
  });
  make(TEX.coinTails, (g) => {
    g.fillStyle(0x6b6258).fillCircle(r, r, r - 2);
    g.fillStyle(0x4a433c).fillCircle(r, r, r - 12);
    g.lineStyle(4, 0x2b2622).strokeCircle(r, r, r - 3);
  });
  make(TEX.coinBroken, (g) => {
    g.fillStyle(0x5a1e18).fillCircle(r, r, r - 2);
    g.lineStyle(6, 0x120d0b);
    g.beginPath();
    g.moveTo(r - 6, 4);
    g.lineTo(r + 6, r - 4);
    g.lineTo(r - 8, r + 8);
    g.lineTo(r + 4, COIN - 4);
    g.strokePath();
  });
}
