/**
 * The Haunt ladder's rungs. OWNER: meta-run.
 *
 * `[level, name, description]`, in level order, index === level.
 *
 * This table used to exist TWICE, byte-identical, in `scenes/clubhouse.js` and
 * `scenes/select.js` — the two screens that draw the pips. They had not drifted
 * yet, which is the only reason this is a tidy-up rather than a bug report: two
 * copies of a table that names things at the player is a rename waiting to
 * happen on one screen and not the other.
 *
 * It lives in `data/` rather than beside `MAX_HAUNT` in `core/save.js` because
 * `core/` imports nothing from `data/` and that layering is worth more than the
 * convenience. `MAX_HAUNT` therefore stays a number in the save, and
 * `tests/haunt/` asserts the two agree — the drift is gated instead of being
 * made structurally impossible, which is the trade the layering buys.
 */
export const HAUNTS = [
  [0, 'Standard', 'The mansion as it is.'],
  [1, 'Stirred', 'Enemies hit harder and have more Courage.'],
  [2, 'Watchful', 'Curiosities turn dangerous.'],
  [3, 'Awake', 'Bosses gain an additional ability.'],
  [4, 'Hungry', 'Far more dangerous room combinations.'],
  [5, 'Possessive', 'The house actively works against you.'],
];

/** The name of a Haunt level, or the level number if it is off the table. */
export function hauntName(level) {
  const row = HAUNTS[level | 0];
  return row ? row[1] : String(level | 0);
}

export default { HAUNTS, hauntName };
