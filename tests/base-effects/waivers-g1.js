/* Base-effect waivers, group 1 (brambleboo, drizzle, crinkle, mossbit, the shared pool). OWNER: companion-cards.
   [id, 'why the gate's one seeded board cannot show it'] - each one is proved
   live by proofs-g1.html (python tests/base-effects/run.py g1). */
export default [
  /* Drizzle. Weather is seeded at Thunderstorm through the counter: nothing can
     Advance, nothing was ENTERED this turn, and the Forecast row is empty. */
  ['drizzle/just-a-sprinkle', 'Weather is seeded at Thunderstorm, so the Advance cannot change it'],
  ['drizzle/drip-drip-drip', 'Weather is seeded at Thunderstorm, so the Advance cannot change it'],
  ['drizzle/after-the-flash', 'Weather never changed this turn, so it cannot be played'],
  ['drizzle/hold-the-downpour', 'Weather is Thunderstorm, not Downpour, so it cannot be played'],
  ['drizzle/cloud-shelf', 'no Forecast is waiting to be returned'],
  ['drizzle/reforecast', 'no Forecast is waiting to be re-aimed'],
  ['drizzle/puddle-map', 'nothing is Soaked and no Conduct follows it'],
  ['drizzle/perfect-forecast', 'no Forecast Trick is in the draw pile'],
  ['drizzle/cloud-storage', 'no Forecast is waiting to be returned'],
  ['drizzle/set-the-whole-week', 'no Forecast Trick is in the draw pile'],

  // Mossbit
  ['mossbit/rewrite-the-headstone', 'no Epitaph is active, so it cannot be played'],

  /* Brambleboo. The Garden is empty (the counter is seeded, no Plant is in the
     ground), no enemy has Vines and there is no Weed anywhere. */
  ['brambleboo/careful-snip', 'the Garden is empty: nothing to Harvest or Uproot'],
  ['brambleboo/water-please', 'the Garden is empty: no immature Plant to water'],
  ['brambleboo/careful-pruning', 'the Garden is empty: nothing to Harvest or Uproot'],
  ['brambleboo/easy-cutting', 'the Garden is empty, so it cannot be played'],
  ['brambleboo/repot', 'the Garden is empty: no Plant to Repot'],
  ['brambleboo/take-a-cutting', 'the Garden is empty: no Mature Plant to Propagate'],
  ['brambleboo/compost-tea', 'the Garden is empty: no immature Plant to feed'],
  ['brambleboo/follow-the-draft', 'no enemy has Vines to move'],
  ['brambleboo/deadhead', 'the Garden is empty: no Mature Plant to Deadhead'],
  ['brambleboo/moonlit-conservatory', 'no Mature Moonflower, and nothing Harvests after it'],
  ['brambleboo/mulch-the-evidence', 'there is no Weed to remove'],
  ['brambleboo/keep-the-cutting', 'the Garden is empty: no Mature Plant to Harvest'],
  ['brambleboo/sweep-the-weeds', 'there is no Weed to remove'],
  ['brambleboo/graft', 'the Garden is empty: it needs two Plants'],
  ['brambleboo/tug-the-whole-room', 'no enemy has Vines to take'],
  ['brambleboo/midnight-bloom', 'the Garden is empty: no immature Plant to Mature'],
  ['brambleboo/tear-up-the-floorboards', 'the Garden is empty: nothing to Uproot'],
  ['brambleboo/perfect-cutting', 'the Garden is empty: no Mature Plant to Propagate'],
  ['brambleboo/prune-to-the-heart', 'the Garden is empty: no Mature Plant to Harvest'],
  ['brambleboo/invasive-species', 'the chosen enemy has no Vines to match'],
  ['brambleboo/four-seasons', 'the Garden is empty: no Mature Plant to Harvest'],
  ['brambleboo/borrowed-sunlight', 'the Garden is empty: no Plant to lend the sunlight to'],
  ['brambleboo/pass-the-cutting', 'the Garden is empty: no Mature Plant to take a cutting from (and no friend)'],

  // Crinkle. No Trick in the seeded hand carries a Crease or costs nothing.
  ['crinkle/reference-copy', 'no Trick in hand costs nothing'],
  ['crinkle/fold-along-the-fold', 'no Trick in hand is already Creased'],
  ['crinkle/watermark', 'no Paper Copy of the chosen Trick is played after it'],
  ['crinkle/straighten', 'no Trick in hand has a Crease to move'],
  ['crinkle/unfold', 'no Trick in hand has a Crease to take off'],
  ['crinkle/bind', 'no Trick in hand has a Crease to share'],
  ['crinkle/kept-flat', 'no Trick in hand is Overfolded'],

  // the shared pool
  ['neutral/second-wind', 'no Skill is in hand when it plays'],
];
