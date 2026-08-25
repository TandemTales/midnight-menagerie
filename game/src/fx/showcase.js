/**
 * Atmosphere showcase — a harness so the backdrop can actually be judged.
 * OWNER: atmosphere agent. Not part of the shipped game flow.
 *
 *   import('/game/src/fx/showcase.js').then(m => m.mountShowcase(window.MM.ctx))
 *
 * Then drive it from tools/shot.py --steps:
 *   js:MM.showcase.set('crypt') | wait:1.2 | shot:crypt
 *   js:MM.showcase.impact()     | wait:0.2 | shot:hit
 *   js:MM.showcase.trans('doorway')
 */
import * as THREE from 'three';
import { REGIONS } from './atmosphere.js';
import { HANGING, BACKDROP_CONST } from './backdrop.js';

export const SHOWCASE_ORDER = ['foyer', 'nursery', 'greenhouse', 'crypt', 'ballroom',
  'lampworks', 'bathhouse', 'pumpkin', 'heart', 'graveyard', 'study', 'attic',
  'kitchens', 'sleeping', 'hedge', 'passages', 'kennels'];

export function mountShowcase(ctx, opts = {}) {
  const atmo = ctx.atmosphere;
  if (!atmo?.ready) { console.warn('[showcase] atmosphere not ready'); return null; }

  // Hide game DOM so the backdrop is judged on its own merits.
  if (opts.hideDom !== false) ctx.dom.style.display = 'none';
  /* The title screen pauses the stage (its own DOM art covers the canvas), and a
     paused stage draws ~6 fps — one frame per 150 ms of CLOCK time. With the clock
     frozen for a measurement that becomes zero frames forever, so every isolated
     layer screenshot came back byte-identical to the one before it. The showcase
     just hid that DOM; it owns the canvas now. */
  ctx.stage.setPaused(false);

  /* A stand-in for a companion: something for the light to actually fall on,
     so warm key / cold rim can be read on a solid object. Its albedo matches the
     enemy sprites' mid-tone (a warm mid-brown), NOT near-black — a black stand-in
     tells you nothing about whether the room is lighting anything. */
  const group = new THREE.Group();
  const AT = [-1.9, -3.0];   // x, z
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a6a52, roughness: 0.72, metalness: 0.04 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 0.70, 8, 22), bodyMat);
  body.position.set(AT[0], 1.05, AT[1]);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.44, 26, 18), bodyMat);
  head.position.set(AT[0], 1.98, AT[1]);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, 0.30, 24),
    new THREE.MeshStandardMaterial({ color: 0x4a4048, roughness: 0.92 }));
  plinth.position.set(AT[0], 0.15, AT[1]);
  group.add(body, head, plinth);
  ctx.stage.scene.add(group);
  // and a real contact shadow under it, from the same system the scenes use
  atmo.setActors([{ x: AT[0], z: AT[1], r: 1.05, strength: 0.68 }]);

  /* Caption */
  const cap = document.createElement('div');
  cap.style.cssText =
    'position:absolute;left:0;right:0;bottom:26px;text-align:center;pointer-events:none;' +
    'font-family:var(--font-display);letter-spacing:.24em;text-transform:uppercase;' +
    'font-size:14px;color:var(--text-mid);text-shadow:0 2px 14px rgba(0,0,0,.9);z-index:5';
  ctx.fx.appendChild(cap);

  let idx = 0;
  const api = {
    order: SHOWCASE_ORDER,
    set(name, instant = false) {
      idx = Math.max(0, SHOWCASE_ORDER.indexOf(name));
      atmo.setMood(name, { instant });
      cap.textContent = `${REGIONS[name]?.label || name}   ·   ${idx + 1} / ${SHOWCASE_ORDER.length}`;
      return name;
    },
    next() { return api.set(SHOWCASE_ORDER[(idx + 1) % SHOWCASE_ORDER.length]); },
    dread(v) { atmo.dread(v); return v; },
    pulse(c) { atmo.pulse(c ?? 0x6fd9ec, 0.26); },
    impact(x = -1.9, y = 1.4, z = -3.0, strength = 1.4, color = 0xffd75e) {
      atmo.impact(new THREE.Vector3(x, y, z), { strength, color });
    },
    trans(kind) { return ctx.transition.wipe(kind, () => ctx.clock.wait(0.25)); },

    /* ---- measurement hooks (tools/lookmetrics.py) --------------------------
       "A prop must never be the brightest thing in frame" is only enforceable if
       prop pixels and creature pixels can be told apart. Isolating each layer for
       one frame and differencing gives an exact mask — far better than guessing
       rectangular "prop bands", which is what round 2 did and why the regression
       went unnoticed. */
    group,
    showProps(v) { atmo.backdrop.props.visible = v !== false; },
    showActor(v) { group.visible = v !== false; },
    /* VOLUMETRIC LIGHT — flames and shafts. Props are alpha-blended with
       depthWrite off and both of these draw additively after them, so a candle
       at a lamp post's lantern, or a shaft crossing a wardrobe, writes a
       near-white pixel that the prop-vs-actor difference attributes to the PROP.
       Neither is a prop: they are the light itself, and round 2 deliberately
       made the flame the one thing in frame that clips. Isolating them lets the
       metric drop them from both sides. */
    /* Every lamp flickers, so freezing the clock freezes it at whatever phase it
       happened to be in. Two captures of the same build measured the actor's
       peak 14 apart on that alone. Drop the flicker and settle every lamp on its
       authored intensity: the measurement becomes reproducible, and it is the
       lighting the region was actually authored with. */
    steady() {
      for (const l of atmo.rig.lights) { l.flicker = null; l.update(0, 0, 1); }
      atmo.backdrop.syncLights(atmo.rig);
      atmo.backdrop.syncFlames(atmo.rig);
      atmo.particles.syncLights(atmo.rig);
    },
    showLight(v) {
      atmo.backdrop.flames.visible = v !== false;
      atmo.backdrop.shafts.visible = v !== false;
    },

    /**
     * Placement audit. Projects every prop's world quad through the LIVE camera
     * and reports what is cut by a viewport edge, what floats, and what hangs
     * from nothing. Resolution-dependent by construction — a prop anchored at
     * 1600x900 can hang in the void at 1920x1080, which is exactly the defect
     * this exists to catch.
     */
    audit() {
      const stage = ctx.stage;
      const cam = stage.camera;
      const el = stage.renderer.domElement;
      const W = el.clientWidth || innerWidth, H = el.clientHeight || innerHeight;
      const bd = atmo.backdrop;
      const room = bd.room || {};
      const ceilY = room.h > 0 ? room.h : 0;
      const FRONT = BACKDROP_CONST.FLOOR_FRONT;
      const v = new THREE.Vector3();
      cam.updateMatrixWorld();
      const project = (x, y, z) => {
        v.set(x, y, z).project(cam);
        return [(v.x * 0.5 + 0.5) * W, (1 - (v.y * 0.5 + 0.5)) * H, v.z];
      };
      const out = [];
      for (const p of (bd.placed || [])) {
        const hw = p.w / 2;
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, behind = false;
        for (const cx of [p.x - hw, p.x + hw]) {
          for (const cy of [p.y, p.y + p.h]) {
            const [sx, sy, sz] = project(cx, cy, p.z);
            if (sz > 1) behind = true;
            x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
            y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
          }
        }
        if (behind) continue;                       // wholly behind the camera
        if (x1 < 0 || x0 > W || y1 < 0 || y0 > H) continue;   // off-screen entirely
        const hang = p.hang ?? (HANGING[p.shape] === 1);
        const crossesSide = x0 < 0 || x1 > W;
        const crossesTop = y0 < 0;
        const grounded = y1 > H * 0.80;             // its base is low in frame
        const flags = [];
        /* A big foreground prop bleeding off the side of frame is good
           composition — IF its base is in the lower fifth of the frame, so the
           eye reads it as near clutter. One cut off at head height is debris.
           `arch` marks a piece of architecture (a terrace retaining bed) that is
           MEANT to run the full width of the frame. */
        if ((crossesSide || crossesTop) && !grounded && !p.arch) flags.push('edge-cut');
        /* Off the floor is only allowed if something is actually holding it up.
           Not a flag on the prop — an explicit search for a piece of
           architecture at the same depth, wide enough and tall enough to be
           standing on. Round 2's Greenhouse lifted 20 of 30 props onto tiers
           that did not exist. */
        if (!hang && !p.arch && p.y > 0.06) {
          const held = (bd.placed || []).some((q) => q.arch
            && Math.abs(q.z - p.z) < 2.4
            && Math.abs(q.x - p.x) < q.w * 0.5 + p.w * 0.5
            && q.y + q.h >= p.y - 0.10);
          if (!held) flags.push('floating');
        }
        if (hang) {
          // an anchor you cannot see is not an anchor
          if (y0 < 0) flags.push('anchor-off-frame');
          if (ceilY <= 0) flags.push('hangs-from-no-ceiling');
          else if (p.y + p.h < ceilY - 0.05) flags.push('hangs-from-nothing');
          if (Math.abs(p.x) > room.w / 2 || p.z < -room.d || p.z > FRONT) flags.push('outside-shell');
          /* A curtain in the middle of an open floor has nothing to hang on. A
             chandelier does — it draws its own ceiling rose — so only rail
             shapes are held to this. */
          if (p.shape === 7 && Math.abs(p.x) < room.w * 0.30 && p.z > -room.d * 0.55) {
            flags.push('mid-air-drape');
          }
        }
        if (flags.length) {
          out.push({
            shape: p.shape, hang,
            x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
            w: +p.w.toFixed(2), h: +p.h.toFixed(2),
            rect: [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)],
            flags,
          });
        }
      }
      return { w: W, h: H, region: atmo.mood, props: (bd.placed || []).length,
               room: { w: +(room.w || 0).toFixed(1), d: +(room.d || 0).toFixed(1), h: +(room.h || 0).toFixed(1) },
               bad: out };
    },
    cover(kind) { return ctx.transition.cover(kind); },
    reveal() { return ctx.transition.reveal(); },
    unmount() {
      atmo.backdrop.props.visible = true;
      atmo.backdrop.flames.visible = true;
      atmo.backdrop.shafts.visible = true;
      group.visible = true;
      atmo.setActors([]);
      ctx.stage.scene.remove(group);
      body.geometry.dispose(); head.geometry.dispose(); plinth.geometry.dispose();
      bodyMat.dispose(); plinth.material.dispose();
      cap.remove();
      ctx.dom.style.display = '';
      if (window.MM) delete window.MM.showcase;
    },
  };

  api.set(opts.start || 'foyer', true);
  if (window.MM) window.MM.showcase = api;
  return api;
}
