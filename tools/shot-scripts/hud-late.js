/* The run HUD late in an expedition, UI pass round 20's stress capture
   (docs/ui-pass/BRIEF-r20.md). Round 19 made the strip hold ONE row at
   1280x800 -- the Steam Deck -- with the run's opening state; its graft
   builder then found that it still wraps once a run carries nine or more
   Keepsakes plus Gear. Every judged screen before this showed the strip EMPTY
   ("No Keepsakes"), so the crowded strip was never judged. This fills it:
   ten Keepsakes and a full backpack of Gear, then asks the HUD to redraw.

     python tools/shot.py NAME --scene map --seed 7 --companion bones
       --kid maya --wait 3 --script @tools/shot-scripts/hud-late.js
       --steps "wait:1"

   Deterministic: the first ten findable Keepsakes and the first eight items,
   in data order, so every candidate and the baseline carry the same load. */
async () => {
  const ctx = window.MM.ctx, sc = ctx.scenes.current;
  /* A deep-linked board has NO live run: its HUD draws `MOCK` (ui/hud.js),
     which `hud.data` hands back. Fill whichever one the strip is drawing. */
  const hud = sc.hud;
  if (!hud) return { error: 'this scene has no HUD' };
  const d = hud.data;
  const { allRelics } = await import('/game/src/data/relics.js');
  const { allItems } = await import('/game/src/data/backpack.js');
  const have = new Set((d.keepsakes || []).map(k => k.id || k));
  const pick = allRelics().filter(r => !/boss|starter|special|event/.test(String(r.rarity)) && !have.has(r.id));
  if (typeof d.addKeepsake === 'function') for (const r of pick.slice(0, 10)) d.addKeepsake(r.id);
  else d.keepsakes = [...(d.keepsakes || []), ...pick.slice(0, 10)];
  d.backpack = Array.from(new Set([...(d.backpack || []), ...allItems().map(i => i.id)])).slice(0, 8);
  hud.refresh?.();
  await new Promise(r => setTimeout(r, 300));
  const el = document.querySelector('.mm-hud');
  return { live: !d._mock, keepsakes: (d.keepsakes || []).length, backpack: d.backpack.length,
           hudHeight: el ? Math.round(el.getBoundingClientRect().height) : null };
}
