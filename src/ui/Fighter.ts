import Phaser from 'phaser';

export type Weapon = 'sword' | 'spear' | 'hammer';

/** Weapon rest angle (degrees, facing right). Positive = clockwise. */
const REST = 35;

/**
 * A combatant on the clash stage. Uses `<asset>.idle` / `<asset>.attack` images when they were loaded
 * (art should face RIGHT; the enemy is mirrored), otherwise a drawn silhouette with a weapon.
 * Origin is at the feet. All motions are tweens on this container, so they can be killed safely.
 */
export class Fighter extends Phaser.GameObjects.Container {
  readonly homeX: number;
  readonly homeY: number;
  /** +1 faces right (player), -1 faces left (enemy). */
  readonly dir: 1 | -1;
  private readonly figure: Phaser.GameObjects.Container;
  private readonly weapon: Phaser.GameObjects.Container | null;
  private readonly img: Phaser.GameObjects.Image | null;
  private readonly asset: string | undefined;
  private idleTween: Phaser.Tweens.Tween | null = null;
  private guarding = false;

  constructor(scene: Phaser.Scene, x: number, y: number, dir: 1 | -1, color: number, weapon: Weapon, asset?: string) {
    super(scene, x, y);
    this.homeX = x;
    this.homeY = y;
    this.dir = dir;
    this.asset = asset;
    this.figure = scene.add.container(0, 0);
    this.add(this.figure);

    // shadow
    this.addAt(scene.add.ellipse(0, 2, 120, 22, 0x000000, 0.45), 0);

    const idleKey = asset ? `${asset}.idle` : '';
    if (asset && scene.textures.exists(idleKey)) {
      this.img = scene.add.image(0, 0, idleKey).setOrigin(0.5, 1);
      const s = 220 / this.img.height;
      this.img.setScale(s * dir, s);
      this.figure.add(this.img);
      this.weapon = null;
    } else {
      this.img = null;
      const g = scene.add.graphics();
      const dark = Phaser.Display.Color.IntegerToColor(color).darken(35).color;
      // legs
      g.fillStyle(dark, 1);
      g.fillRoundedRect(-24, -70, 20, 70, 6);
      g.fillRoundedRect(4, -70, 20, 70, 6);
      // torso + coat
      g.fillStyle(color, 1);
      g.fillRoundedRect(-34, -150, 68, 90, 16);
      g.fillTriangle(-34, -80, 34, -80, 0, -48);
      // head
      g.fillStyle(0xe8d8c0, 1);
      g.fillCircle(0, -176, 24);
      g.fillStyle(dark, 1);
      g.fillRect(-26, -196, 52, 12); // hair band
      // eye (facing direction)
      g.fillStyle(0x120d0b, 1);
      g.fillCircle(10, -176, 4);
      this.figure.add(g);
      this.figure.setScale(dir, 1);

      // weapon arm pivots at the shoulder
      this.weapon = scene.add.container(14 * dir, -128);
      const w = scene.add.graphics();
      w.fillStyle(0x5b4636, 1);
      w.fillRoundedRect(-4, -10, 8, 26, 3); // grip
      w.fillStyle(0xd8dde6, 1);
      if (weapon === 'sword') {
        w.fillRect(-12, -14, 24, 6); // guard
        w.fillTriangle(-6, -14, 6, -14, 0, -132);
        w.fillRect(-6, -110, 12, 96);
      } else if (weapon === 'spear') {
        w.fillStyle(0x7a5a40, 1);
        w.fillRect(-3, -150, 6, 160);
        w.fillStyle(0xd8dde6, 1);
        w.fillTriangle(-10, -150, 10, -150, 0, -196);
      } else {
        w.fillStyle(0x7a5a40, 1);
        w.fillRect(-4, -100, 8, 110);
        w.fillStyle(0x9aa3ad, 1);
        w.fillRoundedRect(-26, -132, 52, 40, 6);
      }
      this.weapon.add(w);
      this.weapon.setScale(dir, 1).setAngle(REST * dir);
      this.add(this.weapon);
    }

    scene.add.existing(this);
    this.startIdle();
  }

