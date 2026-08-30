/**
 * Music + SFX. OWNER: audio agent.
 *
 *   await audio.unlock()                     first user gesture; idempotent
 *   audio.play(id, {vol,rate,pan,delay})     one synthesised SFX cue
 *   audio.music(cue, {fade})                 crossfade the bed
 *   audio.stopMusic({fade})
 *   audio.tension(0..1)                      darken the bed as things get bad
 *   audio.duck(amount, ms)                   amount 1 == -6 dB
 *   audio.setVolume('master'|'music'|'sfx', v)
 *   audio.stinger(id)                        musical accent over the music
 *
 * Nothing here throws before a user gesture: the AudioContext is created
 * suspended, `play()` is a no-op until it resumes, and the first pointerdown or
 * keydown resumes it and starts whatever cue was queued.
 *
 * Common bus events are auto-wired at the bottom of this file, so other agents
 * get audio for free just by emitting the events they already emit.
 */

import { createMasterBus, clamp } from './dsp.js';
import { SfxEngine, SFX_IDS, CUES, ALIASES, resolveId } from './sfx.js';
import { MusicPlayer, MUSIC_IDS, MUSIC_CUES } from './music.js';

/** scene name -> music cue */
const SCENE_MUSIC = {
  title: 'title', select: 'title', clubhouse: 'safe',
  map: 'map', combat: 'combat', reward: 'safe', event: 'map',
  shop: 'shop', rest: 'safe', gameover: 'defeat',
};

const HEARTBEAT_AT = 0.72;

export class Audio {
  /** @param {object} ctx the shared game ctx (or a BaseAudioContext, for tests) */
  constructor(ctx) {
    const isAudioCtx = ctx && typeof ctx.createGain === 'function';
    this.ctx = isAudioCtx ? null : (ctx || null);
    this.bus = this.ctx?.bus || null;
    this.clock = this.ctx?.clock || null;
    this.Save = this.ctx?.Save || null;

    this.ready = false;
    this.available = false;
    this._unlocking = null;
    this._offs = [];
    this._hbAcc = 0;
    this._tensionBase = 0;
    this._tensionPulse = 0;
    this._tensionSent = -1;
    this._sceneName = null;

    const s = this.Save?.settings || {};
    this.volumes = {
      master: s.master ?? 0.9,
      music: s.music ?? 0.6,
      sfx: s.sfx ?? 0.8,
    };

    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (isAudioCtx) this.ac = ctx;
      else if (AC) this.ac = new AC({ latencyHint: 'interactive' });
      else { this.ac = null; }
    } catch (e) {
      console.warn('[audio] no AudioContext:', e);
      this.ac = null;
    }
    if (!this.ac) return;

    this.mixer = createMasterBus(this.ac, {
      master: this.volumes.master, sfx: this.volumes.sfx,
    });
    this.sfx = new SfxEngine(this.ac, this.mixer.sfxIn);
    this.musicPlayer = new MusicPlayer(this.ac, this.mixer.musicIn, {
      base: this._assetBase(), volume: this.volumes.music,
    });
    this.available = true;

    this._armGesture();
    this._wireBus();
    this._tick = this._tick.bind(this);
    if (this.clock?.onFrame) this._offs.push(this.clock.onFrame(this._tick));
    else if (typeof setInterval === 'function') {
      this._iv = setInterval(() => this._tick(0.06), 60);
    }
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  _assetBase() {
    // game/index.html lives at /game/, and this module at /game/src/audio/
    try { return new URL('../../assets/audio/', import.meta.url).href; }
    catch { return 'assets/audio/'; }
  }

  _armGesture() {
    if (typeof window === 'undefined') return;
    const go = () => { this.unlock(); };
    this._gesture = go;
    for (const ev of ['pointerdown', 'keydown', 'touchstart', 'mousedown']) {
      window.addEventListener(ev, go, { capture: true, passive: true });
    }
  }

  _disarmGesture() {
    if (typeof window === 'undefined' || !this._gesture) return;
    for (const ev of ['pointerdown', 'keydown', 'touchstart', 'mousedown']) {
      window.removeEventListener(ev, this._gesture, { capture: true });
    }
    this._gesture = null;
  }

  /** Resume the context and start any queued cue. Safe to call any number of times. */
  async unlock() {
    if (!this.available) { this.ready = true; return; }
    if (this.ready) return;
    if (this._unlocking) return this._unlocking;
    this._unlocking = (async () => {
      try {
        if (this.ac.state === 'suspended') await this.ac.resume();
      } catch (e) {
        this._unlocking = null;
        return;                       // still gated; the next gesture retries
      }
      if (this.ac.state !== 'running') { this._unlocking = null; return; }
      this.ready = true;
      this._disarmGesture();
      this.musicPlayer.unlock();
      this.bus?.emit('audio:ready', { sampleRate: this.ac.sampleRate });
    })();
    return this._unlocking;
  }

