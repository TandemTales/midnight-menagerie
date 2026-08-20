/**
 * Fit a CardView into the box a scene laid out for it.
 * OWNER: shared by the scene modules in this directory.
 *
 * Every caller used to write `view.setTransform({ scale: w / 224 })`, and that
 * was right for exactly as long as a card was 224 px wide. `--card-w` in
 * tokens.css is now `clamp(150px, min(13.5vw, 27vh), 224px)`, so below a ~1660 px
 * viewport a card's natural width is *not* 224.
 *
 * A CardView renders at `--mm-card-w * scale` (its box is `--mm-card-w * CARD_SS`
 * wide and `_apply()` divides the scale by CARD_SS again), so `w / 224` makes the
 * card 77% of its slot at 1280x720 and 82% at 1366x768. The card itself just
 * looked small; what gave it away was `.deckslot__n` — the brass "x2" pill is
 * positioned against the *slot*, so it floated detached above and left of the
 * card it was counting.
 *
 * Measuring the laid-out element instead of hard-coding 224 keeps this correct
 * whatever tokens.css decides a card is next.
 */
import { CARD_SS } from '../ui/card.js';

/**
 * Scale `view` to fill `slot`, bottom-centre anchored (CardView's own origin).
 * Returns false when either box has no layout yet, so callers can skip and
 * re-run on the next resize.
 */
export function fitCardToSlot(view, slot) {
  const w = slot?.clientWidth || 0;
  const h = slot?.clientHeight || 0;
  if (!w || !h) return false;
  // Width the card draws at scale 1. Its CSS box is CARD_SS times that.
  const natural = (view?.el?.offsetWidth || 0) / CARD_SS;
  if (!natural) return false;
  try { view.setTransform({ x: w / 2, y: h, scale: w / natural }); } catch { return false; }
  return true;
}
