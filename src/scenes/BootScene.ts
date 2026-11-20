import Phaser from 'phaser';
import { SceneKey } from './keys';

/**
 * Boot: will load assets/manifest.json in milestone 7 (with placeholder fallback).
 * For now it only hands off to the title screen.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    this.scene.start(SceneKey.Title);
  }
}
