/** Music + SFX. OWNER: audio agent. */
export class Audio {
  constructor(ctx) { this.ctx = ctx; this.ready = false; }
  async unlock() { this.ready = true; }
  play(id, opts) {}
  music(track, opts) {}
  stopMusic() {}
}
