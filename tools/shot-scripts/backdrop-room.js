async (P) => {
  /* P.hash, when given, stands in for location.hash, so ONE warmed page can
     photograph room after room (tools/room_batch.py). Every capture otherwise
     pays ~45 s of load and shader warm-up to change one room. shot.py passes
     nothing and this reads the URL as it always did. */
  const ctx = window.MM.ctx;
  for (let i = 0; i < 160 && !(ctx.atmosphere && ctx.atmosphere.ready); i++) {
    await new Promise(r => setTimeout(r, 250));
  }
  const m = await import('/game/src/fx/showcase.js');
  if (!window.MM.showcase) m.mountShowcase(ctx, { hideDom: true });
  if (!window.MM.showcase) throw new Error('showcase did not mount');
  const q = (P && P.hash) ? '#' + P.hash.replace(/^#/, '') : location.hash;
  const region = (q.match(/region=([A-Za-z0-9_-]+)/) || [])[1] || 'foyer';
  const tier = (q.match(/tier=([a-z]+)/) || [])[1];
  if (tier) { ctx.stage.setTier(tier, { persist: false }); await new Promise(r => setTimeout(r, 900)); }
  const tooth = (q.match(/tooth=([0-9.]+)/) || [])[1];
  if (tooth !== undefined) ctx.stage.grade.uniforms.uTooth.value = parseFloat(tooth);
  const dark = (q.match(/toothdark=([0-9.]+)/) || [])[1];
  if (dark !== undefined) ctx.stage.grade.uniforms.uToothDark.value = parseFloat(dark);
  /* Overrides for tuning one knob against a capture. Applied AFTER set(), so
     they survive the region's own palette. */
  window.MM.__bgOver = {};
  for (const k of ['damask', 'damcell', 'ink', 'lip', 'wet', 'damlift', 'propsat', 'propsatmax', 'rim']) {
    const v = (q.match(new RegExp(k + '=([0-9.]+)')) || [])[1];
    if (v !== undefined) window.MM.__bgOver[k] = parseFloat(v);
  }
  ctx.clock.scale = 1;
  /* seed=N is forwarded to setMood, which mixes a ROOM seed into the region's
     own so two rooms that share a name do not share a layout. It is not needed
     for reproducibility -- see the phase note below; build() is deterministic
     per region on its own -- but it is how you get a DIFFERENT arrangement of
     the same room on purpose, which is useful when one layout happens to hide
     the prop you are trying to look at. */
  /* URL-encoded, so a room can be named the way the game names it: combat
     passes the whole room name ("Wax Room", "Butler's Passage"), and ROOM_KINDS
     picks a room's kind by its NAME. The old [A-Za-z0-9_-]+ stopped at the
     first space and photographed a room called "Wax". */
  const seedRaw = (q.match(/seed=([^&]+)/) || [])[1];
  const seed = seedRaw === undefined ? undefined : decodeURIComponent(seedRaw);
  if (seed !== undefined) {
    ctx.atmosphere.setMood(region, { instant: true, seed });
    window.MM.showcase.set(region, true);
    ctx.atmosphere.setMood(region, { instant: true, seed });
  } else {
    window.MM.showcase.set(region, true);
  }
  /* props=0 in the hash hides the props, and actor=0 the stand-in figure, so a
     difference against the full frame gives each layer's own pixels. Measuring
     "the props" from a rectangle instead put the showcase's own stand-in
     capsule and a near-frame drape in the sample and read their colour as the
     props' -- which is how a chroma ceiling that was working measured as doing
     nothing. */
  const showProps = (q.match(/props=([01])/) || [])[1] !== '0';
  const showActor = (q.match(/actor=([01])/) || [])[1] !== '0';
  /* frames=0 and shafts=0 hide the near frame and the light shafts. Both are
     big transparent quads drawn over everything, and in an open-air region a
     faint quad edge across a flat sky is very hard to attribute by eye -- this
     is how you tell which layer a seam belongs to. */
  /* Hide-only, never forced back on: applyPalette decides these per room
     (frame 2 is hidden under an open sky), and it runs again on every room a
     batch switches to. A batch uses one set of flags for every room. */
  const ctxBd = ctx.atmosphere.backdrop;
  if ((q.match(/frames=([01])/) || [])[1] === '0') {
    for (const m of ctxBd.frames) m.visible = false;
  }
  if ((q.match(/shafts=([01])/) || [])[1] === '0') ctxBd.shafts.visible = false;
  /* motes=0 hides the particle field. NOT needed for reproducibility -- with
     the phase pinned a capture is byte-identical with the motes on -- but
     useful for telling which layer a mark belongs to. */
  if ((q.match(/motes=([01])/) || [])[1] === '0') {
    const pf = ctx.atmosphere.particles;
    if (pf && pf.points) pf.points.visible = false;
    else if (pf && pf.mesh) pf.mesh.visible = false;
    else if (pf && pf.group) pf.group.visible = false;
  }
  window.MM.showcase.showProps(showProps && window.MM.__bgProps !== false);
  if (window.MM.showcase.showActor) window.MM.showcase.showActor(showActor);
  await new Promise(r => setTimeout(r, 1400));
  const o = window.MM.__bgOver || {};
  const bd = ctx.atmosphere.backdrop;
  const mats = [bd.wallMat, bd.sides[0].material, bd.sides[1].material,
                bd.floorMat, bd.ceilMat, bd.propMat];
  const NAME = { damask: 'uDamask', damcell: 'uDamCell', ink: 'uInk', lip: 'uLip',
                 wet: 'uWet', damlift: 'uDamLift', propsat: 'uPropSat',
                 propsatmax: 'uPropSatMax', rim: 'uRimAmt' };
  for (const k in o) {
    for (const m of mats) {
      const u = m.uniforms[NAME[k]];
      if (u) u.value = o[k];
    }
  }
  window.MM.showcase.steady();
  /* PIN THE PHASE, do not just stop the clock. clock.t accumulates scaled dt
     and setting scale to 0 leaves it at whatever value the page took to boot --
     and everything time-driven in the room reads it: the props SWAY on
     sin(uTime*0.55 + seed), the stars twinkle on sin(uTime*1.7 + seed), the
     clouds drift on uTime*0.004, the flames flicker. That is why two captures
     of one region differed over 17% of their pixels and why a single prop could
     not be A/B'd: not the layout (build() is deterministic per region), the
     PHASE. Pinning t makes a capture reproducible. */
  ctx.clock.t = 120;
  ctx.clock.scale = 0;
  await new Promise(r => setTimeout(r, 120));
  ctx.clock.t = 120;
  await new Promise(r => setTimeout(r, 260));
  const u = ctx.stage.grade.uniforms;
  return { region, tier: ctx.stage.tier, tooth: u.uTooth.value, texel: [u.uTexel.value.x, u.uTexel.value.y] };
}
