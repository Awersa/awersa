import Phaser from 'phaser';
import { getSettings } from './settings.ts';
import { playSynth } from './synth.ts';

/**
 * Sound helpers. Every call is a no-op when the sound file isn't bundled (silent fallback),
 * when sound is off, or before the browser allows audio (Phaser unlocks it on the first touch).
 */
let bgmKey: string | null = null;
let bgm: Phaser.Sound.BaseSound | null = null;

const has = (scene: Phaser.Scene, key: string) => scene.cache.audio.exists(key);

/** Plays a sound effect: the bundled file if there is one, otherwise a synthesized fallback. */
export function sfx(scene: Phaser.Scene, key: string, rate = 1): void {
  const s = getSettings();
  if (!s.sound) return;
  if (!has(scene, key)) {
    playSynth(audioContext(scene), key, s.sfxVolume);
    return;
  }
  try {
    scene.sound.play(key, { volume: s.sfxVolume, rate });
  } catch {
    /* audio not available — ignore */
  }
}

/** The Web Audio context Phaser already unlocked on the first touch (null with HTML5/no audio). */
function audioContext(scene: Phaser.Scene): AudioContext | null {
  const sm = scene.sound;
  return sm instanceof Phaser.Sound.WebAudioSoundManager ? sm.context : null;
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
