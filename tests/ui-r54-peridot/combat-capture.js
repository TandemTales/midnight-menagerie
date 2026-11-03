async () => {
  const sc = window.MM.ctx.scenes.current, E = sc.engine;
  await sc._settle();
  const spare = E.piles.all().filter(c => sc.mePiles.pileOf(c) !== 'hand');
  for (const c of spare.slice(0, 4)) sc.mePiles.move(c, 'hand', { reason: 'shot' });
  await sc._settle();
  const boss = E.livingEnemies()[0];
  E.applyStatus(boss, 'strength', 3);
  E.applyStatus(boss, 'vulnerable', 2);
  E.applyStatus(boss, 'bristle', 4);
  E.applyStatus(E.player, 'weak', 2);
  E.applyStatus(E.player, 'dexterity', 2);
  E.applyStatus(E.player, 'regen', 3);
  const started = performance.now();
  while (performance.now() - started < 15000) {
    const labels = sc.fx.nums.filter(s => s.live && s.t / s.dur >= .16 && +s.el.style.opacity > .3);
    if (labels.length >= 6) {
      window.MM.ctx.clock.pause();
      return { hand: sc.mePiles.hand.length, boss: boss.id, labels: labels.map(s => s.el.textContent), capture: 'all six real status labels visible; clock paused for screenshot' };
    }
    await new Promise(requestAnimationFrame);
  }
  throw new Error('The six status floaters were never simultaneously visible');
}