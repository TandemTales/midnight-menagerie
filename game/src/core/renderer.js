/**
 * WebGL stage: renderer, composer, camera rig, post chain.
 * OWNER: atmosphere agent (co-owned with lead). Scenes ask for `stage.scene` and add objects.
 *
 * Public API (do not break): resize(), shake(), flash(), setCameraBase(),
 * .scene, .camera, .grade, .bloom
 * Added by atmosphere: setParallax(), ripple(), pulse(), setQuality(), .lookAt,
 *                      setCameraRig(), warmup()
 * Added by perf:       .tier, .tierSpec, setTier(), QUALITY_TIERS, .stats
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PERF ROUND (2026-08-20)
 *
 * Measured with EXT_disjoint_timer_query_webgl2 on the real target GPU —
 * ANGLE (Intel UHD Graphics 0x9A60, D3D11) at 1600x900. Note that gl.finish()
 * is NOT a usable fence under ANGLE: it reported 0.2 ms for a frame the timer
 * queries measured at 24 ms, because the commands sit in the GPU process.
 *
 * The frame was 24.1 ms (=> 41 fps ceiling, 34 fps observed). Where it went, and
 * the two facts that shaped every fix here:
 *
 *   1. The post chain is BANDWIDTH-bound, not ALU-bound. Zeroing uHalation,
 *      uDirt, uGrain and uAberration individually moved the grade pass by less
 *      than the measurement noise; the cost is reading and writing a
 *      1600x900 RGBA16F target. So the lever is FEWER FULL-RES PASSES and FEWER
 *      PIXELS, not cheaper arithmetic. Hence: OutputPass folded into the grade
 *      (one whole read+write deleted), bloom mip chain at half resolution, and
 *      a render scale as the primary tier knob.
 *
 *   2. The scene was paying for pixels nobody saw. See backdrop.js for the near
 *      frame (4.2 ms of full-screen overdraw, three of its four quads provably
 *      invisible).
 *
 * The composer also never had its pixel ratio set: EffectComposer captures
 * renderer.getPixelRatio() at construction (1, since setPixelRatio had not been
 * called yet) and setSize() does not update it. On any devicePixelRatio > 1
 * display the scene therefore rendered into a 1x target and was blitted to a 2x
 * framebuffer — blurry, and silently. resize() now drives both explicitly.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { clock } from './clock.js';
import { Save } from './save.js';
import { GradeShaderDef } from '../fx/shaders/grade.js';

/**
 * Quality tiers. `renderScale` multiplies the WebGL drawing buffer only — the UI
 * is DOM and stays pixel-crisp at every tier, so this trades sharpness on a soft
 * procedural backdrop for close to quadratic savings on the entire frame.
 *
 * Nothing here turns a light off or flattens the grade: the round-2 atmosphere
 * work (mid-tones 7.1% -> 22.7%, region cross-correlation 0.627 -> 0.296) is the
 * thing being protected. `low` drops resolution, bloom detail, halation taps and
 * particle count — all of which change how CRISP the room is, not how it is lit.
 */
export const QUALITY_TIERS = {
  high:   { renderScale: 1.00, dprCap: 2.00, bloomScale: 0.50, halTaps: 8, dirt: 1, particles: 1500 },
  medium: { renderScale: 0.80, dprCap: 1.50, bloomScale: 0.50, halTaps: 6, dirt: 1, particles: 1100 },
  low:    { renderScale: 0.62, dprCap: 1.00, bloomScale: 0.25, halTaps: 4, dirt: 0, particles: 650  },
};
const TIER_ORDER = ['low', 'medium', 'high'];

/**
 * Pick a starting tier from the GL renderer string plus how many pixels the
 * display is going to ask for. This runs before the first frame, so it can only
 * use priors — the timing probe in _calibrate() corrects it with real numbers.
 */
