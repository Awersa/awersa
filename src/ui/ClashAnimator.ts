import Phaser from 'phaser';
import { COLORS, FONT, GAME_WIDTH } from '../config/display.ts';
import { slotLabel, stackLabel, type BattleEvent, type Side, type SkillSlot } from '../core/index.ts';
import type { AnimSpeed } from '../game/settings.ts';
import { Fighter, type Weapon } from './Fighter.ts';
import { burst, reducedMotion, statusBurst, strikeTrail, type BurstKind } from './fx.ts';
import { TEX } from './placeholders.ts';

/** What the animator needs from the battle screen. It never reads or changes rules. */
export interface AnimatorHooks {
  names: Record<Side, string>;
  coinCount(side: Side, slot: SkillSlot | 'defense'): number;
  statusLabel(id: string): string;
  setHp(side: Side, hp: number, duration: number): void;
  setSanity(side: Side, value: number): void;
  setClashWins(side: Side, wins: number, needed: number | null): void;
  /** HUD feedback on the portrait / HP bar for this side. */
  flash(side: Side): void;
  knockback(side: Side, strength: number): void;
  setStaggered(side: Side, on: boolean): void;
  sfx(key: string): void;
  /** Damage type of the skill `side` is using this turn. */
  damageType(side: Side): string | null;
  pose(side: Side, pose: 'idle' | 'attack'): void;
  /** Stage figure setup. */
  fighter(side: Side): { weapon: Weapon; asset?: string; staggered: boolean };
}

/** Stage = the result panel region; fighters stand on its floor facing each other. */
const STAGE = { top: 660, bottom: 1060, cx: GAME_WIDTH / 2 };
const FLOOR_Y = 1045;
const HOME_X: Record<Side, number> = { player: 270, enemy: 810 };
const COIN_Y = 718;
const POWER_Y = 785;
const COIN_GAP = 62;
const COIN_SCALE = 0.75;
const CLASH_X: Record<Side, number> = { player: 452, enemy: 628 };
const MID = { x: STAGE.cx, y: 925 };

interface Row {
  coins: Phaser.GameObjects.Image[];
  broken: number; // coins broken from the right
  power: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
}

const other = (s: Side): Side => (s === 'player' ? 'enemy' : 'player');

/**
 * Plays a turn on a small stage: two fighters face each other.
 *  - each clash round: coins hop/flip above their heads, powers count up, both fighters dash in and
 *    their weapons meet (sparks), the loser is knocked back and loses a coin
 *  - one-sided attack: the winner rushes the target and strikes once per coin (slash arc / thrust /
 *    impact ring), the target staggers back each hit and is launched on the last
 *  - guard raises the weapon, evade sidesteps, stagger drops to a knee
 * Speed ×1 / ×2 / instant; `skip()` finishes the current turn at once.
 */
export class ClashAnimator {
  private readonly scene: Phaser.Scene;
  private readonly hooks: AnimatorHooks;
  private speed: AnimSpeed = 1;
  private skipping = false;
  private layer: Phaser.GameObjects.Container | null = null;
  private rows: Partial<Record<Side, Row>> = {};
  private fighters: Partial<Record<Side, Fighter>> = {};
  private slots: Partial<Record<Side, SkillSlot | 'defense'>> = {};
  private readonly pending = new Set<() => void>();
  private readonly tweens = new Set<Phaser.Tweens.Tween>();
  private vs: Phaser.GameObjects.Text | null = null;
  /** Side currently standing in the opponent's face after rushing in. */
  private engaged: Side | null = null;
  private guarding: Side | null = null;

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

  /** Fighter motions are skipped entirely when instant. */
  private move(fn: () => Promise<void>): Promise<void> {
    return this.instant ? Promise.resolve() : fn();
  }

