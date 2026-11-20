import Phaser from 'phaser';
import { availableAssets } from '../assets/registry.ts';
import { COLORS, FONT, GAME_WIDTH } from '../config/display.ts';
import { gameContext } from '../game/context.ts';
import { ensurePlaceholderTextures } from '../ui/placeholders.ts';
import { ensureFxTextures } from '../ui/fx.ts';
import { SceneKey } from './keys.ts';

/** Loads bundled assets (only those that exist), validates game data, then goes to the title. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  preload(): void {
    for (const [key, url] of availableAssets('images')) this.load.image(key, url);
    for (const [key, url] of availableAssets('sounds')) this.load.audio(key, url);
    // A broken file must not stop the game: it just stays a placeholder / silent.
    this.load.on('loaderror', (file: Phaser.Loader.File) => console.warn('[assets] failed to load', file.key));
    const bar = this.add.rectangle(GAME_WIDTH / 2 - 300, 960, 0, 16, COLORS.gold).setOrigin(0, 0.5);
    this.load.on('progress', (v: number) => (bar.width = 600 * v));
  }

  create(): void {
    try {
      gameContext();
    } catch (err) {
      this.cameras.main.setBackgroundColor(COLORS.bg);
      this.add.text(40, 60, '데이터 오류\n\n' + (err instanceof Error ? err.message : String(err)), {
        fontFamily: FONT,
        fontSize: '30px',
        color: COLORS.danger,
        wordWrap: { width: GAME_WIDTH - 80, useAdvancedWrap: true },
      });
      return;
    }
    ensurePlaceholderTextures(this);
    ensureFxTextures(this);
    this.scene.start(SceneKey.Title);
  }
}