  private startIdle(): void {
    this.idleTween?.stop();
    this.figure.setY(0);
    this.idleTween = this.scene.tweens.add({ targets: this.figure, y: -4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private pose(p: 'idle' | 'attack'): void {
    if (!this.img || !this.asset) return;
    const key = `${this.asset}.${p}`;
    this.img.setTexture(this.scene.textures.exists(key) ? key : `${this.asset}.idle`);
  }

  private tw(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => {
      if (!cfg.duration || (cfg.duration as number) <= 1) {
        this.scene.tweens.add({ ...cfg, duration: 1, onComplete: () => resolve() });
        return;
      }
      this.scene.tweens.add({ ...cfg, onComplete: () => resolve() });
    });
  }

  /** Dash to x (lean forward while moving). */
  async dash(x: number, ms: number): Promise<void> {
    this.setAngle(8 * this.dir);
    await this.tw({ targets: this, x, duration: ms, ease: 'Quad.easeIn' });
    this.setAngle(0);
  }

  async goHome(ms: number): Promise<void> {
    this.pose('idle');
    await this.tw({ targets: this, x: this.homeX, y: this.homeY, angle: 0, duration: ms, ease: 'Quad.easeOut' });
  }

  /** Weapon swing for one strike. */
  async swing(kind: 'slash' | 'pierce' | 'blunt', ms: number): Promise<void> {
    this.pose('attack');
    if (this.img) {
      await this.tw({ targets: this.img, x: 24 * this.dir, duration: ms * 0.4, yoyo: true, ease: 'Quad.easeOut' });
      return;
    }
    const w = this.weapon!;
    this.scene.tweens.killTweensOf(w);
    if (kind === 'pierce') {
      w.setAngle(90 * this.dir);
      await this.tw({ targets: w, x: w.x + 46 * this.dir, duration: ms * 0.4, yoyo: true, ease: 'Quad.easeOut' });
    } else if (kind === 'blunt') {
      w.setAngle(-40 * this.dir);
      await this.tw({ targets: w, angle: 130 * this.dir, duration: ms * 0.5, ease: 'Quad.easeIn' });
    } else {
      w.setAngle(-70 * this.dir);
      await this.tw({ targets: w, angle: 150 * this.dir, duration: ms * 0.5, ease: 'Cubic.easeOut' });
    }
    this.scene.tweens.add({ targets: w, angle: REST * this.dir, x: 14 * this.dir, duration: ms * 0.5, ease: 'Sine.easeOut' });
  }

  /** Pushed back by a hit, then (optionally) slides back toward home. */
  async recoil(dist: number, ms: number, returnHome = false): Promise<void> {
    const tint = this.img ?? null;
    if (tint) {
      tint.setTintFill(0xffffff);
      this.scene.time.delayedCall(70, () => tint.clearTint());
    }
    this.setAngle(-6 * this.dir);
    await this.tw({ targets: this, x: this.x - dist * this.dir, duration: ms, ease: 'Quad.easeOut' });
    this.setAngle(0);
    if (returnHome) await this.goHome(ms * 1.5);
  }

  setGuard(on: boolean): void {
    if (on === this.guarding) return;
    this.guarding = on;
    if (this.weapon) this.weapon.setAngle(on ? -5 * this.dir : REST * this.dir);
    this.figure.setScale(this.dir * (on ? 0.94 : 1), on ? 0.95 : 1);
  }

  /** Quick sidestep backwards and return (evade). */
  async dodge(ms: number): Promise<void> {
    await this.tw({ targets: this, x: this.x - 70 * this.dir, y: this.y - 20, duration: ms * 0.5, yoyo: true, ease: 'Sine.easeOut' });
  }

  /** Staggered: down on one knee, tilted. */
  setStaggered(on: boolean): void {
    this.figure.setAngle(on ? -14 * this.dir : 0);
    this.figure.setScale(this.dir * (on ? 1.05 : 1), on ? 0.86 : 1);
    if (this.weapon) this.weapon.setAngle(on ? 110 * this.dir : REST * this.dir);
    if (on) this.idleTween?.pause();
    else this.idleTween?.resume();
  }

  /** Head position (for damage numbers / particles). */
  head(): { x: number; y: number } {
    return { x: this.x, y: this.y - 170 };
  }

  chest(): { x: number; y: number } {
    return { x: this.x, y: this.y - 110 };
  }

  override destroy(fromScene?: boolean): void {
    this.idleTween?.stop();
    super.destroy(fromScene);
  }
}
