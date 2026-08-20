/** Ambient dust, candle flicker, global lighting mood. OWNER: atmosphere agent. */
export class Atmosphere {
  constructor(ctx) { this.ctx = ctx; }
  init() {}
  setMood(name) { this.mood = name; }
}
