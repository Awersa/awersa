import Phaser from 'phaser';
import { sfx } from '../game/audio.ts';

/**
 * Touch-friendly press handling: fires on pointer *up* inside the object (sliding off cancels),
 * with a short debounce against double taps. Returns a setter to enable/disable.
 */
export function makePressable(
  obj: Phaser.GameObjects.Container,
  onClick: () => void,
  opts: { pressScale?: number } = {},
): (enabled: boolean) => void {
  let pressed = false;
  let lastFire = 0;
  let enabled = true;
  const baseScale = obj.scale;
  const ps = opts.pressScale ?? 0.96;
  obj.setInteractive({ useHandCursor: true });
  obj.on('pointerdown', () => {
    if (!enabled) return;
    pressed = true;
    obj.setScale(baseScale * ps);
  });
  obj.on('pointerout', () => {
    pressed = false;
    obj.setScale(baseScale);
  });
  obj.on('pointerup', () => {
    const was = pressed;
    pressed = false;
    obj.setScale(baseScale);
    const now = obj.scene.time.now;
    if (!was || !enabled || now - lastFire < 250) return;
    lastFire = now;
    sfx(obj.scene, 'sfx.ui.tap');
    onClick();
  });
  return (on: boolean) => {
    enabled = on;
    if (!on) {
      pressed = false;
      obj.setScale(baseScale);
    }
  };
}
