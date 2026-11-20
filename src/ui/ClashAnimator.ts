import Phaser from 'phaser';
import { COLORS, FONT, GAME_WIDTH } from '../config/display.ts';
import { slotLabel, stackLabel, type BattleEvent, type Side, type SkillSlot } from '../core/index.ts';
import type { AnimSpeed } from '../game/settings.ts';
import { TEX } from './placeholders.ts';

/** What the animator needs from the battle screen. It never reads or changes rules. */
export interface AnimatorHooks {
  names: Record<Side, string>;
  coinCount(side: Side, slot: SkillSlot | 'defense'): number;
  statusLabel(id: string): string;
  setHp(side: Side, hp: number, duration: number): void;
  setSanity(side: Side, value: number): void;
  setClashWins(side: Side, wins: number, needed: number | null): void;
  /** Screen position where damage numbers for this side should pop. */
  damageAnchor(side: Side): { x: number; y: number };
  flash(side: Side): void;
  /** Play a sound effect by manifest key (no-op if missing). */
  sfx(key: string): void;
  /** Damage type of the skill `side` is using this turn (for hit sounds). */
  damageType(side: Side): string | null;
  pose(side: Side, pose: 'idle' | 'attack'): void;
}

/** Stage area (the result panel region). */
const STAGE = { top: 660, bottom: 1060, cx: GAME_WIDTH / 2 };
const ROW_Y: Record<Side, number> = { enemy: 770, player: 960 };
const COIN_GAP = 92;

interface Row {
  coins: Phaser.GameObjects.Image[];
  broken: number; // coins broken from the right
  power: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
}

/**
 * Plays a turn's events: coin flips, clash power numbers, coin breaks, one-sided hits with
 * damage numbers + screen shake. Speed ×1 / ×2 / instant; `skip()` finishes the current turn at once.
 */
export class ClashAnimator {
  private readonly scene: Phaser.Scene;
  private readonly hooks: AnimatorHooks;
  private speed: AnimSpeed = 1;
  private skipping = false;
  private layer: Phaser.GameObjects.Container | null = null;
  private rows: Partial<Record<Side, Row>> = {};
  private slots: Partial<Record<Side, SkillSlot | 'defense'>> = {};
  private readonly pending = new Set<() => void>();
  private readonly tweens = new Set<Phaser.Tweens.Tween>();
  private vs: Phaser.GameObjects.Text | null = null;

  constructor(scene: Phaser.Scene, hooks: AnimatorHooks) {
    this.scene = scene;
    this.hooks = hooks;
  }

  setSpeed(s: AnimSpeed): void {
    this.speed = s;
  }

  /** Finish the current playback immediately. */
  skip(): void {
    this.skipping = true;
    this.tweens.forEach((t) => t.isPlaying() && t.complete());
    this.pending.forEach((r) => r());
    this.pending.clear();
  }

  private get instant(): boolean {
    return this.skipping || this.speed === 'skip';
  }

  private ms(base: number): number {
    return this.instant ? 0 : base / (this.speed === 2 ? 2 : 1);
  }

