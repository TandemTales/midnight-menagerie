/* The crowded boss board, UI pass round 3's COMBAT stress capture
   (docs/ui-pass/BRIEF-r3.md). foyer-boss with four more Tricks dealt into the
   hand, nine in all, and conditions stacked on the boss and on your side, so a
   full fan, stacked sockets and the boss's plate are judged together:

     python tools/shot.py NAME --scene combat --encounter foyer-boss --seed 7
       --companion bones --kid maya --wait 8
       --script @tools/shot-scripts/combat-crowd.js --steps "wait:2.5"

   The wait lets the condition floaters fade before the shot. */
() => {
  const sc = window.MM.ctx.scenes.current, E = sc.engine;
  const spare = E.piles.all().filter(c => sc.mePiles.pileOf(c) !== 'hand');
  for (const c of spare.slice(0, 4)) sc.mePiles.move(c, 'hand', { reason: 'shot' });
  const boss = E.livingEnemies()[0];
  E.applyStatus(boss, 'strength', 3);
  E.applyStatus(boss, 'vulnerable', 2);
  E.applyStatus(boss, 'bristle', 4);
  E.applyStatus(E.player, 'weak', 2);
  E.applyStatus(E.player, 'dexterity', 2);
  E.applyStatus(E.player, 'regen', 3);
  return { hand: sc.mePiles.hand.length, boss: boss.id };
}
