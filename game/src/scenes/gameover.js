/**
 * Expedition Over — the two ends of a run.
 *
 *   #scene=gameover&result=defeat    the candle goes out
 *   #scene=gameover&result=victory   a Companion walks out of the house
 *
 * Both flavours are the same screen with a different emotional argument:
 *
 *   left  — the beat. A candle (snuffed or burning), the Companion's plate, and
 *           three short stanzas: what you found, what you lost, and the pet you
 *           did not reach. This column is the reason anyone remembers the run.
 *   right — the ledger. Rooms deep and wing reached, Scuffles won, the Tricks,
 *           the Keepsakes, the seed. Everything a player wants to screenshot.
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
import { COMPANIONS, KIDS, TERMS, REGION_ORDER } from '../data/schema.js';
import { regionMeta, blueprintPlan, MASTER } from '../state/mapgen.js';
import {
  ensureCss, fontsReady, companionPortrait, kidPortrait, petPortrait, candle, cobweb,
  el, svg, rovingFocus, setReduceMotion, reduceMotion, formatSeed,
  REGION_NAMES, COMPANION_BY_SLUG, KID_BY_SLUG, blueprintSrc,
} from '../ui/portrait.js';
import { pauseStageFor } from './_stage.js';
import { fitCardToSlot } from './_cardfit.js';
import { plural, word } from '../util/plural.js';

const CSS_KIT  = new URL('../ui/portrait.css', import.meta.url).href;
const CSS_OVER = new URL('./gameover.css', import.meta.url).href;
const CSS_CARD = new URL('../ui/card.css', import.meta.url).href;

/** Keepsakes used only when data/relics.js has not shipped yet. */
const FALLBACK_KEEPSAKES = [
  ['chewed-tennis-ball', 'Chewed Tennis Ball', `Start every Scuffle with 1 extra ${TERMS.energy}. It squeaks. Everything hears it.`],
  ['half-a-torch',       'Half a Torch',       `The first ${TERMS.card} you play each turn costs 1 less.`],
  ['collar-tag',         'Collar Tag',         `Whenever a Companion is freed, gain 25 ${TERMS.gold}.`],
  ['spare-batteries',    'Spare Batteries',    'Backpack Gear recharges once per region.'],
  ['bent-house-key',     'Bent House Key',     `Locked rooms open. ${TERMS.shop} gives you a discount and a look.`],
  ['mothbitten-ribbon',  'Moth-Bitten Ribbon', `Gain 3 ${TERMS.block} at the start of every enemy turn.`],
  ['jar-of-nothing',     'Jar of Nothing',     'The house cannot take the last thing you are carrying.'],
];

