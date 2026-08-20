/**
 * Pluralisation.  SHARED — anyone may import this; nobody owns the text it fixes.
 *
 * The build was full of `${n} Keepsakes` and `Draw {n} Tricks`, which print
 * "1 Keepsakes" and "Draw 1 Tricks".  That reads like a debug print, and the
 * quality bar is a shipped game.  One helper, three entry points:
 *
 *   plural(1, 'Keepsake')            -> '1 Keepsake'
 *   plural(3, 'Keepsake')            -> '3 Keepsakes'
 *   plural(1, 'Big Scare')           -> '1 Big Scare'
 *   word(1, 'Clue')                  -> 'Clue'          (no number)
 *   fixNumberedNouns('Draw 1 Tricks')-> 'Draw 1 Trick'  (number already inlined)
 *
 * `fixNumberedNouns` exists for the card-text path: `ui/card.js` substitutes
 * `{n}` into an authored string *after* the noun was written, so the only place
 * that can know the count is the substitution site.  Run the finished line
 * through this and every `1 Tricks` in the game becomes `1 Trick` without
 * touching 46 authored strings across five content files.
 *
 * Mass nouns (Courage, Nerve, Guard, Lost Things) are never touched — they have
 * no singular form in this game's vocabulary and "1 Lost Thing" would be wrong.
 */

/** Nouns whose plural is not `+s`. Extend here, not at the call site. */
const IRREGULAR = new Map([
  ['is', 'are'],
]);

/**
 * Nouns `fixNumberedNouns` is allowed to singularise.  An allowlist, not a
 * regex over every word: "1 Lost Things" is correct English in this game and
 * "1 Bones" (the Companion) must never become "1 Bone" outside a Bone count.
 * Keyed by the PLURAL form, lowercased.
 */
const COUNTABLE = new Map([
  ['tricks', 'Trick'],
  ['keepsakes', 'Keepsake'],
  ['snacks', 'Snack'],
  ['clues', 'Clue'],
  ['bones', 'Bone'],
  ['times', 'time'],
  ['turns', 'turn'],
  ['rooms', 'room'],
  ['wings', 'wing'],
  ['cards', 'card'],
  ['enemies', 'enemy'],
  ['companions', 'Companion'],
  ['curiosities', 'Curiosity'],
  ['scuffles', 'Scuffle'],
  ['copies', 'copy'],
  ['stacks', 'stack'],
  ['slots', 'slot'],
  ['conditions', 'condition'],
  ['debuffs', 'debuff'],
  ['buffs', 'buff'],
]);

/**
 * Mass nouns.  `fixNumberedNouns` stops dead at one of these rather than
 * looking past it for a countable noun, so "Deal 1 damage to all enemies" never
 * becomes "…to all enemy".
 */
const MASS = new Set([
  'damage', 'courage', 'nerve', 'guard', 'luck', 'lost', 'things', 'block', 'energy',
]);

/** The plural of one word/phrase. `many` wins when the `+s` rule is wrong. */
export function pluralOf(one, many) {
  if (many) return many;
  const key = String(one).toLowerCase();
  if (IRREGULAR.has(key)) return IRREGULAR.get(key);
  if (/(s|x|z|ch|sh)$/i.test(one)) return `${one}es`;
  if (/[^aeiou]y$/i.test(one)) return `${one.slice(0, -1)}ies`;
  return `${one}s`;
}

/** Just the noun, correctly numbered. `word(1,'Clue') -> 'Clue'`. */
export function word(n, one, many) {
  return Math.abs(Number(n)) === 1 ? one : pluralOf(one, many);
}

/** The number and the noun. `plural(1,'Keepsake') -> '1 Keepsake'`. */
export function plural(n, one, many) {
  return `${n} ${word(n, one, many)}`;
}

/**
 * Repair a finished line whose numbers were substituted after the fact.
 *
 * Only ever singularises — it never invents a plural — and only for the nouns
 * in COUNTABLE, so authored prose cannot be mangled.  One adjective may sit
 * between the number and the noun ("Prevent the next 1 negative conditions"),
 * but a mass noun stops the search so "Deal 1 damage to all enemies" is left
 * exactly as written.
 */
export function fixNumberedNouns(text) {
  const single = (w) => {
    const one = COUNTABLE.get(w.toLowerCase());
    if (!one) return null;
    // Preserve the author's capitalisation of the first letter.
    return /^[A-Z]/.test(w) ? one[0].toUpperCase() + one.slice(1) : one;
  };
  return String(text).replace(
    /(\b1\s+)([A-Za-z][A-Za-z-]*)((\s+)([A-Za-z][A-Za-z-]*))?/g,
    (all, head, first, tail, gap, second) => {
      const a = single(first);
      if (a) return head + a + (tail || '');
      if (!second || MASS.has(first.toLowerCase())) return all;
      const b = single(second);
      return b ? head + first + gap + b : all;
    },
  );
}

export default plural;
