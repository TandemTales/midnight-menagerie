/**
 * Expedition Over — the two ends of a run.
 *
 *   #scene=gameover&result=defeat    the candle goes out
 *   #scene=gameover&result=victory   a Companion walks out of the house
 *
 * Both flavours are the same screen with a different emotional argument, laid
 * out as a memorial board in the kit's language (ui/kit.css) — the same staged
 * board the select screens are painted as:
 *
 *   top    — the headline in the wordmark's cartouche, the ribbon under it.
 *   centre — the beat, directly under the title: the Kid and the Companion in
 *            the Kid board's portrait frames side by side on one shelf, the
 *            candle between them (snuffed or burning). Gold-railed panels flank
 *            it: what you found and the pet you did not reach on one side, what
 *            you lost and how far the survey got on the other. This is the
 *            reason anyone remembers the run.
 *   below  — the ledger, one panel the width of the board with the moon on its
 *            rail: HOW FAR in lavender display type, flanked by the wing it
 *            reached and the seed on matching cartouches, every number on one
 *            engraved strip, and the
 *            Trick the run leaned on standing on a gilt plinth beside the
 *            Tricks and the Keepsakes. Everything a player wants to screenshot.
 *
 * Reads `ctx.run` when meta-run has built one; otherwise fabricates a fully
 * plausible, *deterministic* summary from the seed so the deep link is
 * reviewable standing on its own. Nothing here is a placeholder — the mock is
 * generated from the same real card data the run would have used.
 *
 * OWNER: frontend agent.
 */
import { Scene } from '../core/scenes.js';
import { bus } from '../core/bus.js';
import { Save } from '../core/save.js';
import { RNG, hashSeed } from '../core/rng.js';
import { COMPANIONS, KIDS, TERMS, REGION_ORDER, NodeType } from '../data/schema.js';
import { regionMeta, blueprintPlan, MASTER } from '../state/mapgen.js';
import {
  ensureCss, fontsReady, companionPortrait, kidPortrait, petPortrait,
  el, rovingFocus, setReduceMotion, reduceMotion, formatSeed,
  REGION_NAMES, COMPANION_BY_SLUG, KID_BY_SLUG,
} from '../ui/portrait.js';
import { kitDressMarkup } from '../ui/kitboard.js';
import { nodeSymbol } from '../ui/mapnode.js';
import { paintBackdrop } from '../ui/backdrop.js';
import { pauseStageFor } from './_stage.js';
import { fitCardToSlot } from './_cardfit.js';
import { plural, word } from '../util/plural.js';

const CSS_KIT  = new URL('../ui/portrait.css', import.meta.url).href;
const CSS_OVER = new URL('./gameover.css', import.meta.url).href;
const CSS_CARD = new URL('../ui/card.css', import.meta.url).href;

/* The seven-entry FALLBACK_KEEPSAKES table that used to sit here is GONE.
 *
 * Its own comment said it was "used only when data/relics.js has not shipped
 * yet".  relics.js shipped.  Five of its seven ids — half-a-torch, collar-tag,
 * bent-house-key, mothbitten-ribbon, jar-of-nothing — never existed in the
 * game at all, and the two that did were printed with invented rules: the
 * shelf told you Chewed Tennis Ball starts you with a Nerve (it adds 8 damage
 * to your first Attack) and that Spare Batteries recharge Gear (they draw you
 * a Trick).  Worse, it was sampled for REAL runs too — see
 * `_hydrateKeepsakes`.  The mock now comes off the real table, which is what
 * this file's header claims for everything else on the screen. */

/** How a run ends when the engine has not told us. Flavour only. */
const KILLERS = {
  'foyer': 'the Butler',
  'nursery': 'the Governess',
  'sleeping-quarters': 'the Bedframe Beast',
  'kitchens-cellars': 'the Confectioner',
  'greenhouse': 'the Carnivorous Conservatory',
  'graveyard': 'the Groundskeeper of Names',
  'study-library': 'the Archivist',
  'attic-observatory': 'the Watcher in the Rafters',
  'lampworks': 'the Lamplighter',
  'ballroom': 'the Master of Revels',
  'crypt': 'the Bone Curator',
  'hedge-maze': 'the Gardener of Rot',
  'secret-passages': 'the Whisper Warden',
  'bathhouse': 'the Drowned Matron',
  'kennels': 'the Kennelmaster',
  'pumpkin-grounds': 'the Harvest King',
  'heart': 'the Heart of the House',
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = (t) => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);

/**
 * Normalise one deck entry to `{def, upgraded}`.
 *
 * Three shapes reach this screen and only one of them is a CardDef: `ctx.run`
 * holds instances (`{uid, id, upgraded}`), `Run.snapshot()` holds `{def, upgraded}`,
 * and the standalone mock builds real defs straight out of `data/cards.js`.
 * Anything whose id does not resolve is dropped — a run summary that prints an
 * internal id has already failed.
 */
function resolveCard(entry, cardById) {
  if (!entry) return null;
  if (entry.def) return { def: entry.def, upgraded: !!entry.upgraded };
  if (entry.name && entry.type) return { def: entry, upgraded: !!entry.upgraded };
  const def = entry.id ? cardById(entry.id) : null;
  return def ? { def, upgraded: !!entry.upgraded } : null;
}

/** The glyphs in the round enamel buttons: flat antique gold with an ink
 *  outline, as the arrow and tick on the Kid board are. Decorative. */
const GO_GLYPH = {
  home: `<svg viewBox="0 0 24 24"><path d="M12 3.2 2.6 11h2.9v9.6h5.1v-6h2.8v6h5.1V11h2.9z"/></svg>`,
  // the title: the crescent from the Kid board's mirror
  title: `<svg viewBox="0 0 24 24"><path d="M15.6 2.8a9.4 9.4 0 1 0 5.6 15.9A8 8 0 0 1 15.6 2.8z"/></svg>`,
  // straight back in: an arrow turning back on itself, towards the house
  again: `<svg viewBox="0 0 24 24"><path d="M12.4 4.2a7.8 7.8 0 1 1-7.4 10.4l2.7-1a4.9 4.9 0 1 0 4.7-6.5V10L6.8 5.7 12.4 1.4z"/></svg>`,
};

/** The engraved marks on the stat ribbon (round 5, CEDAR's idea): the map
 *  key's own room glyphs for the rooms, and these four drawn in the same ink
 *  on the same 48-unit grid (ui/mapnode.js), each set in a round enamel
 *  medallion as the map's key sets them. Decorative: the label says it. */
