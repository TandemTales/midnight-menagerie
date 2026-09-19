async () => {
  /* An ACHIEVEMENT TOAST over a live board, for the UI pass. One of the three
     pieces of the game the pass has never touched (with the coach and the
     handoff veil). It is raised exactly the way the game raises it -- the
     achievements module emits `achievement:unlocked` and ui/achievement-
     toast.js listens -- with a real definition from core/achievements.js, so
     its name, tier and description are the ones a player will read. */
  const { ACHIEVEMENTS } = await import('/game/src/core/achievements.js');
  const def = ACHIEVEMENTS.find(a => a.id === 'first-win') || ACHIEVEMENTS[0];
  window.MM.ctx.bus.emit('achievement:unlocked', { def });
  for (let i = 0; i < 60 && !document.querySelector('.mm-ach > *'); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  await new Promise(r => setTimeout(r, 800));   // let it finish sliding in
  return { toast: !!document.querySelector('.mm-ach > *'), id: def.id };
}