  private wait(base: number): Promise<void> {
    const d = this.ms(base);
    if (d <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        this.pending.delete(done);
        resolve();
      };
      this.pending.add(done);
      this.scene.time.delayedCall(d, done);
    });
  }

  private tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig, base: number): Promise<void> {
    const d = this.ms(base);
    return new Promise((resolve) => {
      const t = this.scene.tweens.add({ ...cfg, duration: Math.max(1, d) });
      this.tweens.add(t);
      const end = () => {
        this.tweens.delete(t);
        resolve();
      };
      t.once('complete', end);
      t.once('stop', end);
      if (d <= 0) t.complete();
    });
  }

  async play(events: BattleEvent[]): Promise<void> {
    this.skipping = false;
    this.rows = {};
    this.slots = {};
    this.layer = this.scene.add.container(0, 0).setDepth(400);
    const bg = this.scene.add.rectangle(STAGE.cx, (STAGE.top + STAGE.bottom) / 2, GAME_WIDTH - 60, STAGE.bottom - STAGE.top, 0x0d0907);
    bg.setStrokeStyle(3, COLORS.panelLight);
    this.layer.add(bg);
    try {
      for (const ev of events) {
        if (ev.t === 'turnStart' && ev.turn > 1 && this.slots.player !== undefined) break; // next turn begins
        await this.step(ev);
      }
      await this.wait(350);
    } finally {
      this.hooks.pose('player', 'idle');
      this.hooks.pose('enemy', 'idle');
      this.layer?.destroy(true);
      this.layer = null;
      this.vs = null;
      this.tweens.clear();
      this.pending.clear();
      this.skipping = false;
    }
  }

  // ------------------------------------------------------------------ steps

  private async step(ev: BattleEvent): Promise<void> {
    switch (ev.t) {
      case 'skillUse': {
        this.slots[ev.side] = ev.slot;
        this.ensureRow(ev.side, `${slotLabel(ev.slot)} ${ev.skill}${ev.auto ? ' (패닉)' : ''}`);
        return this.wait(180);
      }
      case 'cannotAct':
        this.banner(`${this.hooks.names[ev.side]} 행동 불가 (${ev.reason === 'stagger' ? '흐트러짐' : '패닉'})`, COLORS.textDim);
        return this.wait(500);
      case 'clashRound':
        return this.clashRound(ev);
      case 'clashEnd': {
        if (!this.instant) this.hooks.sfx(ev.winner === 'player' ? 'sfx.clash.win' : 'sfx.clash.lose');
        this.vs?.setText(ev.tieBreak ? '동점 한도!' : '');
        this.banner(`${this.hooks.names[ev.winner]} 합 승리! (합 ${ev.clashCount}회)`, ev.winner === 'player' ? COLORS.ok : COLORS.danger);
        return this.wait(550);
      }
      case 'clashWin':
        this.hooks.setClashWins(ev.side, ev.wins, ev.needed);
        return;
      case 'sanity':
        this.hooks.setSanity(ev.side, ev.value);
        if (ev.side === 'player') this.float(`정신력 ${ev.delta > 0 ? '+' : ''}${ev.delta}`, 300, 1240, ev.delta > 0 ? '#7fc4ff' : '#c07fd8', 36);
        return;
      case 'coinHit':
        return this.hit(ev);
      case 'stagger':
        if (!this.instant) this.hooks.sfx('sfx.stagger');
        this.hooks.flash(ev.side);
        this.banner(`${this.hooks.names[ev.side]} 흐트러짐!`, '#f1c40f', 70);
        return this.wait(650);
      case 'panic':
        this.banner(`${this.hooks.names[ev.side]} 패닉!`, '#c07fd8', 64);
        return this.wait(600);
      case 'guard': {
        if (!this.instant) this.hooks.sfx('sfx.guard');
        const row = this.ensureRow(ev.side, '');
        this.vs?.setText('수비');
        await this.flip(this.alive(row), ev.heads);
        await this.pop(row.power, `막 ${ev.shield}`, '#9fd0ff');
        this.banner(`${this.hooks.names[ev.side]} 수비! 보호막 ${ev.shield}`, '#9fd0ff', 50);
        return this.wait(450);
      }
      case 'evade': {
        const row = this.ensureRow(ev.side, '');
        this.vs?.setText('회피');
        await this.flip(this.alive(row).slice(0, ev.heads.length), ev.heads);
        void this.pop(row.power, String(ev.power), ev.success ? '#9fd0ff' : '#9a8f80');
        if (ev.success && !this.instant) this.hooks.sfx('sfx.evade');
        const a = this.hooks.damageAnchor(ev.side);
        this.float(ev.success ? '회피!' : '회피 실패', a.x, a.y - 40, ev.success ? '#9fd0ff' : '#ff9a8a', 52);
        return this.wait(ev.success ? 420 : 260);
      }
      case 'perfectGuard':
        this.banner(`${this.hooks.names[ev.side]} 완벽한 수비!`, '#9fd0ff', 60);
        return this.wait(500);
      case 'guardRetaliate': {
        const target: Side = ev.side === 'player' ? 'enemy' : 'player';
        const a = this.hooks.damageAnchor(target);
        this.hooks.setHp(target, ev.targetHp, this.ms(260));
        this.hooks.flash(target);
        this.float(`보호막 반격 -${ev.damage}`, a.x, a.y, '#9fd0ff', 56);
        this.shake(Math.min(0.02, 0.004 + ev.damage / 1500), 160);
        return this.wait(450);
      }
      case 'counter':
        this.banner(`${this.hooks.names[ev.side]} 반격!`, '#ffb36b', 60);
        return this.wait(450);
      case 'defenseUnused':
        this.banner(`${ev.skill} — 공격이 없어 무의미`, COLORS.textDim, 40);
        return this.wait(450);
      case 'statusApply': {
        if (!this.instant) this.hooks.sfx('sfx.status');
        const a = this.hooks.damageAnchor(ev.side);
        this.float(stackLabel(this.hooks.statusLabel(ev.status), ev.potency, ev.count), a.x, a.y + 70, '#ffd6a0', 36);
        return this.wait(120);
      }
      case 'statusTrigger': {
        const a = this.hooks.damageAnchor(ev.side);
        const name = this.hooks.statusLabel(ev.status);
        if (ev.action === 'damage') {
          this.hooks.setHp(ev.side, ev.hp, this.ms(200));
          this.float(`${name} -${ev.amount}`, a.x + 60, a.y + 20, '#ff9a6b', 48);
        } else if (ev.action === 'sanityLoss') this.float(`${name}: 정신력 -${ev.amount}`, a.x, a.y + 20, '#c07fd8', 40);
        else if (ev.action === 'staggerDamage') this.banner(`${name} 폭발!`, '#f1c40f', 56);
        return this.wait(ev.action === 'staggerDamage' ? 450 : 260);
      }
      case 'spend': {
        const a = this.hooks.damageAnchor(ev.side);
        this.float(`${this.hooks.statusLabel(ev.status)} ${ev.count} 소모 → 위력 +${ev.power}`, a.x, a.y, '#7fd18b', 38);
        return this.wait(300);
      }
      case 'battleEnd':
        return this.wait(300);
      default:
        return;
    }
  }

  private ensureRow(side: Side, title: string): Row {
    const existing = this.rows[side];
    if (existing) return existing;
    const slot = this.slots[side];
    const n = slot ? this.hooks.coinCount(side, slot) : 1;
    const y = ROW_Y[side];
    const coins: Phaser.GameObjects.Image[] = [];
    const x0 = STAGE.cx - ((n - 1) * COIN_GAP) / 2;
    for (let i = 0; i < n; i++) {
      const c = this.scene.add.image(x0 + i * COIN_GAP, y, TEX.coinHeads).setScale(0.001);
      coins.push(c);
      this.layer!.add(c);
      void this.tween({ targets: c, scale: 1, ease: 'Back.easeOut', delay: this.ms(i * 50) }, 220);
    }
    const color = side === 'player' ? COLORS.text : '#ffb3a8';
    const label = this.scene.add
      .text(60, y - 62, `${this.hooks.names[side]} · ${title}`, { fontFamily: FONT, fontSize: '30px', color })
      .setOrigin(0, 0.5);
    const power = this.scene.add
      .text(GAME_WIDTH - 90, y, '', { fontFamily: FONT, fontSize: '84px', color: COLORS.text, fontStyle: 'bold', stroke: '#000', strokeThickness: 8 })
      .setOrigin(1, 0.5);
    this.layer!.add([label, power]);
    if (!this.vs) {
      this.vs = this.scene.add
        .text(STAGE.cx, (ROW_Y.enemy + ROW_Y.player) / 2, '', { fontFamily: FONT, fontSize: '40px', color: COLORS.textDim })
        .setOrigin(0.5);
      this.layer!.add(this.vs);
    }
    const row = { coins, broken: 0, power, label };
    this.rows[side] = row;
    return row;
  }

  private alive(row: Row): Phaser.GameObjects.Image[] {
    return row.coins.slice(0, row.coins.length - row.broken);
  }

  private async flip(coins: Phaser.GameObjects.Image[], heads: boolean[]): Promise<void> {
    if (coins.length === 0) return;
    if (!this.instant) this.hooks.sfx('sfx.coin.flip');
    await this.tween({ targets: coins, scaleX: 0, ease: 'Quad.easeIn' }, 110);
    coins.forEach((c, i) => c.setTexture(heads[i] ? TEX.coinHeads : TEX.coinTails));
    await this.tween({ targets: coins, scaleX: 1, ease: 'Quad.easeOut' }, 110);
  }

  private pop(t: Phaser.GameObjects.Text, value: string, color: string): Promise<void> {
    t.setText(value).setColor(color).setScale(1.7);
    return this.tween({ targets: t, scale: 1, ease: 'Back.easeOut' }, 260);
  }

  private async clashRound(ev: Extract<BattleEvent, { t: 'clashRound' }>): Promise<void> {
    const p = this.ensureRow('player', '');
    const e = this.ensureRow('enemy', '');
    this.vs?.setText(`합 ${ev.round}`);
    await Promise.all([this.flip(this.alive(p), ev.player.heads), this.flip(this.alive(e), ev.enemy.heads)]);
    const win = (s: Side) => (ev.loser === null ? COLORS.text : ev.loser === s ? '#9a8f80' : '#ffe08a');
    await Promise.all([this.pop(p.power, String(ev.player.power), win('player')), this.pop(e.power, String(ev.enemy.power), win('enemy'))]);
    if (ev.loser === null) {
      this.vs?.setText('동점! 재굴림');
      await this.wait(380);
      return;
    }
    const row = ev.loser === 'player' ? p : e;
    const coin = row.coins[row.coins.length - 1 - row.broken];
    row.broken++;
    if (!this.instant) this.hooks.sfx('sfx.coin.break');
    if (coin) {
      coin.setTexture(TEX.coinBroken).setTint(0xff6655);
      this.shake(0.004, 120);
      await this.tween({ targets: coin, alpha: 0.25, y: coin.y + 14, angle: 25, ease: 'Quad.easeIn' }, 260);
    }
    await this.wait(200);
  }

  private async hit(ev: Extract<BattleEvent, { t: 'coinHit' }>): Promise<void> {
    const target: Side = ev.attacker === 'player' ? 'enemy' : 'player';
    const row = this.ensureRow(ev.attacker, '');
    const coins = this.alive(row);
    const coin = coins[ev.coin];
    this.vs?.setText('일방 공격');
    if (coin) {
      await this.flip([coin], [ev.heads]);
      coin.setTint(0xffffff);
      void this.tween({ targets: coin, scale: 1.35, yoyo: true, ease: 'Quad.easeOut' }, 160);
    }
    void this.pop(row.power, String(ev.power), '#ffe08a');
    if (!this.instant) {
      this.hooks.pose(ev.attacker, 'attack');
      const dt = this.hooks.damageType(ev.attacker);
      if (ev.damage > 0 && dt) this.hooks.sfx(`sfx.hit.${dt}`);
      if (ev.crit) this.hooks.sfx('sfx.crit');
    }
    this.hooks.setHp(target, ev.targetHp, this.ms(260));
    this.hooks.flash(target);
    const a = this.hooks.damageAnchor(target);
    this.float(ev.damage > 0 ? `-${ev.damage}` : '0', a.x, a.y, ev.damage > 0 ? '#ff6b5b' : COLORS.textDim, 64 + Math.min(40, ev.damage));
    if (ev.crit) this.float('치명!', a.x, a.y - 80, '#ffe08a', 50);
    if (ev.blocked) this.float(`막음 ${ev.blocked}`, a.x + 160, a.y - 30, '#9fd0ff', 40);
    this.shake(Math.min(0.02, 0.004 + ev.damage / 1500), 160);
    await this.wait(330);
  }

  // ------------------------------------------------------------------ fx

  private banner(msg: string, color: string, size = 54): void {
    if (!this.layer) return;
    const t = this.scene.add
      .text(STAGE.cx, (STAGE.top + STAGE.bottom) / 2, msg, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#000', strokeThickness: 10 })
      .setOrigin(0.5)
      .setScale(0.6)
      .setAlpha(0);
    this.layer.add(t);
    void this.tween({ targets: t, scale: 1, alpha: 1, ease: 'Back.easeOut' }, 220).then(() =>
      this.tween({ targets: t, alpha: 0, delay: this.ms(450) }, 250).then(() => t.destroy()),
    );
  }

  private float(msg: string, x: number, y: number, color: string, size: number): void {
    if (this.instant) return;
    const t = this.scene.add
      .text(x, y, msg, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5)
      .setDepth(450);
    // Not tracked by skip(): it is purely cosmetic and cleans itself up.
    this.scene.tweens.add({ targets: t, y: y - 90, alpha: 0, duration: this.ms(800), ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private shake(intensity: number, duration: number): void {
    if (this.instant) return;
    this.scene.cameras.main.shake(this.ms(duration), intensity);
  }
}