  async play(events: BattleEvent[]): Promise<void> {
    this.skipping = false;
    this.rows = {};
    this.slots = {};
    this.engaged = null;
    this.guarding = null;
    this.layer = this.scene.add.container(0, 0).setDepth(400);
    const h = STAGE.bottom - STAGE.top;
    const bg = this.scene.add.rectangle(STAGE.cx, STAGE.top + h / 2, GAME_WIDTH - 60, h, 0x0d0907).setStrokeStyle(3, COLORS.panelLight);
    const floor = this.scene.add.rectangle(STAGE.cx, FLOOR_Y + 6, GAME_WIDTH - 80, 4, COLORS.gold, 0.25);
    this.layer.add([bg, floor]);
    for (const side of ['player', 'enemy'] as const) {
      const f = this.hooks.fighter(side);
      const fighter = new Fighter(
        this.scene,
        HOME_X[side],
        FLOOR_Y,
        side === 'player' ? 1 : -1,
        side === 'player' ? 0xb8925a : 0x8e3b33,
        f.weapon,
        f.asset,
      );
      fighter.setStaggered(f.staggered);
      this.layer.add(fighter);
      this.fighters[side] = fighter;
    }
    try {
      for (const ev of events) {
        if (ev.t === 'turnStart' && ev.turn > 1 && this.slots.player !== undefined) break; // next turn begins
        await this.step(ev);
      }
      await this.disengage();
      await this.wait(350);
    } finally {
      this.hooks.pose('player', 'idle');
      this.hooks.pose('enemy', 'idle');
      this.layer?.destroy(true);
      this.layer = null;
      this.fighters = {};
      this.vs = null;
      this.tweens.clear();
      this.pending.clear();
      this.skipping = false;
    }
  }

  // ------------------------------------------------------------------ steps

  /** Events that belong to an ongoing rush keep the attacker in place; anything else sends it home. */
  private static readonly KEEP_ENGAGED = new Set<BattleEvent['t']>([
    'coinHit', 'statusApply', 'statusTrigger', 'stagger', 'gift', 'heal', 'sanity', 'clashWin', 'evade', 'perfectGuard', 'guardRetaliate', 'statusEnd',
  ]);

