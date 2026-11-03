/** Baseline presentation speed. User speed/fast-mode multipliers apply on top.
 * Two-thirds speed means animations take 1.5 times their former duration. */
export const BASE_ANIMATION_RATE = 2 / 3;

/** Match wall-clock cleanup to CSS motion, including the player's speed setting. */
export function presentationMs(ms) {
  if (typeof document === 'undefined') return ms / BASE_ANIMATION_RATE;
  const root = document.documentElement;
  if (root.dataset.reduceMotion === '1') return 1;
  return ms * (parseFloat(getComputedStyle(root).getPropertyValue('--anim-scale')) || 1 / BASE_ANIMATION_RATE);
}