  dispose() {
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    if (this._iv) clearInterval(this._iv);
    this._disarmGesture();
    try { this.sfx?.stopAll(); } catch {}
    try { this.musicPlayer?.dispose(); } catch {}
  }

  // ── public API ───────────────────────────────────────────────────────────

  /** @param {string} id  e.g. 'card:play-attack' or the alias 'hit' */
  play(id, opts) {
    if (!this.available || !this.ready) return null;
    return this.sfx.play(id, opts || {});
  }

  music(cue, opts) {
    if (!this.available) return;
    this.musicPlayer.play(cue, opts || {});
  }

  stopMusic(opts) {
    if (!this.available) return;
    this.musicPlayer.stop(opts || {});
  }

  /** 0 = calm, 1 = the walls are closing in. */
  tension(v) {
    this._tensionBase = clamp(Number(v) || 0, 0, 1);
    this._pushTension(true);
  }

  /** A short spike of tension — an enemy winding up a big hit. */
  telegraph(strength = 1) {
    this._tensionPulse = Math.max(this._tensionPulse, clamp(strength, 0, 1) * 0.6);
    this._pushTension(true);
  }

  /** amount 1 == -6 dB on the music bus, recovering `ms` later. */
  duck(amount = 1, ms = 260) {
    if (!this.available) return;
    this.musicPlayer.duckBy(amount, ms);
  }

  /**
   * Re-read every volume from Save.settings and apply it.
   * `scenes/title.js` has always called `ctx.audio?.applySettings?.()` after the
   * settings panel closes; the method did not exist, so the optional chain ate
   * it and a volume change from the title screen did nothing until something
   * else emitted `settings:changed`.
   */
  applySettings() {
    const s = this.Save?.settings;
    if (!s) return;
    this.setVolume('master', s.master ?? this.volumes.master);
    this.setVolume('music', s.music ?? this.volumes.music);
    this.setVolume('sfx', s.sfx ?? this.volumes.sfx);
  }

  setVolume(which, v) {
    const val = clamp(Number(v) || 0, 0, 1);
    this.volumes[which] = val;
    if (this.available) {
      const t = this.ac.currentTime;
      if (which === 'master') this.mixer.master.gain.setTargetAtTime(val, t, 0.04);
      else if (which === 'sfx') this.mixer.sfxIn.gain.setTargetAtTime(val, t, 0.04);
      else if (which === 'music') this.musicPlayer.setVolume(val);
    }
    try { this.Save?.setSetting?.(which, val); } catch {}
  }

  /** A musical accent laid over the bed; ducks the music while it rings. */
  stinger(id) {
    if (!this.available || !this.ready) return null;
    const key = resolveId(id) || resolveId('sting:' + id) || (CUES['sting:' + id] ? 'sting:' + id : null);
    if (!key) { console.warn('[audio] unknown stinger:', id); return null; }
    const dur = CUES[key].dur;
    this.duck(0.9, Math.min(1600, dur * 700));
    return this.sfx.play(key, { vol: 1 });
  }

  /** Live output level for meters: { peak, rms } in 0..1. */
  level() {
    if (!this.available) return { peak: 0, rms: 0 };
    const a = this.mixer.analyser;
    const n = a.fftSize;
    if (!this._meterBuf || this._meterBuf.length !== n) this._meterBuf = new Float32Array(n);
    a.getFloatTimeDomainData(this._meterBuf);
    let peak = 0, sum = 0;
    for (let i = 0; i < n; i++) {
      const x = this._meterBuf[i];
      const ax = x < 0 ? -x : x;
      if (ax > peak) peak = ax;
      sum += x * x;
    }
    return { peak, rms: Math.sqrt(sum / n) };
  }

  get ids() { return SFX_IDS.slice(); }
  get cues() { return MUSIC_IDS.slice(); }
  get aliases() { return { ...ALIASES }; }
  nowPlaying() { return this.available ? this.musicPlayer.nowPlaying() : null; }

  // ── internals ────────────────────────────────────────────────────────────

  _tick(dt) {
    if (!this.available) return;
    this.musicPlayer.update();
    if (this._tensionPulse > 0.0005) {
      this._tensionPulse *= Math.exp(-(dt || 0.016) / 2.2);
      this._pushTension(false);
    }
    // heartbeat under the music when Courage is nearly gone
    const t = this._effTension();
    if (this.ready && t >= HEARTBEAT_AT && this._sceneName === 'combat') {
      this._hbAcc += dt || 0.016;
      const period = 2.0 - 0.85 * ((t - HEARTBEAT_AT) / (1 - HEARTBEAT_AT));
      if (this._hbAcc >= period) {
        this._hbAcc = 0;
        this.sfx.play('world:heartbeat', { vol: 0.35 + 0.5 * t });
      }
    } else this._hbAcc = 0;
  }

