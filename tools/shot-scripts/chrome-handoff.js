async () => {
  /* The hot-seat HANDOFF VEIL, raised over a live board, for the UI pass.
     One of the three pieces of the game the pass has never touched (with the
     coach and the achievement toast). The veil is `ui/handoff.js`'s passTo(),
     which a co-op run raises between two Kids' turns; it resolves only when
     the next player says they are ready, so it is started and NOT awaited.
     Whose turn it is comes from the game's own data: the second Kid in
     KIDS, with the Companion a co-op seat would bring. */
  const { KIDS } = await import('/game/src/data/schema.js');
  const kid = KIDS[1];
  const m = await import('/game/src/ui/handoff.js');
  m.passTo({
    name: kid.name,
    companion: 'wink',
    line: 'Your turn.',
    sub: `${kid.pet} is still out there somewhere.`,
  });
  for (let i = 0; i < 60 && !document.querySelector('.mm-handoff .hoff__go'); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  await new Promise(r => setTimeout(r, 900));   // the modal's open transition
  return { veil: !!document.querySelector('.mm-handoff'), kid: kid.slug };
}
