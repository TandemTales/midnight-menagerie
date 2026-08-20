/**
 * Stage pause helper for scenes whose own DOM art covers the WebGL canvas.
 * OWNER: shared by the scene modules in this directory.
 *
 * Nine of the ten scenes paint a full 3D frame — scene, bloom, colour grade —
 * behind an opaque DOM screen. Measured by screenshotting each scene with and
 * without `#gl` visible and diffing the two PNGs (CSS animations paused first so
 * the noise floor is a true 0.00%):
 *
 *   combat 57.1%   ·   title / select / clubhouse / map / reward / event /
 *                      shop / rest / gameover  all 0.00%
 *
 * `Stage.setPaused(true)` skips the composer but keeps a ~150 ms keepalive frame,
 * so the compositor always has damage to present and the rAF pump that drives the
 * DOM animations can never be starved.
 *
 * WHY THE PAUSE IS DEFERRED UNTIL `warmup()` RESOLVES, which is the whole reason
 * this is a helper and not a one-liner in nine files: `Stage._calibrate()` runs at
 * the tail of `warmup()` and trims the render scale from the *measured* rAF
 * interval. A paused stage hands it a free 16.6 ms frame, it concludes the machine
 * has headroom it does not have, and combat — the one scene that actually draws —
 * inherits an un-trimmed render scale. The boot scene is normally `title`, so
 * without this the calibration would be wrong on every cold start. Waiting costs
 * nothing: after the first load `warmup()` is an already-resolved promise, so the
 * pause lands on the next microtask.
 *
 * The returned function is the matching unpause. Call it from `exit()`. It also
 * disarms a pause that has not fired yet, so a scene that is left before the
 * warm-up finishes cannot pause the stage out from under whatever came next.
 */
export function pauseStageFor(ctx) {
  const stage = ctx?.stage;
  if (!stage || typeof stage.setPaused !== 'function') return () => {};

  let live = true;
  const pause = () => { if (live) { try { stage.setPaused(true); } catch { /* no stage */ } } };

  let warm = null;
  try { warm = stage.warmup?.(); } catch { warm = null; }
  if (warm && typeof warm.then === 'function') warm.then(pause, pause);
  else pause();

  return () => {
    live = false;
    try { stage.setPaused(false); } catch { /* no stage */ }
  };
}
