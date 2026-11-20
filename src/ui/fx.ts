import Phaser from 'phaser';

/**
 * Lightweight particle bursts and motion helpers for the battle screen.
 * Bursts are short (≤ 0.9 s) and small (≤ 16 particles) to stay cheap on low-end phones.
 */

export const FX_TEX = {
  dot: 'fx.dot',
  shard: 'fx.shard',
  drop: 'fx.drop',
  streak: 'fx.streak',
} as const;

/** Generates the particle textures once (white, tinted per burst). */
export function ensureFxTextures(scene: Phaser.Scene): void {
  const make = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({}, false);
    g.fillStyle(0xffffff, 1);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  };
  make(FX_TEX.dot, 12, 12, (g) => g.fillCircle(6, 6, 6));
  make(FX_TEX.shard, 14, 14, (g) => g.fillTriangle(0, 14, 7, 0, 14, 10));
  make(FX_TEX.drop, 10, 16, (g) => {
    g.fillCircle(5, 11, 5);
    g.fillTriangle(1, 10, 5, 0, 9, 10);
  });
  make(FX_TEX.streak, 28, 4, (g) => g.fillRect(0, 0, 28, 4));
}

let reduced: boolean | null = null;
/** Respects the OS "reduce motion" setting (no shakes / flashes / knockback). */
export function reducedMotion(): boolean {
  if (reduced === null) {
    try {
      reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduced = false;
    }
  }
  return reduced;
}

export type BurstKind =
  | 'clash'
  | 'shards'
  | 'slash'
  | 'pierce'
  | 'blunt'
  | 'crit'
  | 'bleed'
  | 'burn'
  | 'tremor'
  | 'rupture'
  | 'sinking'
  | 'poise'
  | 'charge'
  | 'guard'
  | 'stagger';

interface Preset {
  tex: string;
  count: number;
  tint: number | number[];
  speed: [number, number];
  angle?: [number, number];
  life: number;
  scale: [number, number];
  gravityY?: number;
  rotate?: boolean;
  blend?: Phaser.BlendModes;
}

const ADD = Phaser.BlendModes.ADD;

const PRESETS: Record<BurstKind, Preset> = {
  clash: { tex: FX_TEX.dot, count: 16, tint: [0xffe08a, 0xffb347, 0xffffff], speed: [180, 520], life: 420, scale: [0.9, 0], blend: ADD },
  shards: { tex: FX_TEX.shard, count: 10, tint: [0xd9a441, 0x8a5a12, 0xc0392b], speed: [120, 360], life: 650, scale: [1.2, 0.4], gravityY: 900, rotate: true },
  slash: { tex: FX_TEX.streak, count: 9, tint: [0xffffff, 0xffd9d0], speed: [300, 700], angle: [200, 250], life: 260, scale: [1.4, 0.2], blend: ADD },
  pierce: { tex: FX_TEX.dot, count: 10, tint: [0xfff2a8, 0xffffff], speed: [250, 600], angle: [250, 290], life: 300, scale: [0.7, 0], blend: ADD },
  blunt: { tex: FX_TEX.dot, count: 12, tint: [0xb59a7a, 0x7a6650, 0xe8d8c0], speed: [100, 320], life: 520, scale: [1.6, 0.2], gravityY: 300 },
  crit: { tex: FX_TEX.dot, count: 16, tint: [0xffe08a, 0xffffff], speed: [200, 650], life: 500, scale: [1.1, 0], blend: ADD },
  bleed: { tex: FX_TEX.drop, count: 9, tint: [0xc0392b, 0x8e1b12], speed: [60, 220], angle: [200, 340], life: 700, scale: [1.2, 0.6], gravityY: 900 },
  burn: { tex: FX_TEX.dot, count: 12, tint: [0xff9a3b, 0xffd166, 0xff5e3b], speed: [40, 140], angle: [240, 300], life: 800, scale: [1.0, 0], gravityY: -260, blend: ADD },
  tremor: { tex: FX_TEX.dot, count: 10, tint: [0xd9c27a, 0x9a8f80], speed: [60, 200], angle: [160, 380], life: 500, scale: [1.3, 0.2], gravityY: 200 },
  rupture: { tex: FX_TEX.shard, count: 10, tint: [0xe8f0ff, 0x9fc3ff], speed: [150, 420], life: 480, scale: [1.0, 0.2], rotate: true, blend: ADD },
  sinking: { tex: FX_TEX.dot, count: 10, tint: [0x4a7ad9, 0x7fb0ff], speed: [20, 90], angle: [60, 120], life: 900, scale: [1.2, 0.3], gravityY: 120 },
  poise: { tex: FX_TEX.dot, count: 10, tint: [0xffffff, 0xcfe8ff], speed: [40, 160], life: 650, scale: [0.8, 0], blend: ADD },
  charge: { tex: FX_TEX.streak, count: 10, tint: [0xfff07a, 0x7fe0ff], speed: [150, 380], life: 380, scale: [0.9, 0.1], blend: ADD },
  guard: { tex: FX_TEX.dot, count: 12, tint: [0x9fd0ff, 0xffffff], speed: [120, 360], life: 420, scale: [1.0, 0], blend: ADD },
  stagger: { tex: FX_TEX.shard, count: 16, tint: [0xf1c40f, 0xffffff, 0x9a8f80], speed: [180, 520], life: 700, scale: [1.4, 0.3], gravityY: 700, rotate: true },
};