const STAT_GLYPH = {
  card: `<svg viewBox="0 0 48 48" aria-hidden="true"><path class="s w1" d="M18 6h16a3 3 0 0 1 3 3v24"/><path class="s w2" d="M12 11h17a3 3 0 0 1 3 3v25a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V14a3 3 0 0 1 3-3Z"/><path class="s w1" d="M15 21h11M15 27h8"/></svg>`,
  strike: `<svg viewBox="0 0 48 48" aria-hidden="true"><path class="s w2 j" d="M28 4 11 27h12l-5 17 19-25H25Z"/></svg>`,
  button: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="s w2" cx="24" cy="24" r="17"/><circle class="s w1" cx="24" cy="24" r="11"/><circle class="f" cx="20" cy="20" r="2.4"/><circle class="f" cx="28" cy="20" r="2.4"/><circle class="f" cx="20" cy="28" r="2.4"/><circle class="f" cx="28" cy="28" r="2.4"/></svg>`,
  glass: `<svg viewBox="0 0 48 48" aria-hidden="true"><path class="s w2" d="M11 6h26M11 42h26"/><path class="s w2" d="M15 6c0 11 16 12 16 18S15 31 15 42M33 6c0 11-16 12-16 18s16 7 16 18"/><path class="f" d="M18 39c3-5 9-5 12 0Z"/></svg>`,
};

export class GameOverScene extends Scene {
  constructor(ctx) {
    super(ctx);
    this._offs = [];
    this._portraits = [];
    this._cards = [];
    this._timers = [];
  }

  /* ═══ enter ══════════════════════════════════════════════════════════════ */
  async enter(params = {}) {
    const { ctx } = this;
    await Promise.all([ensureCss(CSS_KIT), ensureCss(CSS_OVER)]);

    const settings = Save?.settings ?? {};
    setReduceMotion(!!settings.reduceMotion);
    document.documentElement.classList.toggle('mm-large-text', !!settings.largeText);

    const s = this.summary = this._summarise(params);
    this.won = s.result === 'victory';

    // The canvas measures 0.00% visible behind this screen — stop drawing it.
    // The mood and the dread grade are still set: they publish the CSS colour
    // custom properties this screen reads, and combat inherits neither.
    this._unpauseStage = pauseStageFor(ctx);

    try { ctx.atmosphere?.setMood?.(this.won ? 'clubhouse' : 'crypt'); } catch {}
    try { ctx.atmosphere?.dread?.(this.won ? 0 : 0.85, 1.2); } catch {}
    try { ctx.audio?.stinger?.(this.won ? 'sting:victory' : 'sting:defeat'); } catch {}

    const root = this.root;
    root.innerHTML = '';
    root.dataset.result = s.result;

    // The board: its painted ground (and the slot Josh's `gameover.png` drops
    // into), the dust, the dark closing in, and the select boards' candles,
    // cobwebs, vines and rule at its edges.
    const board = el('div', 'go-board kit-board');
    board.appendChild(el('div', 'go-ground kit-ground'));
    board.appendChild(this._buildMotes());
    board.appendChild(el('div', 'go-vignette'));
    board.insertAdjacentHTML('beforeend', kitDressMarkup());
    board.appendChild(this._buildHead());

    const wrap = el('div', 'go-wrap');
    wrap.appendChild(this._buildBeat());
    wrap.appendChild(this._buildLedger());
    board.appendChild(wrap);

    board.appendChild(this._buildFoot());
    root.appendChild(board);
    this._board = board;
    paintBackdrop(board, 'gameover', () => !this._dead);

    this._wire();
    await fontsReady();

    // real card data is optional; upgrade the ledger the moment it resolves
    this._hydrateCards();

    root.classList.add('is-live');
    if (!reduceMotion()) {
      root.classList.add('is-entering');
      this._timers.push(setTimeout(() => root.classList.remove('is-entering'), 3200));
      // the candle burns just long enough to be noticed, then dies
      if (!this.won) this._timers.push(setTimeout(() => this._snuff(), 1350));
    } else if (!this.won) {
      this._snuff();
    }

    bus.emit('gameover:ready', { result: s.result, seed: s.seed });
  }


  /* ═══ the summary ════════════════════════════════════════════════════════
     Everything downstream reads this one normalised object, so a real run and
     the standalone mock render through exactly the same code path.
     ═══════════════════════════════════════════════════════════════════════ */
  _summarise(params) {
    const run = this.ctx.run || null;
    const hash = (k, d) => params[k] ?? d;

    const result = String(hash('result', run?.result ?? (run?.won ? 'victory' : 'defeat')))
      .toLowerCase() === 'victory' ? 'victory' : 'defeat';

    const seedRaw = Number(hash('seed', run?.seed)) || hashSeed(`mm-${result}-fallback`);
    const rng = new RNG(seedRaw);

    const companion = String(hash('companion', run?.companion) || 'marmalade');
    const kid = String(hash('kid', run?.kid) || 'maya');
    const regionId = regionMeta(hash('region', run?.region ?? run?.regionId) || (run ? 'foyer' : 'nursery')).slug;
    const meta = regionMeta(regionId);

    const mocked = !run;
    /* Two numbers, not one. The run layer split the old ambiguous "floor":
       `depth` is how many rooms deep the expedition got (the number the
       Clubhouse records as its best), and `wing` is the position on tonight's
       ROUTE that the map prints as "Wing N of M". The `floor` param carries
       `depth` now, so this
       screen prints it as ROOMS DEEP and prints `wing` as the wing — labelling
       either with the other's word is how the Clubhouse ended up boasting
       "Deepest floor 5" about a run Game Over called "Floor 1". */
    const floor = Number(hash('floor', run?.depth)) || (mocked ? meta.index * 4 + rng.int(4) : meta.index);
    const wing  = Number(hash('wing', run?.wing)) || meta.index;

    // Real values when the run exists; deterministic, plausible ones when not.
    const scuffles   = Number(run?.stats?.scuffles   ?? run?.scufflesWon) || (mocked ? 6 + rng.int(9) : 0);
    const bigScares  = Number(run?.stats?.bigScares  ?? run?.elitesBeaten) || (mocked ? rng.int(3) : 0);
    const curiosity  = Number(run?.stats?.curiosities) || (mocked ? 1 + rng.int(4) : 0);
    const safeRooms  = Number(run?.stats?.safeRooms) || (mocked ? 1 + rng.int(3) : 0);
    const cardsPlay  = Number(run?.stats?.cardsPlayed) || (mocked ? 90 + rng.int(180) : 0);
    const damage     = Number(run?.stats?.damageDealt) || (mocked ? 700 + rng.int(1600) : 0);
    const gold       = Number(run?.gold ?? run?.lostThings) || (mocked ? 40 + rng.int(220) : 0);
    const maxHp      = Number(run?.maxHp) || 80;
    const hp         = result === 'victory' ? Math.max(1, Number(run?.hp ?? (mocked ? 8 + rng.int(40) : 1))) : 0;
    const turns      = Number(run?.stats?.turns) || (mocked ? 40 + rng.int(90) : 0);

    /* TWO NUMBERS, and this used to be one — `run.wingsMapped ?? revealed.length`,
       reading a field no version of `state/run.js` has ever written, falling
       through to a lifetime count that nothing ever added to. It printed ONE in
       both places it appears, on every save, forever.
         wingsThisRun  how far tonight got. Belongs in "What you found".
         wingsMapped   the blueprint the kids keep, across every expedition.
                       Belongs on the band, which counts against all 17.
       `state/run.js#markWingMapped` is what fills the second one in now. */
    const wingsThisRun = Number(run?.regionIndex >= 0 ? run.regionIndex + 1 : (mocked ? wing : 1)) || 1;
    const wingsMapped = Number(Save?.data?.blueprint?.revealed?.length) || 1;
    // `run.companionsFreed` is what you freed on THIS expedition (run.rescued is the
    // lifetime set). The old fallback quietly printed "1 Companion freed" naming the one you
    // brought in, so a two-wing victory that freed two undercounted to one.
    const freedThisRun = Array.isArray(run?.companionsFreed) ? run.companionsFreed.slice()
      : (mocked && result === 'victory' ? [companion] : []);
    const cluesFound = Number(run?.stats?.clues) || (mocked ? rng.int(3) : 0);
    const petHome = !!(run?.petRescued ?? (result === 'victory' && rng.chance(0.35)));

    return {
      result, seed: seedRaw, rng, mocked,
      companion, kid, regionId, meta, floor, wing,
      scuffles, bigScares, curiosity, safeRooms, cardsPlay, damage, gold,
      hp, maxHp, turns, wingsMapped, wingsThisRun, freedThisRun, cluesFound, petHome,
      haunt: Number(run?.hauntLevel ?? Save?.data?.hauntLevel ?? 0) || 0,
      killedBy: run?.killedBy || KILLERS[regionId] || 'the house',
      deck: Array.isArray(run?.deck) ? run.deck : null,          // filled by _hydrateCards
      /* `&& run.relics.length` used to be here, and it is why a real run that
         ended carrying no Keepsakes had six invented for it: an empty shelf
         collapsed to `null`, which downstream could not tell apart from "there
         is no run at all". An empty array is an ANSWER — it says the pockets
         were empty — so it is passed through as one, exactly as `deck` is. */
      relics: Array.isArray(run?.relics) ? run.relics : null,
    };
  }

  /* ═══ backdrop ═══════════════════════════════════════════════════════════ */
  _buildMotes() {
    // Composited CSS only — no JS runs per frame on this screen.
    const motes = el('div', 'go-motes');
    let s = 11;
    const r = () => (s = (s * 48271) % 2147483647) / 2147483647;
    for (let i = 0; i < 26; i++) {
      const m = el('i');
      m.style.cssText =
        `left:${(r() * 100).toFixed(2)}%;--sz:${(1 + r() * 2.4).toFixed(2)}px;` +
        `--dur:${(15 + r() * 22).toFixed(1)}s;--del:-${(r() * 34).toFixed(1)}s;` +
        `--dx:${(r() * 80 - 40).toFixed(0)}px;--op:${(0.14 + r() * 0.5).toFixed(2)};` +
        `--y0:${(55 + r() * 45).toFixed(0)}vh`;
      motes.appendChild(m);
    }
    return motes;
  }

  /** The people in it: who went in, with whom, and how to say their name. */
  _cast() {
    const s = this.summary;
    const c = COMPANION_BY_SLUG[s.companion] ?? COMPANIONS[0];
    const k = KID_BY_SLUG[s.kid] ?? KIDS[0];
    const first = k.name.split(' ')[0];
    // Pronouns come from the Kid record (schema.js KIDS[].pronouns) — never inferred from a
    // name. This line used to hardcode "She" and printed it for every Kid.
    const pr = k.pronouns || { s: 'they', o: 'them', p: 'their', r: 'themselves', plural: true };
    const region = REGION_NAMES[s.regionId] ?? s.meta.name;
    return { c, k, first, pr, region };
  }

  /* ═══ top: the headline, in the cartouche ════════════════════════════════ */
  _buildHead() {
    const s = this.summary;
    const { c, first, region } = this._cast();

    /**
     * THE HEART IS THE ENDING, and this screen used to print the same headline
     * for it as for any other cleared wing.
     *
     * "You got one out" is the right thing to say about a Companion freed from
     * the Foyer. It is the wrong thing to say about the Keeper, because §57 of
     * the Heart chapter is explicit that the important event is not that a
     * monster died: "The house has been forced to allow a choice it was
     * designed to prevent." The Keeper does not die. It comes apart into doors,
     * blankets, keys and soft blue light, and the last exit unlocks.
     */
    const endedTheHouse = this.won && s.regionId === 'heart';
    const [kicker, title, lede] = endedTheHouse
      ? ['The Heart of the House',
         'The door opens outward.',
         `The Keeper does not fall over. It comes apart &mdash; doors, blankets,
            brass keys, picture frames, and a lot of soft blue light going out slowly.
            ${esc(first)} and ${esc(c.name)} walk through a door the house spent a very long time
            making sure nobody could open, and the house lets them.`]
      : this.won
      ? [`Wing ${s.wing} &middot; ${esc(region)}`,
         'You got one out.',
         `${esc(c.name)} walked through the front door on ${esc(first)}&rsquo;s shoulder
            and did not look back at the house once.`]
      : [`Wing ${s.wing} &middot; ${esc(region)}`,
         'The candle goes out.',
         `${esc(first)} gets out. ${esc(s.killedBy.replace(/^the /, 'The '))} keeps the room,
            and everything still in the backpack stays where it fell.`];

    const head = el('header', 'go-head kit-titleblock kit-titleblock--compact');
    // The Heart's lede is three sentences; it gets the full-height plaque and
    // is allowed to wrap inside it.
    if (endedTheHouse) head.classList.add('is-long');
    head.innerHTML = `
      <span class="go-ribbon kit-ribbon">${this.won ? 'Out of the house' : 'Expedition over'}</span>
      <h1 class="go-title kit-cartouche__title">${title}</h1>
      <p class="go-lede kit-cartouche__sub">${lede}</p>
      <p class="go-kicker kit-titleblock__note">${kicker}</p>`;
    return head;
  }

  /* ═══ left: the beat ═════════════════════════════════════════════════════ */
  _buildBeat() {
    const s = this.summary;
    const { c, k, first, pr } = this._cast();

    const beat = el('section', 'go-beat');
    beat.setAttribute('aria-label', this.won ? 'Expedition succeeded' : 'Expedition failed');

    /* --- the memorial: the two of them framed, the candle between -------- */
    const stage = el('div', 'go-stage');

    const kid = el('figure', 'go-portrait go-portrait--kid');
    const kidPic = el('div', 'go-portrait__pic kit-frame kit-frame--over');
    const kidArt = el('div', 'go-portrait__art');
    kidArt.appendChild(kidPortrait({ ...k, petKind: k.petKind }, { w: 360, h: 480 }));
    kidPic.appendChild(kidArt);
    kid.appendChild(kidPic);
    kid.appendChild(el('figcaption', 'go-portrait__plate go-who__txt kit-plate',
      `<b class="kit-plate__name">${esc(k.name)}</b>`
      + `<span class="kit-plate__epithet">with ${esc(c.name)} &middot; ${TERMS.ascension} ${s.haunt}</span>`));
    stage.appendChild(kid);

    // The candle: the board's own painted one. It burns just long enough to be
    // noticed and then goes out (`_snuff`); the smoke starts at its wick.
    const flame = el('div', 'go-candle');
    flame.innerHTML = `
      <span class="go-halo" aria-hidden="true"></span>
      <i class="go-candle__prop kit-prop kit-prop--candle" aria-hidden="true"></i>
      <svg class="go-smoke" viewBox="0 0 60 220" aria-hidden="true">
        <path d="M30 214c-15-22 13-34 0-58s16-30 2-54 12-26-4-48" pathLength="100"/>
        <path d="M30 212c13-20-11-30 2-52s-12-28 3-50" pathLength="100"/>
      </svg>`;
    stage.appendChild(flame);

    // the Companion: lit and shimmering on a win, tired and cold on a loss
    const plate = el('figure', 'go-portrait go-portrait--pet go-plate' + (this.won ? '' : ' is-spent'));
    const pic = el('div', 'go-portrait__pic kit-frame kit-frame--over');
    const pf = companionPortrait({
      slug: c.slug, variant: '-card', locked: false, parallax: 0.6, shimmer: this.won,
    });
    this._portraits.push(pf);
    const art = el('div', 'go-portrait__art');
    art.appendChild(pf.el);
    pic.appendChild(art);
    plate.appendChild(pic);
    plate.appendChild(el('figcaption', 'go-plate__cap go-portrait__plate kit-plate',
      this.won
        ? `<b class="kit-plate__name">${esc(c.name)}</b><span class="kit-plate__epithet">${esc(c.title)} &mdash; out</span>`
        : `<b class="kit-plate__name">${esc(c.name)}</b><span class="kit-plate__epithet">went back in with you</span>`));
    stage.appendChild(plate);
    beat.appendChild(stage);

    /* --- three stanzas, on ONE gold-railed panel with the star on its rail:
           what you found, what you lost and how far the survey got, and the
           pet you did not reach, parted by engraved rules with air between
           them (round 4: three small boxes of tight bullets read as a form) */
    const stanzas = el('div', 'go-stanzas kit-panel');
    stanzas.dataset.medal = 'star';

    const found = [];
    if (s.freedThisRun.length) {
      found.push(`${plural(s.freedThisRun.length, 'Companion')} freed &mdash; ` +
        s.freedThisRun.map((sl) => esc(COMPANION_BY_SLUG[sl]?.name ?? sl)).join(', '));
    }
    found.push(`${plural(s.wingsThisRun, 'wing')} of the house crossed`);
    if (s.cluesFound) found.push(`${plural(s.cluesFound, 'clue')} for the board`);
    if (s.bigScares) found.push(`${plural(s.bigScares, 'Big Scare')} survived`);
    stanzas.appendChild(this._stanza('found', 'What you found', found, 'star'));

    const lost = this.won
      ? [
          `${TERMS.gold} spent and ${TERMS.potion}s eaten &mdash; worth it`,
          `Gear used up on the way in`,
          `The route stays drawn. The house cannot un-draw it.`,
        ]
      : [
          `Every ${TERMS.card} you had built up &mdash; <b class="go-num" data-deck-count>&hellip;</b>`,
          // The count arrives later (`_hydrateKeepsakes`), so the noun has to be
          // patched with it — printed flat this read "1 Keepsakes".
          `<b class="go-num" data-relic-count>&hellip;</b> <span data-relic-noun>${TERMS.relic}s</span>, left on the floor`,
          `<b class="go-num">${s.gold}</b> ${TERMS.gold}, scattered behind you`,
          `Every ${TERMS.potion} and every piece of Gear`,
        ];
    const lostPanel = this._stanza('lost', this.won ? 'What it cost' : 'What you lost', lost, 'shield');
    // ...and how far the survey got before it did: the blueprint band is drawn
    // along the foot of this panel.
    lostPanel.appendChild(this._buildBlueprint());
    stanzas.appendChild(lostPanel);

    const petLine = s.petHome
      ? `<b>${esc(k.pet)}</b> came home. ${esc(first)} has not put ${esc(k.pet)} down since.`
      : this.won
        ? `<b>${esc(k.pet)}</b> is still in there. But ${esc(c.name)} knows which door,
           and ${esc(first)} is already re-packing the backpack.`
        : `<b>${esc(k.pet)}</b> is still in there. ${esc(first)} does not say anything on the walk back.
           ${esc(cap(pr.s))} ${pr.plural ? 'are' : 'is'} working out what to bring next time.`;
    const pet = el('div', `go-stanza go-stanza--pet${s.petHome ? ' is-home' : ''}`);
    pet.innerHTML =
      `<h2 class="go-sh kit-heading">${s.petHome ? 'The pet you reached' : 'The pet you did not reach'}</h2>` +
      `<div class="go-pet">
         <span class="go-pet__snap kit-frame kit-frame--over"></span>
         <p class="go-pet__text">${petLine}</p>
       </div>`;
    /* The brass collar tag with a species glyph on it was a symbol standing in
       for a picture. On the one beat in the whole game that is about this
       animal specifically, the photograph goes here instead — hung in the same
       gold frame as the two who went in. */
    pet.querySelector('.go-pet__snap').appendChild(petPortrait(k.slug));
    stanzas.appendChild(pet);

    beat.appendChild(stanzas);
    // The blueprint band is how far "8 rooms deep" is: it is drawn under that
    // number in the ledger (_buildLedger), not in this column.
    return beat;
  }

  /**
   * The blueprint band. On a win a wing fills in and the count ticks up; on a
   * loss the same drawing shows exactly how far the kids actually got.
   * The crop rectangle comes from mapgen so this band and the map screen are
   * always looking at the same piece of paper.
   */
  _buildBlueprint() {
    const s = this.summary;
    const band = el('div', 'go-bp');
    let plan;
    try { plan = blueprintPlan(s.regionId, 3.0); } catch { plan = null; }

    const label = this.won
      ? `The blueprint fills in &mdash; ${esc(REGION_NAMES[s.regionId] ?? s.meta.name)}`
      : `As far as we got &mdash; ${esc(REGION_NAMES[s.regionId] ?? s.meta.name)}`;

    band.innerHTML = `
      <div class="go-bp__frame kit-frame kit-frame--over">
        <div class="go-bp__paper">
          ${plan ? `<img class="go-bp__img" src="${esc(new URL('../../' + plan.url, import.meta.url).href)}"
               alt="" decoding="async" width="${MASTER.w}" height="${MASTER.h}"
               style="width:${(MASTER.w / plan.sw * 100).toFixed(3)}%;
                      transform:translate(${(-plan.sx / MASTER.w * 100).toFixed(3)}%,
                                          ${(-plan.sy / MASTER.h * 100).toFixed(3)}%)">` : ''}
          <span class="go-bp__wash"></span>
          <span class="go-bp__mark" aria-hidden="true"></span>
        </div>
      </div>
      <div class="go-bp__meta">
        <span class="go-bp__label">${label}</span>
        <span class="go-bp__count"><b>${s.wingsMapped}</b> / ${REGION_ORDER.length} wings drawn</span>
      </div>`;
    return band;
  }

  _stanza(kind, title, lines, medal) {
    // a section of the one panel (_buildBeat), which wears the medallion on its
    // rail; `medal` is kept for callers, and names nothing a section draws now
    void medal;
    const n = el('div', `go-stanza go-stanza--${kind}`);
    n.innerHTML = `<h2 class="go-sh kit-heading">${esc(title)}</h2><ul>${
      lines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
    return n;
  }

  /* ═══ right: the ledger, and the middle of the board ═════════════════════
     Round 5 (CEDAR's triptych): the record is no longer a pile of plaques down
     the middle. The ledger panel on the right carries what you finished WITH
     — the Courage left on the fights' gauge and the seed that runs this house
     again in its head, then the final Tricks and the Keepsakes. The middle of
     the board, under the two who went in, is ONE focal point: a carved shelf
     with the Trick that worked hardest centred on its pedestal under its
     ribbon, a framed HOW FAR plaque with its large numeral to the left of it
     and the line that says why on a framed plate to the right. Under it all
     the numbers, on one gilt-rimmed plate, each with its engraved mark. */
  _buildLedger() {
    const s = this.summary;
    const { region } = this._cast();
    const out = document.createDocumentFragment();

    const led = el('section', 'go-ledger kit-panel');
    led.dataset.medal = 'moon';
    led.setAttribute('aria-label', 'Expedition record');

    /* --- its head: Courage on the fights' gauge, the seed on its brass plate */
    const hpK = Math.max(0, Math.min(1, s.hp / s.maxHp));
    const head = el('div', 'go-ledhead', `
      <div class="go-courage">
        <span class="go-lbl">${TERMS.hp}</span>
        <div class="go-courage__track kit-tube kit-tube--warm"><i class="kit-tube__fill" style="transform:scaleX(${hpK.toFixed(3)})"></i></div>
        <span class="go-courage__n">${s.hp} / ${s.maxHp}</span>
        <em class="go-courage__note">${this.won ? 'walked out with it' : 'the candle ran out'}</em>
      </div>
      <div class="go-seed">
        <span class="go-lbl">Seed</span>
        <span class="go-seed__row"><code class="go-seed__val">${formatSeed(s.seed)}</code>
        <button type="button" class="go-seed__copy kit-plate">Copy</button></span>
        <span class="go-seed__hint">Run this house again, exactly as it was.</span>
      </div>`);
    led.appendChild(head);

    /* --- the numbers, on one gilt-rimmed plate, each with its engraved mark */
    const grid = el('div', 'go-stats kit-stats kit-stats--plate');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'The numbers');
    const G = STAT_GLYPH;
    const stat = (label, value, glyph) =>
      `<div class="go-stat"><span class="go-stat__ico" aria-hidden="true">${glyph}</span>`
      + `<span class="go-lbl kit-stats__label">${esc(label)}</span>`
      + `<b class="kit-stats__value">${esc(value)}</b></div>`;
    grid.innerHTML =
      stat(`${TERMS.combat}s won`, s.scuffles, nodeSymbol(NodeType.SCUFFLE, 20)) +
      stat(`${TERMS.elite}s`, s.bigScares, nodeSymbol(NodeType.BIG_SCARE, 20)) +
      stat('Curiosities', s.curiosity, nodeSymbol(NodeType.CURIOSITY, 20)) +
      stat(`${TERMS.rest}s`, s.safeRooms, nodeSymbol(NodeType.SAFE, 20)) +
      stat(`${TERMS.card}s played`, s.cardsPlay, G.card) +
      stat('Damage dealt', s.damage, G.strike) +
      stat(TERMS.gold, s.gold, G.button) +
      stat('Turns taken', s.turns, G.glass);

    /* --- final deck ------------------------------------------------------- */
    const deck = el('div', 'go-block go-block--deck');
    deck.innerHTML =
      `<h2 class="go-h kit-heading kit-heading--inline">Final ${TERMS.deck} <em class="go-h__n" data-deck-total></em></h2>` +
      `<div class="go-tricks" role="list"></div>`;
    led.appendChild(deck);
    this._deckHost = deck.querySelector('.go-tricks');
    this._deckTotal = deck.querySelector('[data-deck-total]');

    /* --- keepsakes: what came out with you ------------------------------- */
    const keep = el('div', 'go-block go-block--keep');
    keep.innerHTML =
      `<h2 class="go-h kit-heading kit-heading--inline">${TERMS.relic}s <em class="go-h__n" data-keep-total></em></h2>` +
      `<div class="go-keeps" role="list"></div>`;
    led.appendChild(keep);
    this._keepHost = keep.querySelector('.go-keeps');
    this._keepTotal = keep.querySelector('[data-keep-total]');

    /* --- the triptych, on one carved shelf -------------------------------- */
    const altar = el('div', 'go-altar');
    const reach = el('div', 'go-reach go-tri', `
      <span class="go-tri__h">How far</span>
      <b class="go-reach__n">${s.floor}</b>
      <span class="go-reach__unit">${word(s.floor, 'room')} deep</span>
      <i class="go-tri__rule" aria-hidden="true"></i>
      <span class="go-reach__where">${esc(region)}</span>
      <span class="go-reach__wing">Wing ${s.wing}</span>`);
    reach.setAttribute('role', 'group');
    reach.setAttribute('aria-label', `${plural(s.floor, 'room')} deep, in ${region}, wing ${s.wing}`);
    altar.appendChild(reach);

    const mvp = el('div', 'go-block go-block--mvp');
    // A museum piece: the card in its frame on its gilt pedestal, its label on
    // the ribbon over it; what the run made of it is the plate to its right.
    mvp.innerHTML = `<h2 class="go-h go-mvp__h kit-heading kit-heading--ribbon kit-heading--inline">Worked hardest <em class="go-h__n" data-mvp-n></em></h2>
      <div class="go-mvp"><div class="go-mvp__slot kit-cards"></div></div>`;
    this._mvpSlot = mvp.querySelector('.go-mvp__slot');
    this._mvpN = mvp.querySelector('[data-mvp-n]');
    this._mvpBlock = mvp;
    mvp.hidden = true;
    altar.appendChild(mvp);

    const said = el('div', 'go-said go-tri', `<i class="go-said__mark" aria-hidden="true"></i><p class="go-mvp__note"></p><i class="go-tri__rule" aria-hidden="true"></i>`);
    said.hidden = true;
    this._mvpNote = said.querySelector('.go-mvp__note');
    this._mvpSaid = said;
    altar.appendChild(said);

    const shelf = el('i', 'go-altar__shelf kit-ledge');
    shelf.setAttribute('aria-hidden', 'true');
    altar.appendChild(shelf);

    out.appendChild(led);
    out.appendChild(altar);
    out.appendChild(grid);
    return out;
  }

  /* ═══ real card + relic data ═════════════════════════════════════════════
     Both modules belong to other agents and may not exist yet, so every hop is
     guarded and the screen is already complete before any of it resolves.
     ═══════════════════════════════════════════════════════════════════════ */
  async _hydrateCards() {
    const s = this.summary;
    let cards = null;

    // `run.deck` is a list of INSTANCES — `{uid, id, upgraded}` — not CardDefs.
    // Printing them straight is what put `bones/bite ×4` and a card face reading
    // BONES/BITE on the most emotional screen in the game, and left the closing
    // line with an empty name slot where `def.name` should have been. Resolve
    // every entry to its real definition first; anything that will not resolve
    // is dropped rather than printed as an id.
    if (Array.isArray(s.deck) && s.deck.length) {
      try {
        const { cardById } = await import('../data/cards.js');
        cards = s.deck.map((c) => resolveCard(c, cardById)).filter(Boolean);
      } catch { cards = null; }
    }

    if (!cards || !cards.length) {
      try {
        const mod = await import('../data/cards.js');
        const start = mod.startingDeckFor?.(s.companion) ?? [];
        const pool  = mod.poolFor?.(s.companion) ?? [];
        const shared = mod.sharedPool?.() ?? [];
        const rng = new RNG(hashSeed(`${s.seed}:deck`));
        const picked = [];
        const bag = [...pool, ...shared].filter(Boolean);
        const extra = bag.length ? 5 + rng.int(7) : 0;
        for (let i = 0; i < extra; i++) picked.push(bag[rng.int(bag.length)]);
        cards = [...start, ...picked].filter(Boolean)
          .map((def) => ({ def, upgraded: false }));
      } catch { cards = []; }
    }
    if (this._dead) return;

    if (cards.length) this._renderDeck(cards);
    else this._renderDeckFallback();

    await this._hydrateKeepsakes();
  }

  /** @param {{def:object, upgraded:boolean}[]} cards */
  _renderDeck(cards) {
    const host = this._deckHost;
    if (!host) return;
    // Scratch and Scratch+ are different Tricks to a player, so they are
    // different rows — keyed on the pair, not on the id alone.
    const counts = new Map();
    for (const c of cards) {
      if (!c?.def?.name) continue;
      const key = `${c.def.id}${c.upgraded ? '+' : ''}`;
      const hit = counts.get(key);
      if (hit) hit.n++; else counts.set(key, { n: 1, def: c.def, upgraded: !!c.upgraded });
    }
    const rows = [...counts.values()].sort((a, b) =>
      (b.n - a.n) || String(a.def.name).localeCompare(String(b.def.name)));

    // Each Trick on a nameplate, its cost struck as a gold coin.
    host.innerHTML = rows.map(({ n, def, upgraded }) => `
      <span class="go-trick kit-plate" role="listitem"${upgraded ? ' data-up="1"' : ''}
            data-type="${esc(def.type || 'skill')}" data-rarity="${esc(def.rarity || 'common')}">
        <i class="go-trick__cost">${def.cost < 0 ? 'X' : (def.cost ?? 1)}</i>
        <b class="go-trick__name">${esc(def.name)}${upgraded ? '<u>+</u>' : ''}</b>
        ${n > 1 ? `<em class="go-trick__n">&#215;${n}</em>` : ''}
      </span>`).join('');

    const total = rows.reduce((t, r) => t + r.n, 0);
    if (this._deckTotal) this._deckTotal.textContent = `${total} ${TERMS.deck}`;
    const el0 = this.root?.querySelector('[data-deck-count]');
    if (el0) el0.textContent = String(total);

    this._renderMvp(rows);
  }

  /** No card module at all: still show a real, readable list rather than nothing. */
  _renderDeckFallback() {
    const host = this._deckHost;
    if (!host) return;
    const rows = [
      { n: 5, def: { name: 'Scratch', type: 'attack', rarity: 'basic', cost: 1 } },
      { n: 4, def: { name: 'Curl Up', type: 'skill', rarity: 'basic', cost: 1 } },
      { n: 1, def: { name: 'Boo!', type: 'skill', rarity: 'special', cost: 1 } },
    ];
    host.innerHTML = rows.map(({ n, def }) => `
      <span class="go-trick kit-plate" role="listitem" data-type="${def.type}" data-rarity="${def.rarity}">
        <i class="go-trick__cost">${def.cost}</i><b class="go-trick__name">${def.name}</b>
        ${n > 1 ? `<em class="go-trick__n">&#215;${n}</em>` : ''}</span>`).join('');
    const total = rows.reduce((t, r) => t + r.n, 0);
    if (this._deckTotal) this._deckTotal.textContent = `${total} ${TERMS.deck}`;
    const el0 = this.root?.querySelector('[data-deck-count]');
    if (el0) el0.textContent = String(total);
  }

  /** One real CardView: the Trick the run leaned on hardest. */
  async _renderMvp(rows) {
    const pick = rows.find((r) => r.def?.id && r.def.rarity !== 'basic') || rows[0];
    if (!pick?.def?.id || !this._mvpSlot) return;
    try {
      await ensureCss(CSS_CARD);
      const { CardView } = await import('../ui/card.js');
      if (this._dead || !this._mvpSlot) return;
      const view = new CardView(pick.def, {
        uid: `go-${pick.def.id}`,
        upgraded: !!pick.upgraded,
        largeText: !!Save?.settings?.largeText,
        reduceMotion: reduceMotion(),
      });
      this._cards.push(view);
      /* The slot's height comes off `--card-w`, NOT off `--card-h`. `--card-w`
         is responsive now (`clamp(150px, min(13.5vw, 27vh), 224px)`) while
         `--card-h` is still a flat 312px, so the pair no longer describes one
         rectangle: at 1280x720 the old maths reserved a 187px-tall box for a
         144px-tall card and the MVP sat in a hole. `--card-aspect` is the
         authored ratio, so deriving the height from the width keeps the box on
         the card at every viewport. */
      // The scale is the board's to choose (gameover.css `--go-mvp-s`), so a
      // short panel can hang a smaller card instead of pushing the shelf off it.
      const S = 'var(--go-mvp-s, 0.6)';
      this._mvpSlot.style.width  = `calc(var(--card-w) * ${S})`;
      this._mvpSlot.style.height = `calc(var(--card-w) / var(--card-aspect) * ${S})`;
      this._mvpSlot.appendChild(view.el);
      // It is shown to be READ, at the reward's scale: the rules never print
      // smaller than a full-size card prints them. Re-fitted whenever the slot
      // changes size, since a stylesheet landing late restyles the board.
      const slot = this._mvpSlot;
      const fit = () => fitCardToSlot(view, slot, { legibleAt: 224 });
      fit();
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(() => { if (!this._dead) fit(); });
        ro.observe(slot);
        this._offs.push(() => ro.disconnect());
      }

      /* This used to read "played 21×" off `new RNG(seed).int(38)` — a number
         invented on the spot and printed as a statistic on the screen a player
         screenshots. Neither the run nor the engine keeps a per-Trick play
         count (the ask is in docs/NOTES.md), so the chip now states the one
         thing that IS true: how many copies of it you finished the night with. */
      const name = esc(pick.def.name) + (pick.upgraded ? '+' : '');
      if (this._mvpN) {
        this._mvpN.textContent = pick.n > 1
          ? `${pick.n} copies` : String(pick.def.rarity || 'common');
      }
      if (this._mvpNote) {
        this._mvpNote.innerHTML = this.won
          ? `Every expedition ends up leaning on one ${TERMS.card}. This run it was
             <b>${name}</b>, and it held.`
          : `Every expedition ends up leaning on one ${TERMS.card}. This run it was
             <b>${name}</b>, right up until it was not enough.`;
      }
      this._mvpBlock.hidden = false;
      if (this._mvpSaid) this._mvpSaid.hidden = false;
    } catch { /* card-feel's renderer is not available; the list above stands */ }
  }

  /**
   * Keepsakes come off `ctx.run.relics` — that is the seam meta-run owns.
   *
   * WHAT THIS USED TO DO, and why it mattered. `s.relics` was null both when
   * there was no run and when the run had simply kept nothing, and the `if
   * (!list)` below then sampled the fallback table in BOTH cases. So a player
   * who reached the Butler carrying nothing was shown a shelf of three to six
   * Keepsakes they had never held, five of which did not exist in the game, on
   * the one screen in the build whose whole job is to be the true account of
   * the run. The mocked flag needed for the distinction was already computed
   * one method up and simply never consulted.
   *
   * Now: a run's own list is printed, empty or not, and the mock is only ever
   * reached on the standalone deep link.
   */
  async _hydrateKeepsakes() {
    const s = this.summary;
    let list = Array.isArray(s.relics) ? s.relics : null;
    if (!list) list = s.mocked ? await this._mockKeepsakes() : [];
    // Each Keepsake wears its own sigil on the board's round enamel, as it does
    // under Mr. Moth's glass. The table is optional; a blank roundel is not.
    let sigil = null;
    try { sigil = (await import('../data/relics.js')).relicSigil || null; } catch { sigil = null; }
    if (this._dead || !this._keepHost) return;

    if (!list.length) {
      // An empty shelf is a real outcome and gets a real sentence. It must not
      // silently look like a section that failed to load.
      this._keepHost.removeAttribute('role');
      this._keepHost.innerHTML =
        `<p class="go-keeps__none">Your pockets were empty. Nothing came out with you.</p>`;
    } else {
      this._keepHost.setAttribute('role', 'list');
      this._keepHost.innerHTML = list.map((r) => `
        <span class="go-keep" role="listitem" data-rarity="${esc(r.rarity || 'common')}">
          <i class="go-keep__sigil" aria-hidden="true">${sigil && r.id
            ? `<svg viewBox="0 0 24 24"><path d="${sigil(r.id)}"/></svg>` : ''}</i>
          <b>${esc(r.name ?? r.id)}</b>
          <em>${esc(r.desc ?? r.text ?? '')}</em>
        </span>`).join('');
    }
    if (this._keepTotal) this._keepTotal.textContent = list.length ? `${list.length} kept` : 'none kept';
    const el0 = this.root?.querySelector('[data-relic-count]');
    if (el0) el0.textContent = String(list.length);
    const noun = this.root?.querySelector('[data-relic-noun]');
    if (noun) noun.textContent = word(list.length, TERMS.relic);
  }

  /**
   * The shelf for a deep link with no run behind it.
   *
   * Sourced from the REAL table, deterministically from the seed — the same
   * move `_hydrateCards` makes for the deck one block up, and the same promise
   * this file's header makes about everything on the screen ("the mock is
   * generated from the same real card data the run would have used").
   *
   * The starter goes first because a real expedition always leaves with one,
   * so a mock without it is a shelf no run could produce.
   */
  async _mockKeepsakes() {
    let mod;
    try { mod = await import('../data/relics.js'); } catch { return []; }
    const s = this.summary;
    const rng = new RNG(hashSeed(`${s.seed}:keeps`));
    const start = mod.starterKeepsake?.(s.companion) || null;
    const pool = (mod.RELICS || []).filter(
      (r) => r.rarity !== 'starter' && r.id !== start?.id);
    const rest = rng.sample(pool, Math.min(2 + rng.int(4), pool.length));
    return [start, ...rest].filter(Boolean);
  }

  /* ═══ footer ═════════════════════════════════════════════════════════════ */
  /** The three ways out, as the kit's buttons: the way home is the lit
   *  cartouche with the Kid board's round button on its end, the other two
   *  the same plate unlit. */
  _buildFoot() {
    const f = el('footer', 'go-foot');
    const nav = el('nav', 'go-acts');
    nav.setAttribute('aria-label', 'What now');
    // Every way out is a cartouche with the Kid board's round enamel button
    // seated on its end: the two quiet ones on their left ends, the way home on
    // its right, as the board's back and confirm buttons sit.
    const mk = (act, cls, label, hint, glyph) => {
      const b = el('button', `go-btn ${cls}`);
      b.type = 'button';
      b.dataset.act = act;
      b.innerHTML = `<b>${label}</b><em>${hint}</em>`
        + `<i class="kit-medallion kit-medallion--ornate kit-btn__medal" aria-hidden="true">${glyph}</i>`;
      return b;
    };
    const home = mk('clubhouse', 'go-btn--primary kit-btn', 'Return to the Clubhouse',
      this.won ? 'pin the photograph to the board' : 'work out what to bring next time', GO_GLYPH.home);
    nav.appendChild(mk('title', 'go-btn--ghost go-btn--title kit-btn kit-btn--quiet', 'Title', 'put the house down for now', GO_GLYPH.title));
    nav.appendChild(mk('again', 'go-btn--ghost go-btn--again kit-btn kit-btn--quiet', 'Go straight back in', 'choose a Kid and a Companion', GO_GLYPH.again));
    nav.appendChild(home);
    f.appendChild(nav);
    this._acts = nav;
    return f;
  }

  /* ═══ behaviour ══════════════════════════════════════════════════════════ */
  _wire() {
    const root = this.root;

    const unlockOnce = () => { try { this.ctx.audio?.unlock?.(); } catch {} };
    root.addEventListener('pointerdown', unlockOnce, { once: true });
    this._offs.push(() => root.removeEventListener('pointerdown', unlockOnce));

    const onAct = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      unlockOnce();
      this._activate(b.dataset.act);
    };
    this._acts.addEventListener('click', onAct);
    this._offs.push(() => this._acts.removeEventListener('click', onAct));
    this._offs.push(rovingFocus(this._acts, '.go-btn', {
      cols: 0, onActivate: (b) => this._activate(b.dataset.act),
    }));

    const copy = this.root.querySelector('.go-seed__copy');
    if (copy) {
      const onCopy = async () => {
        const txt = formatSeed(this.summary.seed);
        try { await navigator.clipboard?.writeText?.(txt); copy.textContent = 'Copied'; }
        catch { copy.textContent = txt; }
        this._timers.push(setTimeout(() => { copy.textContent = 'Copy'; }, 1600));
      };
      copy.addEventListener('click', onCopy);
      this._offs.push(() => copy.removeEventListener('click', onCopy));
    }

    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); this._activate('clubhouse'); }
    };
    addEventListener('keydown', onKey);
    this._offs.push(() => removeEventListener('keydown', onKey));

    // land keyboard focus on the primary action, not on the body
    this._timers.push(setTimeout(() => {
      this._acts?.querySelector('.go-btn--primary')?.focus({ preventScroll: true });
    }, reduceMotion() ? 0 : 900));
  }

  _activate(act) {
    try { this.ctx.audio?.play?.('ui:confirm'); } catch {}
    // the run is finished either way — never let a dead run be resumed
    try { Save?.clearRun?.(); } catch {}
    try { this.ctx.run = null; } catch {}
    switch (act) {
      case 'again':  this.ctx.scenes?.go?.('select', { seed: this.summary.seed }); break;
      case 'title':  this.ctx.scenes?.go?.('title', {}); break;
      default:       this.ctx.scenes?.go?.('clubhouse', { panel: this.won ? 'menagerie' : 'board' }); break;
    }
  }

  /** Kill the flame. The single most important two seconds on the defeat screen. */
  _snuff() {
    const cand = this.root?.querySelector('.go-candle');
    if (!cand || cand.classList.contains('is-out')) return;
    cand.classList.add('is-out');
    this.root.classList.add('is-dark');
    try { this.ctx.audio?.play?.('ui:snuff'); } catch {}
  }

  update() { /* every animation here is CSS-composited; nothing runs per frame */ }

  /* ═══ teardown ═══════════════════════════════════════════════════════════ */
  async exit() {
    this._dead = true;
    this._unpauseStage?.();
    this._unpauseStage = null;
    for (const t of this._timers) clearTimeout(t);
    this._timers.length = 0;
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    for (const p of this._portraits) { try { p.destroy(); } catch {} }
    this._portraits.length = 0;
    for (const c of this._cards) { try { c.destroy(); } catch {} }
    this._cards.length = 0;
    try { this.ctx.atmosphere?.dread?.(0, 0.4); } catch {}
    this._acts = this._deckHost = this._keepHost = this._board = null;
    this._mvpSlot = this._mvpNote = this._mvpN = this._mvpBlock = this._mvpSaid = null;
    this._deckTotal = this._keepTotal = null;
    this.root.innerHTML = '';
  }
}

export default GameOverScene;
