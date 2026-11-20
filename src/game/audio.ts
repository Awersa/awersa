import Phaser from 'phaser';
import { getSettings } from './settings.ts';

/**
 * Sound helpers. Every call is a no-op when the sound file isn't bundled (silent fallback),
 * when sound is off, or before the browser allows audio (Phaser unlocks it on the first touch).
 */
let bgmKey: string | null = null;
let bgm: Phaser.Sound.BaseSound | null = null;

const has = (scene: Phaser.Scene, key: string) => scene.cache.audio.exists(key);

export function sfx(scene: Phaser.Scene, key: string, rate = 1): void {
  const s = getSettings();
  if (!s.sound || !has(scene, key)) return;
  try {
    scene.sound.play(key, { volume: s.sfxVolume, rate });
  } catch {
    /* audio not available — ignore */
  }
}

/** Plays a looping background track (keeps playing across scenes if it's the same key). */
export function playBgm(scene: Phaser.Scene, key: string): void {
  const s = getSettings();
  if (bgmKey === key && bgm?.isPlaying) return;
  stopBgm();
  if (!s.sound || !has(scene, key)) return;
  try {
    bgm = scene.sound.add(key, { loop: true, volume: s.bgmVolume });
    bgm.play();
    bgmKey = key;
  } catch {
    bgm = null;
    bgmKey = null;
  }
}

export function stopBgm(): void {
  bgm?.stop();
  bgm?.destroy();
  bgm = null;
  bgmKey = null;
}
