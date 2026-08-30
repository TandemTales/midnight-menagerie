/** Frame loop + tween/sequence scheduler. All animation timing flows through here. */
export class Clock {
  constructor() {
    this.t = 0; this.dt = 0; this.raf = 0; this.running = false;
    this.paused = false;         // the Steam overlay, or the window losing focus
    this.scale = 1;              // global time scale (slow-mo on big hits)
    this._subs = new Set();
    this._tweens = [];
    this._timers = [];
    this._last = 0;
  }
  start() {
    if (this.running || this.paused) return;
    this.running = true; this._last = performance.now();
    const step = (now) => {
      if (!this.running) return;
      const raw = Math.min((now - this._last) / 1000, 0.1);
      this._last = now;
      this.dt = raw * this.scale;
      this.t += this.dt;
      this._runTweens(this.dt);
      this._runTimers(this.dt);
      for (const fn of this._subs) { try { fn(this.dt, this.t); } catch (e) { console.error(e); } }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  onFrame(fn) { this._subs.add(fn); return () => this._subs.delete(fn); }

  /* ── pause ────────────────────────────────────────────────────────────────
   * Freezing, as distinct from stopping: `resume()` puts it back exactly where
   * it was, and `start()` refuses while paused so nothing else can restart the
   * loop behind the pause's back.
   *
   * WHY THIS IS NOT ALREADY FREE. A hidden tab stops getting rAF callbacks, so
   * a backgrounded browser game freezes itself. The Steam overlay does NOT hide
   * the window — it composites on top of a game that is still running, still
   * getting frames, and still resolving an enemy turn the player cannot see.
   * A player who pressed Shift+Tab to read a guide and came back to a dead run
   * writes a review about it.
   *
   * `_last` is re-stamped by `start()`, so the frame after a resume has a normal
   * `dt` instead of the entire pause duration. Without that, unpausing after two
   * minutes in the overlay would advance every tween two minutes in one frame —
   * which the `Math.min(..., 0.1)` clamp would blunt but not prevent, because a
   * hundred-millisecond frame is still four times the usual step.
   */
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.stop();
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.start();
  }

  /** Promise-returning tween. obj[key] animated to `to` over `dur` seconds. */
  tween(obj, props, dur, ease = Clock.easeOutCubic, onUpdate) {
    return new Promise((resolve) => {
      const from = {};
      for (const k in props) from[k] = obj[k];
      this._tweens.push({ obj, props, from, dur: Math.max(dur, 1e-6), e: 0, ease, onUpdate, resolve });
    });
  }
  /** Raw 0..1 progress tween. */
  ramp(dur, onUpdate, ease = (x) => x) {
    return new Promise((resolve) => {
      this._tweens.push({ raw: true, dur: Math.max(dur, 1e-6), e: 0, ease, onUpdate, resolve });
    });
  }
  wait(sec) {
    return new Promise((resolve) => this._timers.push({ t: sec, resolve }));
  }
  _runTweens(dt) {
    for (let i = this._tweens.length - 1; i >= 0; i--) {
      const tw = this._tweens[i];
      tw.e += dt;
      const p = Math.min(tw.e / tw.dur, 1);
      const v = tw.ease(p);
      if (tw.raw) { tw.onUpdate?.(v, p); }
      else {
        for (const k in tw.props) tw.obj[k] = tw.from[k] + (tw.props[k] - tw.from[k]) * v;
        tw.onUpdate?.(v, p);
      }
      if (p >= 1) { this._tweens.splice(i, 1); tw.resolve(); }
    }
  }
  _runTimers(dt) {
    for (let i = this._timers.length - 1; i >= 0; i--) {
      const tm = this._timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { this._timers.splice(i, 1); tm.resolve(); }
    }
  }
  killAll() {
    this._tweens.forEach(t => t.resolve());
    this._timers.forEach(t => t.resolve());
    this._tweens.length = 0; this._timers.length = 0;
  }
  /** Briefly slow time — used for impact emphasis. */
  async hitstop(amount = 0.12, dur = 0.09) {
    const prev = this.scale;
    this.scale = amount;
    await new Promise(r => setTimeout(r, dur * 1000));
    this.scale = prev;
  }
  static easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
  static easeOutQuint(x) { return 1 - Math.pow(1 - x, 5); }
  static easeInCubic(x) { return x * x * x; }
  static easeInOut(x) { return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x+2, 3)/2; }
  static easeOutBack(x) { const c1=1.70158, c3=c1+1; return 1 + c3*Math.pow(x-1,3) + c1*Math.pow(x-1,2); }
  static easeOutElastic(x) {
    const c4 = (2*Math.PI)/3;
    return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2,-10*x)*Math.sin((x*10-0.75)*c4)+1;
  }
  static easeOutBounce(x) {
    const n1=7.5625, d1=2.75;
    if (x < 1/d1) return n1*x*x;
    if (x < 2/d1) return n1*(x-=1.5/d1)*x+.75;
    if (x < 2.5/d1) return n1*(x-=2.25/d1)*x+.9375;
    return n1*(x-=2.625/d1)*x+.984375;
  }
}
export const clock = new Clock();