  _effTension() { return clamp(this._tensionBase * 0.88 + this._tensionPulse, 0, 1); }

  _pushTension(force) {
    const v = this._effTension();
    if (!force && Math.abs(v - this._tensionSent) < 0.01) return;
    this._tensionSent = v;
    this.musicPlayer.tension(v);
  }

  _hpTension(p) {
    const hp = p?.hp ?? p?.courage ?? p?.target?.hp;
    const max = p?.maxHp ?? p?.maxCourage ?? p?.target?.maxHp;
    if (typeof hp === 'number' && typeof max === 'number' && max > 0) {
      this._tensionBase = clamp(1 - hp / max, 0, 1);
      this._pushTension(false);
    }
  }

  // ── bus auto-wiring ──────────────────────────────────────────────────────

  _wireBus() {
    const bus = this.bus;
    if (!bus?.on) return;
    const on = (ev, fn) => this._offs.push(bus.on(ev, (p) => {
      if (!this.ready) return;
      try { fn(p || {}); } catch (e) { console.error('[audio:' + ev + ']', e); }
    }));

    /**
     * ── What this bus block is, and what it is NOT ──────────────────────────
     *
     * Only the five below are here. There used to be thirty-three more, and
     * every one of them was DEAD:
     *
     * `combat/engine.js` forwards each engine event to the bus as
     * `combat:${type}`, and this file listened for the bare names — 'damage',
     * 'block', 'heal', 'status', 'death', 'turn:start', 'draw', 'discard',
     * 'exhaust', 'shuffle', 'intent'. The bus carries 'combat:damage'. Two
     * entries in `EV` are themselves named 'combat:start' and 'combat:end', so
     * what actually goes past is 'combat:combat:start' — logged during a real
     * fight, not deduced.
     *
     * The game was never silent, which is why this survived: `scenes/combat.js`
     * plays thirteen of those cues DIRECTLY, at the moment its FX play them,
     * which is the right place for a hit sound. Renaming these handlers to the
     * prefixed names would have stacked a second voice on all thirteen.
     *
     * `docs/notes/2026-08-19-audio.md` published the opposite contract —
     * "audio.js listens on the bus and needs no calls from anyone" — and no
     * producer ever honoured it. The payloads never matched either: `_hpTension`
     * reads `p.hp`/`p.maxHp`, and no engine event carries those fields.
     *
     * `tests/bus-names/check.py` resolves the `on(...)` alias below now and
     * FAILS on any name here that nothing emits, so this cannot silt up again.
     *
     * Twelve cues in the bank are still unreachable and the mix layer
     * (`tension`, `telegraph`, `duck` on a hit) still has no live caller — both
     * are open items in HANDOFF, with the evidence.
     */
    on('card:hover', () => this.play('card:hover'));
    on('card:pickup', () => this.play('card:pickUp'));
    on('card:drop', () => this.play('card:drop'));
    on('card:play', (p) => {
      const t = (p.type || p.card?.type || 'skill').toLowerCase();
      const id = t === 'attack' ? 'card:play-attack'
        : t === 'power' ? 'card:play-power' : 'card:play-skill';
      this.play(id);
      if (t === 'power') this.duck(0.5, 320);
    });
    on('map:choose', () => { this.play('ui:confirm'); this.play('world:door-open', { delay: 0.1, vol: 0.7 }); });

    // ── scenes drive the bed
    this._offs.push(bus.on('scene:entered', (p) => {
      const name = p?.name;
      this._sceneName = name;
      if (!this.available) return;
      let cue = SCENE_MUSIC[name];
      if (name === 'combat') {
        const kind = String(p?.params?.node || p?.params?.encounter || p?.params?.tier || '');
        if (/boss/i.test(kind)) cue = 'boss';
        else if (/elite|bigScare/i.test(kind)) cue = 'combat';
        this.tension(0);
      }
      if (name === 'gameover') cue = p?.params?.win ? 'victory' : 'defeat';
      if (name !== 'combat') this.tension(0);
      if (cue) this.music(cue);
    }));

    this._offs.push(bus.on('settings:changed', () => {
      const s = this.Save?.settings;
      if (!s) return;
      this.setVolume('master', s.master ?? this.volumes.master);
      this.setVolume('music', s.music ?? this.volumes.music);
      this.setVolume('sfx', s.sfx ?? this.volumes.sfx);
    }));
  }
}

export { SFX_IDS, MUSIC_IDS, MUSIC_CUES, CUES, ALIASES };
export default Audio;