export function detectTier(rendererString, pixels) {
  const s = String(rendererString || '');
  let tier;
  if (/SwiftShader|llvmpipe|Software|Basic Render|Microsoft Basic/i.test(s)) tier = 'low';
  else if (/Apple M\d|NVIDIA|GeForce|RTX|GTX|Quadro|Radeon (RX|Pro)|Arc\b/i.test(s)) tier = 'high';
  else if (/Intel|UHD|HD Graphics|Iris|Mali|Adreno|PowerVR|Vivante|Videocore/i.test(s)) tier = 'medium';
  else tier = 'medium';
  // A big canvas on a modest part is the same problem as a slow part.
  if (pixels > 2.6e6 && tier !== 'low') tier = TIER_ORDER[TIER_ORDER.indexOf(tier) - 1];
  return tier;
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
      stencil: false, depth: true,
    });
    this.renderer.setClearColor(0x04030a, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x08060f, 0.016);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    this.camera.position.set(0, 2.3, 9.6);
    this.lookAt = new THREE.Vector3(0, 2.4, 0);
    this.camera.lookAt(this.lookAt);

    /* ---- quality tier, chosen before anything is compiled ----------------- */
    const dpr0 = devicePixelRatio || 1;
    this.glRenderer = (() => {
      try {
        const gl = this.renderer.getContext();
        const d = gl.getExtension('WEBGL_debug_renderer_info');
        return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      } catch { return ''; }
    })();
    const forced = Save.settings?.quality;
    this.tierAuto = detectTier(this.glRenderer, innerWidth * innerHeight * dpr0 * dpr0);
    this.tier = (forced && forced !== 'auto' && QUALITY_TIERS[forced]) ? forced : this.tierAuto;
    this.tierForced = !!(forced && forced !== 'auto' && QUALITY_TIERS[forced]);
    this.tierSpec = QUALITY_TIERS[this.tier];
    /* Continuous trim on top of the tier, set once by the post-warmup timing
       probe. Kept separate so a bad guess costs a resize, never a recompile. */
    this._scaleAdjust = 1;

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // Bloom: threshold high enough that only flames, spectral glow and rim hits
    // cross it. UI is DOM so it can never bloom — this only touches the WebGL layer.
    // The mip chain runs at `bloomScale` of the frame: bloom is low-frequency by
    // construction, so half resolution is visually indistinguishable and cost
    // 2.85 ms -> 1.2 ms here. Halving the chain doubles the kernel in screen
    // space, so `radius` is trimmed to keep the halo the same width.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.86, 0.58, 0.70);
    this._bloomRadiusBase = 0.58;
    this.composer.addPass(this.bloom);

    this.grade = new ShaderPass(GradeShaderDef);
    this._applyGradeDefines();
    const u = this.grade.uniforms;
    u.uTexel.value      = new THREE.Vector2(1 / 1600, 1 / 900);
    u.uShake.value      = new THREE.Vector2(0, 0);
    u.uFlashColor.value = new THREE.Color(1, 1, 1);
    u.uPulseColor.value = new THREE.Color(1, 1, 1);
    u.uWarmTint.value   = new THREE.Color(0.075, 0.042, -0.020);
    u.uCoolTint.value   = new THREE.Color(-0.012, 0.006, 0.040);
    u.uHaloColor.value  = new THREE.Color(1.0, 0.72, 0.40);
    u.uImpact.value     = new THREE.Vector4(0.5, 0.5, 0, 0);
    u.uToneExposure.value = this.renderer.toneMappingExposure;
    this.composer.addPass(this.grade);

    /* No OutputPass. The grade is the last pass and does the ACES tone map and
       the sRGB encode itself (MM_TONEMAP in grade.js) — same maths, same order,
       one fewer full-resolution read+write. */

    this._shake    = { mag: 0, decay: 9, t: 0, freq: 34 };
    this._camBase  = this.camera.position.clone();
    this._parallax = new THREE.Vector3(0, 0, 0);
    this._tmp      = new THREE.Vector3();
    this._impactT  = -1;
    this.quality   = 1;
    this.stats     = { tier: this.tier, renderScale: 1, dpr: 1, frameMs: null };

    this.resize();
    this._onResize = () => this.resize();
    addEventListener('resize', this._onResize, { passive: true });
    clock.onFrame((dt, t) => this.update(dt, t));
  }

  /* --------------------------------------------------------- quality tiers */

  _applyGradeDefines() {
    const t = this.tierSpec;
    const d = this.grade.material.defines || (this.grade.material.defines = {});
    d.MM_HAL_TAPS = t.halTaps;
    d.MM_DIRT = t.dirt;
    d.MM_TONEMAP = 1;
    this.grade.material.needsUpdate = true;
  }

  /**
   * Switch tier. `name` is 'high' | 'medium' | 'low', or 'auto' to hand control
   * back to detection. Persists to Save.settings.quality so it survives a reload
   * and an options screen can bind straight to it.
   */
  setTier(name, { persist = true } = {}) {
    const auto = !name || name === 'auto';
    const next = auto ? this.tierAuto : name;
    if (!QUALITY_TIERS[next]) return this;
    if (persist && Save.settings) {
      Save.settings.quality = auto ? 'auto' : next;
      Save.save?.();
    }
    this.tierForced = !auto;
    if (next === this.tier) return this;
    this.tier = next;
    this.tierSpec = QUALITY_TIERS[next];
    this._scaleAdjust = 1;
    this._applyGradeDefines();
    this.resize();
    for (const fn of this._tierSubs || []) { try { fn(next, this.tierSpec); } catch (e) { console.error(e); } }
    return this;
  }

  /** Notify when the tier changes, so atmosphere can resize its particle field. */
  onTierChange(fn) {
    (this._tierSubs || (this._tierSubs = new Set())).add(fn);
    return () => this._tierSubs.delete(fn);
  }

  /** Legacy knob kept for compatibility: 1 = full, anything lower = 'low' tier. */
  setQuality(q) {
    this.quality = q;
    if (q < 1) this.setTier('low', { persist: false });
    return this;
  }

  /**
   * Stop drawing the WebGL layer. For a scene that covers the canvas completely
   * with its own DOM/SVG art — the title screen does exactly this, with an opaque
   * `.ti-sky` gradient — every frame the stage draws is a whole frame of GPU work
   * that no pixel of reaches the screen. Measured at 23.5 ms/frame on Intel UHD
   * for a screen that was showing a CSS gradient.
   *
   * The scene graph and the composer are untouched, so unpausing is instant and
   * needs no recompile. Callers should pause on enter and unpause on exit.
   */
  setPaused(v) {
    this._paused = !!v;
    this._pausedT = 0;
    return this;
  }

  /**
   * Confirm the string-based tier against real frames, and trim `_scaleAdjust`
   * until the frame fits the budget. The renderer string is only a prior —
   * "Intel UHD" spans a 4x performance range and the player can be at any window
   * size — so nothing is trusted until it has been measured.
   *
   * MEASURED ON WALL-CLOCK FRAME TIME, not on GPU timer queries, even though
   * EXT_disjoint_timer_query_webgl2 exists here. In a live page the timer picks
   * up the compositor's work for neighbouring frames (canvas upscale blit, DOM
   * layers) and reported 18.8 ms for a frame that measured 4.4 ms with the clock
   * stopped — it is a good tool for a controlled bisection and a bad one for a
   * closed loop. rAF interval is also the number that actually matters.
   *
   * Only `_scaleAdjust` moves. Changing the tier itself here would recompile the
   * grade in the middle of the first visible second, which is exactly the long
   * task the warm-up exists to avoid.
   */
  async _calibrate() {
    if (this.tierForced) return;
    const TARGET = 17.2;              // ms/frame == 58 fps
    let best = { adj: this._scaleAdjust, ms: await this._probeFrameMs() };
    this.stats.frameMs = best.ms;
    for (let pass = 0; pass < 3; pass++) {
      if (best.ms <= TARGET) break;
      const want = Math.sqrt(TARGET / best.ms);
      const next = Math.max(0.55, Math.min(1, this._scaleAdjust * want));
      if (Math.abs(next - this._scaleAdjust) < 0.02) break;
      this._scaleAdjust = next;
      this.resize();
      const ms = await this._probeFrameMs();
      /* Only keep a reduction that actually paid. If it did not, the frame is
         not fill-bound any more and shrinking further just makes it blurrier. */
      if (ms < best.ms - 0.4) best = { adj: next, ms };
      else break;
    }
    this._scaleAdjust = best.adj;
    this.resize();
    this.stats.frameMs = +best.ms.toFixed(2);
  }

  /** Median rAF interval over `frames` frames, after letting the pipeline settle. */
  _probeFrameMs(frames = 26, warm = 6) {
    return new Promise((resolve) => {
      const iv = [];
      let last = performance.now(), n = 0;
      const step = () => {
        const now = performance.now();
        if (n++ > warm) iv.push(now - last);
        last = now;
        if (iv.length < frames) requestAnimationFrame(step);
        else { iv.sort((a, b) => a - b); resolve(iv[iv.length >> 1]); }
      };
      requestAnimationFrame(step);
    });
  }

  /**
   * Point the camera for a region. `rig` is {y, z, look, fov}; the rooms differ
   * in proportion so the eye has to differ with them. StS2 frames "epic rather
   * than intimate", so these sit close with a high horizon and little bare floor.
   */
  setCameraRig(rig = {}, dur = 0.7) {
    const to = {
      y: rig.y ?? 2.3, z: rig.z ?? 9.6,
      look: rig.look ?? 2.4, fov: rig.fov ?? 42,
    };
    this._camRig = to;
    const apply = (y, z, look, fov) => {
      this._camBase.set(0, y, z);
      this.lookAt.set(0, look, 0);
      if (Math.abs(this.camera.fov - fov) > 0.01) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
      }
    };
    if (dur <= 0 || Save.settings?.reduceMotion) {
      apply(to.y, to.z, to.look, to.fov);
      this.camera.position.set(0, to.y, to.z);
      return;
    }
    const from = { y: this._camBase.y, z: this._camBase.z, look: this.lookAt.y, fov: this.camera.fov };
    clock.ramp(dur, (v) => {
      const k = v * v * (3 - 2 * v);
      apply(from.y + (to.y - from.y) * k, from.z + (to.z - from.z) * k,
            from.look + (to.look - from.look) * k, from.fov + (to.fov - from.fov) * k);
    });
  }

  /**
   * Build every GPU program behind the loading frame instead of inside the first
   * rendered one. Round 1 had no warm-up anywhere — `grep -rn "compileAsync"`
   * returned nothing — and the first `composer.render()` linked RenderPass +
   * UnrealBloomPass (5 mip levels, 3 materials each) + the grade pass + OutputPass
   * in a single task measured at 5.4–6.4 s (and up to 15 s on a cold profile).
   *
   * Two things fix that: `compileAsync` (which uses KHR_parallel_shader_compile
   * where it exists and, crucially, resolves off the current task where it does
   * not), and rendering the whole post chain once at 8x8 with a yield between
   * each pass so no single task owns the link cost of the entire chain.
   */
  warmup() { return this._warmPromise || (this._warmPromise = this._warmup()); }

  async _warmup() {
    // Block the frame loop until the chain is built. Set synchronously, BEFORE
    // the first await, so frame 1 cannot slip through and pay the whole cost.
    this._warming = true;
    const yield_ = () => new Promise((r) => setTimeout(r, 0));
    const t0 = performance.now();
    const small = () => [Math.max(innerWidth >> 3, 8), Math.max(innerHeight >> 3, 8)];
    this.warmStage = 'materials';
    try {
      /* ---- phase A: scene materials, ONE MESH PER TASK -------------------
         `compileAsync(scene)` links every program in a single task, which under
         software WebGL is one 6 s block — exactly the thing we are removing.
         Compiling per object costs the same in total but spreads it over as many
         tasks as there are materials, and each task yields to the event loop. */
      const objs = [];
      this.scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isSprite) objs.push(o); });
      for (const o of objs) {
        try { await this.renderer.compileAsync(o, this.camera, this.scene); }
        catch (e) { /* keep warming */ }
        await yield_();
      }

      /* ---- phase B: show the room. Bloom and the grade are still cold, so let
         RenderPass be the last enabled pass and go straight to the canvas — three
         applies its own tone map and sRGB encode on that path, so the picture is
         up and correctly exposed while the rest warms, instead of the canvas
         sitting black for the whole compile. */
      this.bloom.enabled = false;
      this.grade.enabled = false;
      this._warming = false;
      this.warmStage = 'post';
      await yield_();

      /* ---- phase C/D: warm each remaining pass off-screen at 1/8 scale, then
         switch it on. Each is its own task. */
      const [sw, sh] = small();
      const cold = [this.bloom, this.grade];
      for (const pass of cold) {
        this.composer.renderToScreen = false;
        this.composer.setSize(sw, sh);
        this.bloom.setSize(sw, sh);
        pass.enabled = true;
        const others = cold.filter((p) => p !== pass);
        for (const o of others) o.enabled = false;
        try { this.composer.render(0.016); } catch (e) { /* keep warming */ }
        await yield_();
        this.composer.renderToScreen = true;
        this.resize();
        for (const o of others) o.enabled = true;
        await yield_();
      }
    } finally {
      this.bloom.enabled = true;
      this.grade.enabled = true;
      this.composer.renderToScreen = true;
      this.resize();
      this._warming = false;
      this.warmStage = 'done';
    }
    this._warmed = Math.round(performance.now() - t0);
    /* Now that every program is linked and the chain is running at full size,
       the frames being measured are the frames the player will get. */
    try { await this._calibrate(); } catch (e) { /* keep the tier we guessed */ }
    return this._warmed;
  }

  resize() {
    const t = this.tierSpec;
    const w = innerWidth, h = innerHeight;
    /* One number drives the whole chain: how many device pixels the WebGL layer
       is allowed. devicePixelRatio is CAPPED rather than honoured — on a 2x
       display the untiered path asked for 4x the fragments of a 1x one, which is
       the difference between 60 fps and 15 on integrated graphics, for a soft
       backdrop behind crisp DOM text that gains nothing from it. */
    const dpr = Math.max(0.5, Math.min(devicePixelRatio || 1, t.dprCap) * t.renderScale * this._scaleAdjust);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    /* EffectComposer keeps its OWN pixel ratio, captured at construction and
       never updated by setSize(). Set it explicitly or the post targets silently
       drift out of step with the drawing buffer. */
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);

    const bs = t.bloomScale;
    this.bloom.setSize(Math.max(8, Math.round(w * dpr * bs)), Math.max(8, Math.round(h * dpr * bs)));
    /* UnrealBloomPass blurs in texels of its own chain, so a half-size chain is a
       double-width halo. Scale the mip blend back down to hold the look. */
    this.bloom.radius = this._bloomRadiusBase * bs * 2;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const u = this.grade.uniforms;
    u.uTexel.value.set(1 / (w * dpr), 1 / (h * dpr));
    u.uAspect.value = w / h;
    u.uToneExposure.value = this.renderer.toneMappingExposure;

    this.stats.tier = this.tier;
    this.stats.dpr = +dpr.toFixed(3);
    this.stats.renderScale = +(t.renderScale * this._scaleAdjust).toFixed(3);
  }

  /** Kick the camera. mag in world units. Respects Save.settings.screenShake. */
  shake(mag = 0.12, decay = 9) {
    const s = Save.settings?.screenShake ?? 1;
    if (s <= 0) return;
    this._shake.mag = Math.max(this._shake.mag, mag * s);
    this._shake.decay = decay;
  }

  /** Full-screen colour flash. Respects Save.settings.flashes. */
  flash(color = 0xffffff, amount = 0.5, dur = 0.18) {
    if (!(Save.settings?.flashes ?? 1)) return;
    const a = Save.settings?.reduceMotion ? amount * 0.45 : amount;
    this.grade.uniforms.uFlashColor.value.set(color);
    this.grade.uniforms.uFlash.value = a;
    clock.ramp(dur, (v) => { this.grade.uniforms.uFlash.value = a * (1 - v); });
  }

  /** Soft coloured wash — gentler than flash, safe for photosensitivity. */
  pulse(color = 0x6fd9ec, amount = 0.22, dur = 0.55) {
    if (!(Save.settings?.flashes ?? 1)) return;
    const a = Save.settings?.reduceMotion ? amount * 0.4 : amount;
    this.grade.uniforms.uPulseColor.value.set(color);
    clock.ramp(dur, (v) => {
      this.grade.uniforms.uPulse.value = a * Math.sin(Math.PI * v);
    });
  }

  /** Screen-space shockwave ring. cx/cy in 0..1 screen UV (y up). */
  ripple(cx = 0.5, cy = 0.5, strength = 1) {
    if (Save.settings?.reduceMotion) return;
    const u = this.grade.uniforms.uImpact.value;
    u.set(cx, cy, 0, strength);
    this._impactT = 0;
  }

  /** Additive camera offset used for idle parallax/breathing (atmosphere drives it). */
  setParallax(x, y, z = 0) { this._parallax.set(x, y, z); }

  update(dt, t) {
    /* Paused: the canvas is fully covered by the scene's own DOM art, so drawing
       it is pure waste. Still emit ONE frame every ~150 ms. Skipping the draw
       entirely can leave the compositor with no damage to present, and a page
       that never presents can have its rAF starved — measured once as a 2.5 s
       stall on `reward` right after pausing, which would freeze the clock that
       drives the DOM animation too. 6-7 frames a second of an unseen backdrop is
       ~1% of the cost and makes that failure impossible. */
    if (this._paused) {
      this._pausedT = (this._pausedT || 0) + dt;
      if (this._pausedT < 0.15) return;
      this._pausedT = 0;
    }
    const u = this.grade.uniforms;
    u.uTime.value = t;

    if (this._impactT >= 0) {
      this._impactT += dt / 0.55;
      if (this._impactT >= 1) { this._impactT = -1; u.uImpact.value.w = 0; }
      else u.uImpact.value.z = this._impactT;
    }

    const s = this._shake;
    const p = this._parallax;
    if (s.mag > 0.0005) {
      s.t += dt;
      const a = s.mag;
      u.uShake.value.set(
        Math.sin(s.t * s.freq * 1.0) * a * 0.045,
        Math.cos(s.t * s.freq * 1.37) * a * 0.045
      );
      this.camera.position.set(
        this._camBase.x + p.x + Math.sin(s.t * s.freq) * a * 0.5,
        this._camBase.y + p.y + Math.cos(s.t * s.freq * 1.3) * a * 0.42,
        this._camBase.z + p.z
      );
      s.mag *= Math.exp(-s.decay * dt);
    } else {
      if (s.mag !== 0) { s.mag = 0; u.uShake.value.set(0, 0); }
      this.camera.position.set(this._camBase.x + p.x, this._camBase.y + p.y, this._camBase.z + p.z);
    }
    this.camera.lookAt(this.lookAt);

    /* While the post chain is still cold, draw the scene straight to the canvas.
       The player sees the room immediately (un-graded, un-bloomed) instead of a
       black screen for the length of the compile, and this path needs only the
       programs the scene itself uses. */
    if (this._warming) { this.renderer.render(this.scene, this.camera); return; }
    this.composer.render(dt);
  }

  setCameraBase(v) { this._camBase.copy(v); this.camera.position.copy(v); }
}