/** How a run ends when the engine has not told us. Flavour only. */
const KILLERS = {
  'foyer': 'the Butler',
  'nursery': 'the Governess',
  'sleeping-quarters': 'the Bedframe Beast',
  'kitchens-cellars': 'the Confectioner',
  'greenhouse': 'the Head Gardener',
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

    root.appendChild(el('div', 'go-ground'));
    root.appendChild(svg(`<div class="go-web go-web--l">${cobweb()}</div>`));
    root.appendChild(svg(`<div class="go-web go-web--r">${cobweb()}</div>`));
    root.appendChild(this._buildMotes());
    root.appendChild(el('div', 'go-vignette'));

    const wrap = el('div', 'go-wrap');
    wrap.appendChild(this._buildBeat());
    wrap.appendChild(this._buildLedger());
    root.appendChild(wrap);

    root.appendChild(this._buildFoot());

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
       Clubhouse records as its best), and `wing` is the ladder position the map
       prints as "Wing N of 17". The `floor` param carries `depth` now, so this
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

    const wingsMapped = Number(run?.wingsMapped ?? Save?.data?.blueprint?.revealed?.length) || 1;
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
      hp, maxHp, turns, wingsMapped, freedThisRun, cluesFound, petHome,
      haunt: Number(run?.hauntLevel ?? Save?.data?.hauntLevel ?? 0) || 0,
      killedBy: run?.killedBy || KILLERS[regionId] || 'the house',
      deck: Array.isArray(run?.deck) ? run.deck : null,          // filled by _hydrateCards
      relics: Array.isArray(run?.relics) && run.relics.length ? run.relics : null,
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

  /* ═══ left: the beat ═════════════════════════════════════════════════════ */
  _buildBeat() {
    const s = this.summary;
    const c = COMPANION_BY_SLUG[s.companion] ?? COMPANIONS[0];
    const k = KID_BY_SLUG[s.kid] ?? KIDS[0];
    const first = k.name.split(' ')[0];
    const region = REGION_NAMES[s.regionId] ?? s.meta.name;

    const beat = el('section', 'go-beat');
    beat.setAttribute('aria-label', this.won ? 'Expedition succeeded' : 'Expedition failed');

    /* --- the candle ------------------------------------------------------- */
    const stage = el('div', 'go-stage');
    // smoke lives inside the candle so it always starts exactly at the wick
    stage.appendChild(svg(`<div class="go-candle">${candle()}
      <svg class="go-smoke" viewBox="0 0 60 220" aria-hidden="true">
        <path d="M30 214c-9-24 9-32 0-56s8-32 1-54 6-28 1-48" pathLength="100"/>
        <path d="M30 212c8-22-7-30 1-52s-6-30 0-50" pathLength="100"/>
      </svg></div>`));
    stage.appendChild(el('div', 'go-halo'));

    // the Companion's plate: lit and shimmering on a win, tired and cold on a loss
    const plate = el('div', 'go-plate' + (this.won ? '' : ' is-spent'));
    const pf = companionPortrait({
      slug: c.slug, variant: '-card', locked: false, parallax: 0.6, shimmer: this.won,
    });
    this._portraits.push(pf);
    plate.appendChild(pf.el);
    plate.appendChild(el('div', 'go-plate__cap',
      this.won
        ? `<b>${esc(c.name)}</b><span>${esc(c.title)} &mdash; out</span>`
        : `<b>${esc(c.name)}</b><span>went back in with you</span>`));
    stage.appendChild(plate);
    beat.appendChild(stage);

    /* --- headline --------------------------------------------------------- */
    const head = el('div', 'go-head');
    head.innerHTML = this.won
      ? `<p class="go-kicker">Wing ${s.wing} &middot; ${esc(region)}</p>
         <h1 class="go-title">You got one out.</h1>
         <p class="go-lede">${esc(c.name)} walked through the front door on ${esc(first)}&rsquo;s shoulder
            and did not look back at the house once.</p>`
      : `<p class="go-kicker">Wing ${s.wing} &middot; ${esc(region)}</p>
         <h1 class="go-title">The candle goes out.</h1>
         <p class="go-lede">${esc(first)} gets out. ${esc(s.killedBy.replace(/^the /, 'The '))} keeps the room,
            and everything still in the backpack stays where it fell.</p>`;
    beat.appendChild(head);

    /* --- three stanzas ---------------------------------------------------- */
    const stanzas = el('div', 'go-stanzas');

    const found = [];
    if (s.freedThisRun.length) {
      found.push(`${plural(s.freedThisRun.length, 'Companion')} freed &mdash; ` +
        s.freedThisRun.map((sl) => esc(COMPANION_BY_SLUG[sl]?.name ?? sl)).join(', '));
    }
    found.push(`${plural(s.wingsMapped, 'wing')} drawn onto the blueprint`);
    if (s.cluesFound) found.push(`${plural(s.cluesFound, 'clue')} for the board`);
    if (s.bigScares) found.push(`${plural(s.bigScares, 'Big Scare')} survived`);
    stanzas.appendChild(this._stanza('found', 'What you found', found));

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
    stanzas.appendChild(this._stanza('lost', this.won ? 'What it cost' : 'What you lost', lost));

    const petLine = s.petHome
      ? `<b>${esc(k.pet)}</b> came home. ${esc(first)} has not put ${esc(k.pet)} down since.`
      : this.won
        ? `<b>${esc(k.pet)}</b> is still in there. But ${esc(c.name)} knows which door,
           and ${esc(first)} is already re-packing the backpack.`
        : `<b>${esc(k.pet)}</b> is still in there. ${esc(first)} does not say anything on the walk back.
           She is working out what to bring next time.`;
    const pet = el('div', `go-stanza go-stanza--pet${s.petHome ? ' is-home' : ''}`);
    pet.innerHTML =
      `<h2 class="go-sh">${s.petHome ? 'The pet you reached' : 'The pet you did not reach'}</h2>` +
      `<div class="go-pet">
         <span class="go-pet__snap"></span>
         <p class="go-pet__text">${petLine}</p>
       </div>`;
    /* The brass collar tag with a species glyph on it was a symbol standing in
       for a picture. On the one beat in the whole game that is about this
       animal specifically, the photograph goes here instead. */
    pet.querySelector('.go-pet__snap').appendChild(petPortrait(k.slug));
    stanzas.appendChild(pet);

    beat.appendChild(stanzas);
    beat.appendChild(this._buildBlueprint());
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
      <div class="go-bp__paper">
        ${plan ? `<img class="go-bp__img" src="${esc(new URL('../../' + plan.url, import.meta.url).href)}"
             alt="" decoding="async" width="${MASTER.w}" height="${MASTER.h}"
             style="width:${(MASTER.w / plan.sw * 100).toFixed(3)}%;
                    transform:translate(${(-plan.sx / MASTER.w * 100).toFixed(3)}%,
                                        ${(-plan.sy / MASTER.h * 100).toFixed(3)}%)">` : ''}
        <span class="go-bp__wash"></span>
        <span class="go-bp__mark" aria-hidden="true"></span>
      </div>
      <div class="go-bp__meta">
        <span class="go-bp__label">${label}</span>
        <span class="go-bp__count"><b>${s.wingsMapped}</b> / ${REGION_ORDER.length} wings drawn</span>
      </div>`;
    return band;
  }

  _stanza(kind, title, lines) {
    const n = el('div', `go-stanza go-stanza--${kind}`);
    n.innerHTML = `<h2 class="go-sh">${esc(title)}</h2><ul>${
      lines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
    return n;
  }

  /* ═══ right: the ledger ══════════════════════════════════════════════════ */
  _buildLedger() {
    const s = this.summary;
    const k = KID_BY_SLUG[s.kid] ?? KIDS[0];
    const region = REGION_NAMES[s.regionId] ?? s.meta.name;

    const led = el('section', 'go-ledger');
    led.setAttribute('aria-label', 'Expedition record');

    /* --- header strip: who went in ---------------------------------------- */
    const who = el('div', 'go-who', `
      <div class="go-who__kid"></div>
      <div class="go-who__txt">
        <b>${esc(k.name)}</b>
        <span>with ${esc(COMPANION_BY_SLUG[s.companion]?.name ?? s.companion)}
              &middot; ${TERMS.ascension} ${s.haunt}</span>
      </div>
      <div class="go-who__reach">
        <span class="go-lbl">Reached</span>
        <b>${plural(s.floor, 'room')} deep</b>
        <span class="go-who__wing">${esc(region)} &middot; Wing ${s.wing}</span>
      </div>`);
    who.querySelector('.go-who__kid')
      .appendChild(kidPortrait({ ...k, petKind: k.petKind }, { w: 92, h: 102 }));
    led.appendChild(who);

    /* --- the numbers ------------------------------------------------------ */
    const grid = el('div', 'go-stats');
    const stat = (label, value, sub) =>
      `<div class="go-stat"><span class="go-lbl">${esc(label)}</span>` +
      `<b>${esc(value)}</b>${sub ? `<em>${esc(sub)}</em>` : ''}</div>`;
    grid.innerHTML =
      stat(`${TERMS.combat}s won`, s.scuffles) +
      stat(`${TERMS.elite}s`, s.bigScares) +
      stat('Curiosities', s.curiosity) +
      stat(`${TERMS.rest}s`, s.safeRooms) +
      stat(`${TERMS.card}s played`, s.cardsPlay) +
      stat('Damage dealt', s.damage) +
      stat(TERMS.gold, s.gold) +
      stat('Turns taken', s.turns);
    led.appendChild(grid);

    /* --- Courage bar: the shape of the ending ----------------------------- */
    const bar = el('div', 'go-courage');
    bar.innerHTML =
      `<span class="go-lbl">${TERMS.hp}</span>` +
      `<div class="go-courage__track"><i style="width:${Math.max(0, Math.min(100, (s.hp / s.maxHp) * 100)).toFixed(1)}%"></i></div>` +
      `<span class="go-courage__n">${s.hp} / ${s.maxHp}</span>` +
      `<em class="go-courage__note">${this.won ? 'walked out with it' : 'the candle ran out'}</em>`;
    led.appendChild(bar);

    /* --- final deck ------------------------------------------------------- */
    const deck = el('div', 'go-block go-block--deck');
    deck.innerHTML =
      `<h2 class="go-h">Final ${TERMS.deck} <em class="go-h__n" data-deck-total></em></h2>` +
      `<div class="go-tricks" role="list"></div>`;
    led.appendChild(deck);
    this._deckHost = deck.querySelector('.go-tricks');
    this._deckTotal = deck.querySelector('[data-deck-total]');

    /* --- the card that did the work --------------------------------------- */
    const mvp = el('div', 'go-block go-block--mvp');
    mvp.innerHTML = `<h2 class="go-h">Worked hardest <em class="go-h__n" data-mvp-n></em></h2>
      <div class="go-mvp"><div class="go-mvp__slot"></div>
      <p class="go-mvp__note"></p></div>`;
    led.appendChild(mvp);
    this._mvpSlot = mvp.querySelector('.go-mvp__slot');
    this._mvpNote = mvp.querySelector('.go-mvp__note');
    this._mvpN = mvp.querySelector('[data-mvp-n]');
    this._mvpBlock = mvp;
    mvp.hidden = true;

    /* --- keepsakes -------------------------------------------------------- */
    const keep = el('div', 'go-block go-block--keep');
    keep.innerHTML =
      `<h2 class="go-h">${TERMS.relic}s <em class="go-h__n" data-keep-total></em></h2>` +
      `<div class="go-keeps" role="list"></div>`;
    led.appendChild(keep);
    this._keepHost = keep.querySelector('.go-keeps');
    this._keepTotal = keep.querySelector('[data-keep-total]');

    /* --- the seed --------------------------------------------------------- */
    const seed = el('div', 'go-seed');
    seed.innerHTML =
      `<span class="go-lbl">Seed</span>` +
      `<code class="go-seed__val">${formatSeed(s.seed)}</code>` +
      `<button type="button" class="go-seed__copy">Copy</button>` +
      `<span class="go-seed__hint">Run this house again, exactly as it was.</span>`;
    led.appendChild(seed);

    return led;
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

    host.innerHTML = rows.map(({ n, def, upgraded }) => `
      <span class="go-trick" role="listitem"${upgraded ? ' data-up="1"' : ''}
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
      <span class="go-trick" role="listitem" data-type="${def.type}" data-rarity="${def.rarity}">
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
      const S = 0.6;
      this._mvpSlot.style.width  = `calc(var(--card-w) * ${S})`;
      this._mvpSlot.style.height = `calc(var(--card-w) / var(--card-aspect) * ${S})`;
      this._mvpSlot.appendChild(view.el);
      fitCardToSlot(view, this._mvpSlot);

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
    } catch { /* card-feel's renderer is not available; the list above stands */ }
  }

  /**
   * Keepsakes come off `ctx.run.relics` — that is the seam meta-run owns. We do
   * not reach into data/relics.js: it may not exist, and probing for it would
   * put a 404 in the console. Without a run we show the authored fallback set.
   */
  async _hydrateKeepsakes() {
    const s = this.summary;
    let list = s.relics;
    if (!list) {
      const rng = new RNG(hashSeed(`${s.seed}:keeps`));
      const n = 3 + rng.int(4);
      list = rng.sample(FALLBACK_KEEPSAKES, Math.min(n, FALLBACK_KEEPSAKES.length))
        .map(([id, name, desc]) => ({ id, name, desc }));
    }
    if (this._dead || !this._keepHost) return;

    this._keepHost.innerHTML = list.map((r) => `
      <span class="go-keep" role="listitem" data-rarity="${esc(r.rarity || 'common')}">
        <i class="go-keep__sigil" aria-hidden="true"></i>
        <b>${esc(r.name ?? r.id)}</b>
        <em>${esc(r.desc ?? r.text ?? '')}</em>
      </span>`).join('');
    if (this._keepTotal) this._keepTotal.textContent = `${list.length} kept`;
    const el0 = this.root?.querySelector('[data-relic-count]');
    if (el0) el0.textContent = String(list.length);
    const noun = this.root?.querySelector('[data-relic-noun]');
    if (noun) noun.textContent = word(list.length, TERMS.relic);
  }

  /* ═══ footer ═════════════════════════════════════════════════════════════ */
  _buildFoot() {
    const f = el('footer', 'go-foot');
    const nav = el('nav', 'go-acts');
    nav.setAttribute('aria-label', 'What now');
    const mk = (act, cls, label, hint) => {
      const b = el('button', `go-btn ${cls}`);
      b.type = 'button';
      b.dataset.act = act;
      b.innerHTML = `<b>${label}</b><em>${hint}</em>`;
      return b;
    };
    nav.appendChild(mk('clubhouse', 'go-btn--primary', 'Return to the Clubhouse',
      this.won ? 'pin the photograph to the board' : 'work out what to bring next time'));
    nav.appendChild(mk('again', 'go-btn--ghost', 'Go straight back in', 'choose a Kid and a Companion'));
    nav.appendChild(mk('title', 'go-btn--ghost', 'Title', 'put the house down for now'));
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
    this._acts = this._deckHost = this._keepHost = null;
    this._mvpSlot = this._mvpNote = this._mvpN = this._mvpBlock = null;
    this._deckTotal = this._keepTotal = null;
    this.root.innerHTML = '';
  }
}

export default GameOverScene;
