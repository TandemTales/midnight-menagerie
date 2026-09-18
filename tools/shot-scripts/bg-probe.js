async () => {
  const ctx = window.MM.ctx;
  for (let i = 0; i < 160 && !(ctx.atmosphere && ctx.atmosphere.ready); i++) {
    await new Promise(r => setTimeout(r, 250));
  }
  const m = await import('/game/src/fx/showcase.js');
  if (!window.MM.showcase) m.mountShowcase(ctx, { hideDom: true });
  const q = location.hash;
  const region = (q.match(/region=([A-Za-z0-9_-]+)/) || [])[1] || 'foyer';
  const tier = (q.match(/tier=([a-z]+)/) || [])[1];
  if (tier) { ctx.stage.setTier(tier, { persist: false }); await new Promise(r => setTimeout(r, 900)); }
  ctx.clock.scale = 1;
  window.MM.showcase.set(region, true);
  const bd = ctx.atmosphere.backdrop;
  if ((q.match(/props=([01])/) || [])[1] === '0') window.MM.showcase.showProps(false);
  if ((q.match(/actor=([01])/) || [])[1] !== '0') {} else if (window.MM.showcase.showActor) window.MM.showcase.showActor(false);
  if ((q.match(/flames=([01])/) || [])[1] === '0') bd.flames.visible = false;
  if ((q.match(/shafts=([01])/) || [])[1] === '0') bd.shafts.visible = false;
  if ((q.match(/motes=([01])/) || [])[1] === '0') {
    const pf = ctx.atmosphere.particles;
    if (pf && pf.points) pf.points.visible = false;
    else if (pf && pf.mesh) pf.mesh.visible = false;
    else if (pf && pf.group) pf.group.visible = false;
  }
  await new Promise(r => setTimeout(r, 1200));
  window.MM.showcase.steady();
  ctx.clock.t = 120; ctx.clock.scale = 0;
  await new Promise(r => setTimeout(r, 120));
  ctx.clock.t = 120;
  await new Promise(r => setTimeout(r, 260));
  const rig = ctx.atmosphere.rig;
  return { region, lights: rig.lights.map(l => ({ kind: l.kind, cine: l.cine, glow: l.glow,
    x: +l.pos.x.toFixed(2), y: +l.pos.y.toFixed(2), z: +l.pos.z.toFixed(2),
    r: +l.radius.toFixed(2), live: +l.live.toFixed(2) })),
    room: ctx.atmosphere.backdrop._room || null };
}