/** Status id → burst kind (unknown statuses get a neutral sparkle). */
export function statusBurst(id: string): BurstKind {
  return (['bleed', 'burn', 'tremor', 'rupture', 'sinking', 'poise', 'charge'] as const).find((k) => k === id) ?? 'poise';
}

/** One-shot particle burst at (x, y). Cleans itself up. */
export function burst(scene: Phaser.Scene, kind: BurstKind, x: number, y: number, depth = 460, scaleCount = 1): void {
  const p = PRESETS[kind];
  const emitter = scene.add.particles(x, y, p.tex, {
    speed: { min: p.speed[0], max: p.speed[1] },
    angle: p.angle ? { min: p.angle[0], max: p.angle[1] } : { min: 0, max: 360 },
    lifespan: { min: p.life * 0.6, max: p.life },
    scale: { start: p.scale[0], end: p.scale[1] },
    alpha: { start: 1, end: 0 },
    gravityY: p.gravityY ?? 0,
    tint: p.tint,
    rotate: p.rotate ? { min: 0, max: 360 } : 0,
    blendMode: p.blend ?? Phaser.BlendModes.NORMAL,
    emitting: false,
  });
  emitter.setDepth(depth);
  emitter.explode(Math.max(1, Math.round(p.count * scaleCount)));
  scene.time.delayedCall(p.life + 120, () => emitter.destroy());
}

/** Weapon trail at a strike point: slash arc, thrust line or impact ring. `dir` = attacker facing. */
export function strikeTrail(scene: Phaser.Scene, kind: 'slash' | 'pierce' | 'blunt', x: number, y: number, dir: 1 | -1, ms: number): void {
  const g = scene.add.graphics().setDepth(465).setPosition(x, y);
  if (kind === 'slash') {
    g.lineStyle(10, 0xffffff, 1);
    g.beginPath();
    g.arc(0, 0, 90, Phaser.Math.DegToRad(dir > 0 ? -150 : -30), Phaser.Math.DegToRad(dir > 0 ? 10 : 190), dir < 0);
    g.strokePath();
    g.lineStyle(4, 0xffd9d0, 1);
    g.beginPath();
    g.arc(0, 0, 76, Phaser.Math.DegToRad(dir > 0 ? -140 : -40), Phaser.Math.DegToRad(dir > 0 ? 0 : 180), dir < 0);
    g.strokePath();
    g.setAngle(Phaser.Math.Between(-20, 20));
  } else if (kind === 'pierce') {
    g.lineStyle(8, 0xfff2a8, 1);
    g.lineBetween(-130 * dir, 0, 70 * dir, 0);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(70 * dir, -10, 70 * dir, 10, 100 * dir, 0);
    g.setAngle(Phaser.Math.Between(-12, 12));
  } else {
    g.lineStyle(10, 0xe8d8c0, 1);
    g.strokeCircle(0, 0, 30);
  }
  scene.tweens.add({
    targets: g,
    alpha: 0,
    scale: kind === 'blunt' ? 3 : 1.15,
    duration: Math.max(120, ms),
    ease: 'Cubic.easeOut',
    onComplete: () => g.destroy(),
  });
}
