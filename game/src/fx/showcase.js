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

export const SHOWCASE_ORDER = ['foyer', 'nursery', 'greenhouse', 'crypt', 'ballroom',
  'lampworks', 'bathhouse', 'pumpkin', 'heart', 'graveyard', 'study', 'attic',
  'kitchens', 'sleeping', 'hedge', 'passages', 'kennels'];

export function mountShowcase(ctx, opts = {}) {
  const atmo = ctx.atmosphere;
  if (!atmo?.ready) { console.warn('[showcase] atmosphere not ready'); return null; }

  // Hide game DOM so the backdrop is judged on its own merits.
  if (opts.hideDom !== false) ctx.dom.style.display = 'none';

  /* A stand-in for a companion: something for the light to actually fall on,
     so warm key / cold rim can be read on a solid object. */
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2130, roughness: 0.82, metalness: 0.05 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.62, 6, 18), bodyMat);
  body.position.set(-1.9, 1.0, -2.2);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.40, 22, 16), bodyMat);
  head.position.set(-1.9, 1.85, -2.2);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, 0.30, 24),
    new THREE.MeshStandardMaterial({ color: 0x1a1522, roughness: 0.95 }));
  plinth.position.set(-1.9, 0.15, -2.2);
  group.add(body, head, plinth);
  ctx.stage.scene.add(group);

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
    impact(x = -1.9, y = 1.4, z = -2.2, strength = 1.4, color = 0xffd75e) {
      atmo.impact(new THREE.Vector3(x, y, z), { strength, color });
    },
    trans(kind) { return ctx.transition.wipe(kind, () => ctx.clock.wait(0.25)); },
    cover(kind) { return ctx.transition.cover(kind); },
    reveal() { return ctx.transition.reveal(); },
    unmount() {
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
