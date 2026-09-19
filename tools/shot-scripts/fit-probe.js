async () => {
  const ctx = window.MM.ctx;
  for (let i = 0; i < 160 && !(ctx.atmosphere && ctx.atmosphere.ready); i++) await new Promise(r => setTimeout(r, 250));
  const m = await import('/game/src/fx/showcase.js');
  if (!window.MM.showcase) m.mountShowcase(ctx, { hideDom: true });
  const q = location.hash;
  const region = (q.match(/region=([A-Za-z0-9_-]+)/) || [])[1] || 'foyer';
  ctx.stage.setTier('high', { persist: false });
  await new Promise(r => setTimeout(r, 700));
  window.MM.showcase.set(region, true);
  await new Promise(r => setTimeout(r, 900));
  const bd = ctx.atmosphere.backdrop;
  // `fixture`, not `shape >= 22`: shape 24 is the Greenhouse's planting bed.
  const fx = (bd.placed || []).filter(p => p.fixture).map(p => ({
    shape: p.shape, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
    w: +p.w.toFixed(2), h: +p.h.toFixed(2), tone: +p.tone.toFixed(2) }));
  const rig = ctx.atmosphere.rig;
  const out = { region, n: (bd.placed||[]).length, fixtures: fx,
    slots: rig.inten.map((v,i) => ({ i, int: +v.toFixed(2),
      pos: [+rig.worldPos[i].x.toFixed(1), +rig.worldPos[i].y.toFixed(1), +rig.worldPos[i].z.toFixed(1)] })),
    flames: bd.flameGeo.instanceCount };
  console.log('PROBE ' + JSON.stringify(out));
  return out;
}