  private async step(ev: BattleEvent): Promise<void> {
    if (!ClashAnimator.KEEP_ENGAGED.has(ev.t)) await this.disengage();
    switch (ev.t) {
      case 'skillUse': {
        this.slots[ev.side] = ev.slot;
        this.ensureRow(ev.side, `${slotLabel(ev.slot)} ${ev.skill}${ev.auto ? ' (패닉)' : ''}`);
        return this.wait(220);
      }
      case 'cannotAct':
        this.banner(`${this.hooks.names[ev.side]} 행동 불가 (${ev.reason === 'stagger' ? '흐트러짐' : '패닉'})`, COLORS.textDim);
        return this.wait(500);
      case 'clashRound':
        return this.clashRound(ev);
      case 'clashEnd': {
        if (!this.instant) this.hooks.sfx(ev.winner === 'player' ? 'sfx.clash.win' : 'sfx.clash.lose');
        this.vs?.setText(ev.tieBreak ? '동점 한도!' : '');
        this.winnerGlow(ev.winner);
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
      case 'stagger': {
        if (!this.instant) this.hooks.sfx('sfx.stagger');
        const a = this.anchor(ev.side);
        this.fx('stagger', a.x, a.y);
        this.fighters[ev.side]?.setStaggered(true);
        this.hooks.flash(ev.side);
        this.hooks.setStaggered(ev.side, true);
        this.shake(0.012, 260);
        this.banner(`${this.hooks.names[ev.side]} 흐트러짐!`, '#f1c40f', 72);
        return this.wait(700);
      }
      case 'staggerRecover':
        this.fighters[ev.side]?.setStaggered(false);
        this.hooks.setStaggered(ev.side, false);
        return;
      case 'panic':
        this.banner(`${this.hooks.names[ev.side]} 패닉!`, '#c07fd8', 64);
        if (!this.instant && !reducedMotion()) this.scene.cameras.main.flash(this.ms(260), 120, 60, 160);
        return this.wait(600);
      case 'guard': {
        if (!this.instant) this.hooks.sfx('sfx.guard');
        const row = this.ensureRow(ev.side, '');
        this.vs?.setText('수비');
        this.fighters[ev.side]?.setGuard(true);
        this.guarding = ev.side;
        await this.flip(this.alive(row), ev.heads);
        await this.countUp(row.power, ev.shield, '#9fd0ff', '막 ');
        const a = this.anchor(ev.side);
        this.fx('guard', a.x, a.y);
        this.banner(`${this.hooks.names[ev.side]} 수비! 보호막 ${ev.shield}`, '#9fd0ff', 50);
        return this.wait(400);
      }
      case 'evade': {
        const row = this.ensureRow(ev.side, '');
        this.vs?.setText('회피');
        await this.flip(this.alive(row).slice(0, ev.heads.length), ev.heads);
        void this.countUp(row.power, ev.power, ev.success ? '#9fd0ff' : '#9a8f80');
        const a = this.anchor(ev.side);
        if (ev.success) {
          if (!this.instant) this.hooks.sfx('sfx.evade');
          const f = this.fighters[ev.side];
          const atk = this.fighters[other(ev.side)];
          // the attacker swings at air while the evader slips away
          if (atk && this.engaged === other(ev.side)) void this.move(() => atk.swing(this.strikeKind(other(ev.side)), this.ms(220)));
          await this.move(() => f!.dodge(this.ms(260)));
          this.fx('poise', a.x, a.y);
        }
        this.float(ev.success ? '회피!' : '회피 실패', a.x, a.y - 40, ev.success ? '#9fd0ff' : '#ff9a8a', 52);
        return this.wait(ev.success ? 300 : 200);
      }
      case 'perfectGuard': {
        const a = this.anchor(ev.side);
        this.fx('guard', a.x, a.y, 1.6);
        this.banner(`${this.hooks.names[ev.side]} 완벽한 수비!`, '#9fd0ff', 60);
        return this.wait(500);
      }
      case 'guardRetaliate': {
        const target = other(ev.side);
        const a = this.anchor(target);
        const g = this.fighters[ev.side];
        const t = this.fighters[target];
        if (g && t) {
          void this.move(() => g.swing('blunt', this.ms(220)));
          void this.move(() => t.recoil(70, this.ms(180)));
        }
        this.hooks.setHp(target, ev.targetHp, this.ms(260));
        this.hooks.flash(target);
        this.hooks.knockback(target, 0.6);
        this.fx('guard', a.x, a.y);
        this.damageNumber(ev.damage, a.x, a.y, false, '#9fd0ff', '보호막 반격 ');
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
        const a = this.anchor(ev.side);
        this.fx(statusBurst(ev.status), a.x, a.y + 40, 0.7);
        this.float(stackLabel(this.hooks.statusLabel(ev.status), ev.potency, ev.count), a.x, a.y + 80, '#ffd6a0', 34);
        return this.wait(140);
      }
      case 'statusTrigger': {
        const a = this.anchor(ev.side);
        const name = this.hooks.statusLabel(ev.status);
        this.fx(statusBurst(ev.status), a.x, a.y);
        if (ev.action === 'damage') {
          this.hooks.setHp(ev.side, ev.hp, this.ms(200));
          this.hooks.knockback(ev.side, 0.25);
          this.float(`${name} -${ev.amount}`, a.x, a.y + 20, '#ff9a6b', 46);
        } else if (ev.action === 'sanityLoss') this.float(`${name}: 정신력 -${ev.amount}`, a.x, a.y + 20, '#c07fd8', 38);
        else if (ev.action === 'staggerDamage') {
          this.hooks.knockback(ev.side, 0.5);
          this.shake(0.008, 220);
          this.banner(`${name} 폭발!`, '#f1c40f', 56);
        }
        return this.wait(ev.action === 'staggerDamage' ? 450 : 280);
      }
      case 'spend': {
        const a = this.anchor(ev.side);
        this.fx('charge', a.x, a.y);
        this.float(`${this.hooks.statusLabel(ev.status)} ${ev.count} 소모 → 위력 +${ev.power}`, a.x, a.y, '#7fd18b', 34);
        return this.wait(300);
      }
      case 'gift': {
        const a = this.anchor(ev.side);
        this.float(`◆ ${ev.gift}`, a.x, a.y - 60, '#d9c2ff', 36);
        return this.wait(200);
      }
      case 'heal': {
        const a = this.anchor(ev.side);
        this.hooks.setHp(ev.side, ev.hp, this.ms(260));
        this.float(`+${ev.amount}`, a.x, a.y, COLORS.ok, 50);
        return this.wait(200);
      }
      case 'battleEnd':
        return this.wait(300);
      default:
        return;
    }
  }

  private anchor(side: Side): { x: number; y: number } {
    const f = this.fighters[side];
    return f ? f.head() : { x: HOME_X[side], y: 860 };
  }

  private strikeKind(side: Side): 'slash' | 'pierce' | 'blunt' {
    const dt = this.hooks.damageType(side);
    return dt === 'pierce' ? 'pierce' : dt === 'blunt' ? 'blunt' : 'slash';
  }

  /** Attacker walks back home; a raised guard comes down. */
  private async disengage(): Promise<void> {
    const side = this.engaged;
    this.engaged = null;
    if (this.guarding) {
      this.fighters[this.guarding]?.setGuard(false);
      this.guarding = null;
    }
    if (!side) return;
    const f = this.fighters[side];
    const t = this.fighters[other(side)];
    await this.move(async () => {
      await Promise.all([f?.goHome(this.ms(240)), t?.goHome(this.ms(240))]);
    });
  }

  private ensureRow(side: Side, title: string): Row {
    const existing = this.rows[side];
    if (existing) return existing;
    const slot = this.slots[side];
    const n = slot ? this.hooks.coinCount(side, slot) : 1;
    const cx = HOME_X[side];
    const coins: Phaser.GameObjects.Image[] = [];
    const x0 = cx - ((n - 1) * COIN_GAP) / 2;
    for (let i = 0; i < n; i++) {
      const c = this.scene.add.image(x0 + i * COIN_GAP, COIN_Y - 50, TEX.coinHeads).setScale(0.2).setAlpha(0);
      c.setData('x', x0 + i * COIN_GAP).setData('y', COIN_Y);
      coins.push(c);
      this.layer!.add(c);
      void this.tween({ targets: c, y: COIN_Y, scale: COIN_SCALE, alpha: 1, ease: 'Back.easeOut', delay: this.ms(i * 60) }, 260);
    }
    const color = side === 'player' ? COLORS.text : '#ffb3a8';
    const label = this.scene.add
      .text(cx, 676, `${this.hooks.names[side]} · ${title}`, { fontFamily: FONT, fontSize: '26px', color })
      .setOrigin(0.5)
      .setAlpha(0);
    void this.tween({ targets: label, alpha: 1 }, 200);
    const power = this.scene.add
      .text(cx, POWER_Y, '', { fontFamily: FONT, fontSize: '64px', color: COLORS.text, fontStyle: 'bold', stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5);
    this.layer!.add([label, power]);
    if (!this.vs) {
      this.vs = this.scene.add.text(STAGE.cx, 745, '', { fontFamily: FONT, fontSize: '34px', color: COLORS.textDim }).setOrigin(0.5);
      this.layer!.add(this.vs);
    }
    const row = { coins, broken: 0, power, label };
    this.rows[side] = row;
    return row;
  }

  private alive(row: Row): Phaser.GameObjects.Image[] {
    return row.coins.slice(0, row.coins.length - row.broken);
  }

  /** Coins hop up, spin (squash on X) to their new face, and land with a little bounce. */
  private async flip(coins: Phaser.GameObjects.Image[], heads: boolean[]): Promise<void> {
    if (coins.length === 0) return;
    if (!this.instant) this.hooks.sfx('sfx.coin.flip');
    const home = () =>
      coins.forEach((c) => c.setPosition(c.getData('x') as number, c.getData('y') as number).setAngle(0).setScale(COIN_SCALE));
    home();
    void this.tween({ targets: coins, y: '-=30', yoyo: true, ease: 'Sine.easeOut' }, 120);
    await this.tween({ targets: coins, scaleX: 0, ease: 'Quad.easeIn' }, 110);
    coins.forEach((c, i) => c.setTexture(heads[i] ? TEX.coinHeads : TEX.coinTails));
    await this.tween({ targets: coins, scaleX: COIN_SCALE, ease: 'Quad.easeOut' }, 110);
    home();
    coins.forEach((c, i) => {
      if (heads[i] && !this.instant) {
        c.setTintFill(0xffffff);
        this.scene.time.delayedCall(this.ms(50), () => c.clearTint());
      }
    });
  }

  /** Number counts up from its previous value, then bounces. */
  private async countUp(t: Phaser.GameObjects.Text, to: number, color: string, prefix = ''): Promise<void> {
    const from = (t.getData('v') as number | undefined) ?? 0;
    t.setData('v', to).setColor(color);
    if (this.instant) {
      t.setText(`${prefix}${to}`).setScale(1);
      return;
    }
    const counter = { v: from };
    await this.tween(
      { targets: counter, v: to, ease: 'Cubic.easeOut', onUpdate: () => t.setText(`${prefix}${Math.round(counter.v)}`) },
      Math.min(240, 90 + Math.abs(to - from) * 12),
    );
    t.setText(`${prefix}${to}`).setScale(1.45);
    await this.tween({ targets: t, scale: 1, ease: 'Back.easeOut' }, 180);
  }

  private async clashRound(ev: Extract<BattleEvent, { t: 'clashRound' }>): Promise<void> {
    const p = this.ensureRow('player', '');
    const e = this.ensureRow('enemy', '');
    const fp = this.fighters.player!;
    const fe = this.fighters.enemy!;
    this.vs?.setText(`합 ${ev.round}`);
    await Promise.all([this.flip(this.alive(p), ev.player.heads), this.flip(this.alive(e), ev.enemy.heads)]);
    const win = (s: Side) => (ev.loser === null ? COLORS.text : ev.loser === s ? '#9a8f80' : '#ffe08a');
    await Promise.all([this.countUp(p.power, ev.player.power, win('player')), this.countUp(e.power, ev.enemy.power, win('enemy'))]);

    // both rush in and their weapons meet in the middle
    await this.move(async () => {
      await Promise.all([fp.dash(CLASH_X.player, this.ms(150)), fe.dash(CLASH_X.enemy, this.ms(150))]);
      void fp.swing(this.strikeKind('player'), this.ms(160));
      void fe.swing(this.strikeKind('enemy'), this.ms(160));
    });
    if (!this.instant) this.hooks.sfx('sfx.clash.impact');
    this.fx('clash', MID.x, MID.y, 0.7 + Math.min(1, Math.abs(ev.player.power - ev.enemy.power) / 10));
    this.shake(0.004, 100);
    await this.wait(90); // the moment of contact

    if (ev.loser === null) {
      this.vs?.setText('동점! 재굴림');
      await this.move(async () => {
        await Promise.all([fp.recoil(60, this.ms(160), true), fe.recoil(60, this.ms(160), true)]);
      });
      await this.wait(160);
      return;
    }
    const loser = ev.loser === 'player' ? fp : fe;
    const winner = ev.loser === 'player' ? fe : fp;
    const row = ev.loser === 'player' ? p : e;
    const coin = row.coins[row.coins.length - 1 - row.broken];
    row.broken++;
    if (!this.instant) this.hooks.sfx('sfx.coin.break');
    if (coin) {
      coin.setTexture(TEX.coinBroken).setTint(0xff6655);
      this.fx('shards', coin.x, coin.y);
      void this.tween({ targets: coin, alpha: 0.2, y: coin.y + 22, angle: 35, scale: COIN_SCALE * 0.8, ease: 'Quad.easeIn' }, 280);
    }
    await this.move(async () => {
      await Promise.all([loser.recoil(110, this.ms(200), true), winner.goHome(this.ms(260))]);
    });
    await this.wait(120);
  }

  private async hit(ev: Extract<BattleEvent, { t: 'coinHit' }>): Promise<void> {
    const side = ev.attacker;
    const target = other(side);
    const row = this.ensureRow(side, '');
    const coins = this.alive(row);
    const coin = coins[ev.coin];
    const fa = this.fighters[side];
    const ft = this.fighters[target];
    this.vs?.setText('일방 공격');

    // rush in on the first strike of this attack
    if (this.engaged !== side) {
      this.engaged = side;
      if (fa && ft) await this.move(() => fa.dash(ft.x - 150 * fa.dir, this.ms(200)));
    }
    if (coin) {
      await this.flip([coin], [ev.heads]);
      void this.tween({ targets: coin, scale: COIN_SCALE * 1.4, yoyo: true, ease: 'Quad.easeOut' }, 150);
    }
    void this.countUp(row.power, ev.power, '#ffe08a');

    const kind = this.strikeKind(side);
    if (fa) await this.move(() => fa.swing(kind, this.ms(180)));
    if (!this.instant) {
      this.hooks.pose(side, 'attack');
      const dt = this.hooks.damageType(side);
      if (ev.damage > 0 && dt) this.hooks.sfx(`sfx.hit.${dt}`);
      if (ev.crit) this.hooks.sfx('sfx.crit');
    }
    // hit-stop: a beat of stillness as the blow lands
    await this.wait(ev.crit ? 110 : 60);

    const a = ft ? ft.chest() : this.anchor(target);
    const strength = Math.min(1, ev.damage / 30);
    if (!this.instant && fa) strikeTrail(this.scene, kind, a.x, a.y, fa.dir, this.ms(260));
    const pkind: BurstKind = kind;
    if (ev.damage > 0) this.fx(pkind, a.x, a.y, 0.6 + strength);
    if (ev.crit) {
      this.fx('crit', a.x, a.y);
      if (!this.instant && !reducedMotion()) this.scene.cameras.main.flash(this.ms(90), 255, 240, 200);
    }
    if (ev.blocked) this.fx('guard', a.x, a.y, 0.6);
    this.hooks.setHp(target, ev.targetHp, this.ms(260));
    this.hooks.flash(target);
    if (ev.damage > 0) this.hooks.knockback(target, 0.3 + strength * 0.7);
    // numbers pop at chest height, a little toward the attacker, so they don't cover the power readout
    const h = { x: a.x - 40 * (fa?.dir ?? 1), y: a.y + 10 };
    this.damageNumber(ev.damage, h.x, h.y, ev.crit ?? false);
    if (ev.blocked) this.float(`막음 ${ev.blocked}`, h.x, h.y - 70, '#9fd0ff', 38);
    this.shake(Math.min(0.022, 0.003 + ev.damage / 1400) * (ev.crit ? 1.5 : 1), ev.crit ? 220 : 150);

    // target reels; the last coin of the attack launches it further
    const last = ev.coin === coins.length - 1;
    if (ft && fa && ev.damage > 0) {
      const push = last ? 90 + 60 * strength : 22 + 20 * strength;
      void this.move(async () => {
        await ft.recoil(push, this.ms(last ? 220 : 120));
        // the attacker follows a short step so the next strike connects
        if (!last) await fa.dash(ft.x - 150 * fa.dir, this.ms(90));
      });
    }
    await this.wait(last ? 320 : 220);
  }

  // ------------------------------------------------------------------ fx

  private fx(kind: BurstKind, x: number, y: number, scale = 1): void {
    if (this.instant) return;
    burst(this.scene, kind, x, y, 460, scale);
  }

  /** The clash winner's coins glow briefly. */
  private winnerGlow(side: Side): void {
    const row = this.rows[side];
    if (!row || this.instant) return;
    for (const c of this.alive(row)) {
      c.setTintFill(0xffe08a);
      this.scene.time.delayedCall(this.ms(120), () => c.clearTint());
    }
    void this.tween({ targets: this.alive(row), scale: COIN_SCALE * 1.25, yoyo: true, ease: 'Back.easeOut' }, 160);
  }

  /** Damage number: pops in big, then rises. Size grows with damage; crits are gold and tilted. */
  private damageNumber(dmg: number, x: number, y: number, crit: boolean, color?: string, prefix = ''): void {
    if (this.instant) return;
    const size = Math.round(56 + Math.min(52, dmg * 1.3) + (crit ? 18 : 0));
    const t = this.scene.add
      .text(x + Phaser.Math.Between(-24, 24), y, `${prefix}${dmg > 0 ? `-${dmg}` : '0'}`, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color: color ?? (crit ? '#ffe08a' : dmg > 0 ? '#ff6b5b' : COLORS.textDim),
        fontStyle: 'bold',
        stroke: crit ? '#7a3d00' : '#000',
        strokeThickness: crit ? 12 : 9,
      })
      .setOrigin(0.5)
      .setDepth(470)
      .setScale(1.9)
      .setAngle(crit ? Phaser.Math.Between(-10, 10) : 0);
    this.scene.tweens.add({ targets: t, scale: 1, duration: this.ms(160), ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, y: y - 60, alpha: 0, delay: this.ms(260), duration: this.ms(700), ease: 'Cubic.easeIn', onComplete: () => t.destroy() });
    if (crit) {
      const c = this.scene.add
        .text(x, y - 85, '치명!', { fontFamily: FONT, fontSize: '46px', color: '#ffe08a', fontStyle: 'bold', stroke: '#000', strokeThickness: 8 })
        .setOrigin(0.5)
        .setDepth(470)
        .setScale(0.4);
      this.scene.tweens.add({ targets: c, scale: 1.1, duration: this.ms(160), ease: 'Back.easeOut' });
      this.scene.tweens.add({ targets: c, alpha: 0, y: y - 150, delay: this.ms(380), duration: this.ms(400), onComplete: () => c.destroy() });
    }
  }

  private banner(msg: string, color: string, size = 54): void {
    if (!this.layer) return;
    const t = this.scene.add
      .text(STAGE.cx, 860, msg, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#000', strokeThickness: 10 })
      .setOrigin(0.5)
      .setScale(0.6)
      .setAlpha(0)
      .setDepth(480);
    this.layer.add(t);
    void this.tween({ targets: t, scale: 1, alpha: 1, ease: 'Back.easeOut' }, 220).then(() =>
      this.tween({ targets: t, alpha: 0, scale: 1.08, delay: this.ms(450) }, 250).then(() => t.destroy()),
    );
  }

  private float(msg: string, x: number, y: number, color: string, size: number): void {
    if (this.instant) return;
    const t = this.scene.add
      .text(x, y, msg, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5)
      .setDepth(450)
      .setScale(0.7);
    this.scene.tweens.add({ targets: t, scale: 1, duration: this.ms(140), ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, y: y - 90, alpha: 0, delay: this.ms(120), duration: this.ms(800), ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private shake(intensity: number, duration: number): void {
    if (this.instant || reducedMotion()) return;
    this.scene.cameras.main.shake(this.ms(duration), intensity);
  }
}
