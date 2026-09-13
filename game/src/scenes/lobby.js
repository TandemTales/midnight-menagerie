/**
 * The Treehouse — where a networked expedition is assembled. OWNER: frontend.
 *
 * It is the KIDS' place, at night, before anybody goes in: a rope ladder, a
 * torch, and whoever knows the password. That matters for more than flavour —
 * every other screen in the game is inside the house, and this is the one
 * moment the Kids are still outside it and still in charge. Naming it after a
 * room in the mansion (it was "The Parlour" for about an hour) put the meeting
 * point inside the thing they have not entered yet, and made a lobby feel like
 * a hotel booking.
 *
 * `scenes/clubhouse.js` is already "The Menagerie" and is a different place —
 * that is the roster and the board, alone, between runs. This is the same
 * treehouse with your friends in it.
 *
 * `net/lobby.js` was written, documented and tested — 158 checks in
 * `tests/net/` exercise seats, host election, seed derivation and a late
 * joiner — and until 2026-08-30 **nothing in `game/src/` imported it.** There
 * was no host UI, no join UI and no room-code field anywhere in the game, so a
 * player had no way to reach any of it. That is the same shape as the wing
 * conditions and the audio bus (CONTRACTS 54), with one difference worth
 * keeping in mind: this one had tests, so it was not broken. It was unreachable,
 * which looks identical from the outside and is a different thing to fix.
 *
 * ── Why this exists BEFORE Steam ────────────────────────────────────────────
 *
 * The handoff called Steam P2P "the only remaining multiplayer item", which
 * quietly assumed the transport was the last piece. It was not. `SteamTransport`
 * is one file implementing five methods; without a lobby screen it would land
 * and there would still be no way for a player to start a networked game. So
 * the ordering is: lobby first, transport second, and the transport really is a
 * drop-in.
 *
 * ── It works TODAY, which is the point ──────────────────────────────────────
 *
 * `ChannelTransport` is a BroadcastChannel and reaches other TABS on this
 * machine. That is a real wire: two tabs are two Sessions, two Runs and two
 * boards computed independently from one seed, and every desync the lockstep
 * layer can have is reachable from here. Steam P2P swaps one constructor.
 *
 * Deliberately NOT a second party-assembly screen. `scenes/select.js` builds a
 * pass-and-play party on one machine and keeps doing that; this builds a party
 * out of PEOPLE, and the two never meet — `shouldHandOff()` reads
 * `run.session && run.session.remote`, so a lobby run has no veils and a
 * select run has no wire.
 */
import { Scene } from '../core/scenes.js';
import { bus } from '../core/bus.js';
import { clock } from '../core/clock.js';
import { Save } from '../core/save.js';
import { KIDS, COMPANIONS } from '../data/schema.js';
import { MAX_PARTY } from '../combat/engine.js';
import { loadoutFor } from './select.js';
import { canChooseEntry } from '../state/run.js';
import { Lobby, seedFromRoom } from '../net/lobby.js';
import { Session } from '../net/session.js';
import { attachSession } from '../net/actions.js';
import { ChannelTransport, canChannel } from '../net/transport.js';
import {
  ensureCss, el, rovingFocus, reduceMotion,
  availableCompanions, isStarter, warmFaces,
} from '../ui/portrait.js';
import { pauseStageFor } from './_stage.js';
import { paintBackdrop } from '../ui/kitboard.js';

const CSS_KIT   = new URL('../ui/portrait.css', import.meta.url).href;
const CSS_LOBBY = new URL('./lobby.css', import.meta.url).href;

/**
 * The glyphs in the round enamel buttons, drawn the way the arrow and the tick
 * on UI/selectKid.png are: flat antique gold with an ink outline (ui/kit.css
 * colours every path in a `.kit-medallion`). Decoration only — every button
 * that wears one also carries its words.
 */
const GLYPH = {
  back: '<svg viewBox="0 0 24 24"><path d="M20.5 9.6h-9.2V5.2L3 12l8.3 6.8v-4.4h9.2z"/></svg>',
  /* a rope ladder: the way up into the treehouse */
  climb: '<svg viewBox="0 0 24 24"><path d="M6.2 2.2h2.4v19.6H6.2zM15.4 2.2h2.4v19.6h-2.4zM8.6 5.2h6.8v2.1H8.6zM8.6 10.4h6.8v2.1H8.6zM8.6 15.6h6.8v2.1H8.6z"/></svg>',
  /* a die: the words are rolled, not chosen */
  roll: '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zm2 3.4a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 1 0 0-3.4zm8 0a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 1 0 0-3.4zm-4 3.9a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 1 0 0-3.4zm-4 3.9a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 1 0 0-3.4zm8 0a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 1 0 0-3.4z"/></svg>',
  ready: '<svg viewBox="0 0 24 24"><path d="M9.3 16.3 4.7 11.7l-2.3 2.3 6.9 6.9L21.6 8.6l-2.3-2.3z"/></svg>',
  door: '<svg viewBox="0 0 24 24"><path d="M3.5 9.6h9.2V5.2L21 12l-8.3 6.8v-4.4H3.5z"/></svg>',
};

/**
 * The password is WORDS, not hex.
 *
 * It is the only thing two people have to get from one head to another, usually
 * out loud, and `a3f9c2` does not survive being read down a phone. Two words a
 * ten-year-old would actually pick do — and they are the seed as well, because
 * `seedFromRoom` hashes exactly this string, so the password IS the map
 * (net/lobby.js decision 3). Say the same words, get the same house.
 */
const ROOM_A = ['knotted', 'creaky', 'secret', 'midnight', 'tin', 'rope',
                'acorn', 'owlish', 'mossy', 'whispering', 'lantern', 'crooked'];
const ROOM_B = ['ladder', 'treehouse', 'lookout', 'hideout', 'branch', 'signal',
                'torchlight', 'rooftop', 'hollow', 'den', 'camp', 'swing'];

function coinRoom() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return `${pick(ROOM_A)}-${pick(ROOM_B)}`;
}

/** A room code somebody typed, reduced to the form both ends will agree on. */
export function tidyRoom(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

const companionName = (slug) =>
  (COMPANIONS.find(c => c.slug === slug) || {}).name || slug || '—';

/**
 * Everyone this save may take in, in the roster's own order.
 *
 * `availableCompanions()` returns a SET, and a Set iterates in insertion order
 * — freed first, then the starters appended. Ordering by `COMPANIONS` instead
 * means the picker reads the same way every session and the same way as the
 * Menagerie board, rather than reshuffling as rescues accumulate.
 */
function pickableCompanions() {
  const may = availableCompanions();
  return COMPANIONS.map(c => c.slug).filter(slug => may.has(slug));
}
const kidName = (slug) =>
  (KIDS.find(k => k.slug === slug) || {}).name || slug || '—';

export class LobbyScene extends Scene {
  constructor(ctx) {
    super(ctx);
    this._offs = [];
    this._lobby = null;
    this._transport = null;
    /** Set the instant the roster freezes, so `exit()` does not close the wire
     *  out from under the Session that has just taken it over. */
    this._launching = false;
    this._room = '';
  }

  async enter(params = {}) {
    await Promise.all([ensureCss(CSS_KIT), ensureCss(CSS_LOBBY)]);
    warmFaces();
    this._unpauseStage = pauseStageFor(this.ctx);

    /* `SceneManager.go` builds `this.root`, gives it `scene scene--lobby` and
       appends it to `ctx.dom` BEFORE this runs. Making another one here would
       leave an orphan the manager never removes on exit. */
    this.root.classList.add('lo');

    /**
     * The stage behind this screen is the MANSION, and this screen is not in
     * it. Every authored mood is an interior — foyer, colonnade, aisle, nook —
     * so there is no treehouse to switch to and building one is a set, not a
     * scene tweak. `terrace` is the most open of them, and `.lo::before` puts
     * a night over the top of it: what is left reads as dark shapes outdoors
     * rather than as a specific room the Kids have not entered yet.
     *
     * The panel is then the only lit thing on the screen, which is the picture
     * — a torch in a treehouse, with the house somewhere out there in the dark.
     */
    try { this.ctx.atmosphere?.setMood?.('terrace', { instant: true }); } catch { /* mood is decoration */ }

    this._room = tidyRoom(params.room) || '';
    this._renderDoor();
    if (this._room) this._open(this._room);
  }

  /* ── the board ────────────────────────────────────────────────────────── */

  /**
   * The treehouse, built once and kept: its plank wall (the slot Josh's
   * `lobby.png` hangs in), a window onto the house either side, the select
   * boards' candles, cobwebs, vines and rule at its edges, and the title in the
   * wordmark's cartouche. `_renderDoor` and `_paintRoom` only ever replace what
   * is ON it, so a lobby change repaints the roster and never the room — the
   * whole board used to be rebuilt on every message from the wire.
   */
  _board() {
    if (this._$stage && this._$stage.isConnected) return this._$stage;
    this.root.innerHTML = '';
    const still = reduceMotion();
    const board = el('div', `lo-board kit-board${still ? ' kit-still' : ''}`);
    board.innerHTML = `
      <div class="lo-ground kit-ground kit-ground--planks" aria-hidden="true"><i class="kit-ground__warm"></i><i class="kit-ground__moon"></i></div>
      <div class="lo-night" aria-hidden="true"></div>
      <div class="lo-vig" aria-hidden="true"></div>
      <div class="kit-dress" aria-hidden="true">
        <i class="kit-dress__floor"></i>
        <i class="kit-dress__rule"></i>
        <i class="kit-dress__footscroll"></i>
        <i class="kit-dress__vine kit-dress__vine--l"></i>
        <i class="kit-dress__vine kit-dress__vine--r"></i>
        <i class="kit-dress__corner kit-dress__corner--l"></i>
        <i class="kit-dress__corner kit-dress__corner--r"></i>
        <i class="kit-dress__flame kit-dress__flame--l"></i>
        <i class="kit-dress__flame kit-dress__flame--r"></i>
      </div>
      <div class="lo-props" aria-hidden="true">
        <div class="lo-lights kit-bulbs">${Array.from({ length: 16 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
        <i class="kit-hatch lo-hatch lo-hatch--l"></i>
        <i class="kit-hatch lo-hatch lo-hatch--r"></i>
        <i class="kit-prop kit-prop--candle lo-sill lo-sill--l"></i>
        <i class="kit-prop kit-prop--candle lo-sill lo-sill--r"></i>
      </div>
      <header class="lo-head kit-titleblock">
        <span class="lo-head__ribbon kit-ribbon">Play together</span>
        <h1 class="lo__title kit-cartouche__title">The Treehouse</h1>
      </header>
      <div class="lo-stage"></div>`;
    this.root.appendChild(board);
    this._$board = board;
    this._$stage = board.querySelector('.lo-stage');
    paintBackdrop(board, 'lobby', () => !!this._$board && board.isConnected);
    return this._$stage;
  }

  /** A kit button: its words, and a round enamel medallion seated on one end. */
  _kitButton(cls, label, glyph, { quiet = false, side = 'right', hint = '', key = '' } = {}) {
    const b = el('button', `${cls} kit-btn${quiet ? ' kit-btn--quiet' : ''} lo-btn lo-btn--medal-${side}`);
    b.type = 'button';
    b.innerHTML = `<span class="lo-btn__words">${label}</span>`
      + (hint ? `<em>${hint}</em>` : '')
      + (key ? `<kbd>${key}</kbd>` : '')
      + `<i class="kit-medallion${quiet ? '' : ' kit-medallion--ornate'} kit-btn__medal lo-btn__medal" aria-hidden="true">${glyph}</i>`;
    return b;
  }

  /* ── the door: pick a room ────────────────────────────────────────────── */

  _renderDoor() {
    const suggested = coinRoom();
    const stage = this._board();
    stage.innerHTML = '';
    this._$board.dataset.state = 'door';

    /* ONE form round the whole door, so Climb up can stand in the board's
       bottom-right corner — where every board in the game keeps the way on —
       and still be this field's submit. */
    const form = el('form', 'lo__form');
    form.setAttribute('aria-label', 'The password');

    const wrap = el('section', 'lo__door kit-panel kit-panel--damask');
    wrap.dataset.medal = 'star';
    /* The section's name on a ribbon laid along the panel's top rail and
       clasped by its star, as the Shop's panels wear theirs. */
    wrap.appendChild(el('h2', 'lo-door__h kit-heading kit-heading--ribbon kit-heading--inline kit-heading--clasp',
      'The password <em>say it out loud</em>'));

    wrap.appendChild(el('p', 'lo__sub',
      'Climb up and wait for your friends. Everyone who knows the password ends '
      + 'up in the same treehouse — and the password is the map, so the same '
      + 'words always draw the same house.'));

    if (!canChannel()) {
      /* Said plainly rather than left as a dead button. A browser without
         BroadcastChannel cannot reach the only wire that exists yet. */
      wrap.appendChild(el('p', 'lo__warn',
        'This browser has no BroadcastChannel, so nobody else can climb up. '
        + 'Two Kids on one screen still works from New Expedition.'));
    }

    const row = el('div', 'lo-door__row');
    const input = el('input', 'lo__code kit-field');
    input.type = 'text';
    input.value = suggested;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Password');
    input.maxLength = 40;

    const roll = this._kitButton('lo__roll', 'New password', GLYPH.roll, { quiet: true, side: 'left' });
    roll.addEventListener('click', () => { input.value = coinRoom(); input.focus(); });

    row.appendChild(input);
    row.appendChild(roll);
    wrap.appendChild(row);
    form.appendChild(wrap);

    const foot = el('div', 'lo-foot');
    const back = this._kitButton('lo__back', '<span class="lo-arrow" aria-hidden="true">← </span>Back down', GLYPH.back,
      { quiet: true, side: 'left' });
    back.addEventListener('click', () => this.ctx.scenes?.go?.('title', {}));
    foot.appendChild(back);

    const go = this._kitButton('lo__enter', 'Climb up', GLYPH.climb, { key: 'Enter' });
    go.type = 'submit';
    go.disabled = !canChannel();
    foot.appendChild(go);
    form.appendChild(foot);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const room = tidyRoom(input.value);
      if (!room || !canChannel()) return;
      this._open(room);
    });

    stage.appendChild(form);
    /* The lettering is sized for the plate, and the longest pair of words the
       game can coin ("whispering-torchlight") is wider than the plate at that
       size — it clipped its first letter. So the words shrink to fit whatever
       is in the field, as it is typed and whenever the screen is resized. */
    const fit = () => this._fitCode(input);
    input.addEventListener('input', fit);
    roll.addEventListener('click', fit);
    const onResize = () => requestAnimationFrame(fit);
    addEventListener('resize', onResize, { passive: true });
    this._offs.push(() => removeEventListener('resize', onResize));
    fit();
    try { input.focus(); input.select(); } catch { /* focus is best-effort */ }
  }

  /** Shrink the password's lettering until every character is on its plate. */
  _fitCode(input) {
    if (!input || !input.isConnected) return;
    input.style.fontSize = '';
    let size = parseFloat(getComputedStyle(input).fontSize) || 30;
    for (let i = 0; i < 40 && size > 15 && input.scrollWidth > input.clientWidth + 1; i++) {
      size -= 1;
      input.style.fontSize = `${size}px`;
    }
  }

  /* ── the room ─────────────────────────────────────────────────────────── */

  _open(room) {
    this._room = room;
    this._transport = new ChannelTransport(room, `mm-${Math.random().toString(36).slice(2, 9)}`);
    this._lobby = new Lobby({ transport: this._transport, room, seats: MAX_PARTY });

    /* Seed the choice so the common case is "press ready". Nothing here is a
       commitment until they do. */
    const pickable = pickableCompanions();
    this._lobby.setChoice({
      companion: pickable[0] || 'marmalade',
      kid: (Save?.data?.kidsUnlocked || ['maya'])[0] || 'maya',
      name: '',
      /* This machine's ladder and this machine's roster, ANNOUNCED rather than
         used: seat 0's are the ones the party plays. Reading them at launch
         instead is what put two players on different Haunt levels. `MAX_PARTY`
         and not the current count, because the key must not change as people
         join and leave the room. */
      haunt: Save.hauntLevelFor(MAX_PARTY),
      freed: (Save?.data?.companionsRescued || []).slice(),
      entry: canChooseEntry(),
      /* The Clubhouse Backpack editor writes `Save.data.backpacks[kid]`, and a
         co-op run ignored it entirely: the roster carried only a Companion and
         a Kid, so every co-op Kid walked in on the default loadout while the
         same player's SOLO run used what they had packed. */
      pack: loadoutFor((Save?.data?.kidsUnlocked || ['maya'])[0] || 'maya'),
    });

    this._offs.push(this._lobby.on('change', () => this._paintRoom()));
    this._offs.push(this._lobby.on('start', (roster) => this._launch(roster)));
    this._paintRoom();
  }

  _paintRoom() {
    if (!this._lobby || this._launching) return;
    const l = this._lobby;
    const players = l.players;

    /* Focus survives the repaint: the wire repaints this on every message, and
       a player who had just tabbed to "I'm ready" should still be on it. */
    const had = document.activeElement && this.root.contains(document.activeElement)
      ? [...document.activeElement.classList].find((c) => c.startsWith('lo__')) : null;
    const stage = this._board();
    stage.innerHTML = '';
    this._$board.dataset.state = 'room';
    const wrap = el('div', 'lo__room kit-panel kit-panel--damask');
    wrap.dataset.medal = 'star';
    wrap.appendChild(el('h2', 'lo-room__h kit-heading kit-heading--ribbon kit-heading--inline kit-heading--clasp',
      `Up here <em>room for ${MAX_PARTY}</em>`));

    const head = el('header', 'lo__head');
    head.appendChild(el('p', 'lo__code-out',
      `<i class="lo__code-lbl">The password</i><span>${this._room}</span><i class="lo__seed">seed ${seedFromRoom(this._room)}</i>`));
    head.appendChild(el('p', 'lo__sub',
      `You are ${l.seat + 1} of ${players.length} up here. `
      + 'Everybody sees the same order, and it is not the order you arrived in.'));
    wrap.appendChild(head);

    /* ── the roster ─────────────────────────────────────────────────────── */
    const list = el('ul', 'lo__roster');
    for (const p of players) {
      const mine = p.id === l.me.id;
      const row = el('li', `lo__seat${mine ? ' is-me' : ''}${p.ready ? ' is-ready' : ''}`);
      row.appendChild(el('span', 'lo__n', String(players.indexOf(p) + 1)));
      row.appendChild(el('span', 'lo__who',
        `${companionName(p.companion)} <i>&amp;</i> ${kidName(p.kid)}`
        + (mine ? ' <b>(you)</b>' : '')));
      row.appendChild(el('span', 'lo__state', p.ready ? 'ready' : 'choosing…'));
      list.appendChild(row);
    }
    for (let i = players.length; i < MAX_PARTY; i++) {
      list.appendChild(el('li', 'lo__seat is-empty',
        `<span class="lo__n">${i + 1}</span><span class="lo__who">nobody up here yet</span>`));
    }
    wrap.appendChild(list);

    /* ── your choice ────────────────────────────────────────────────────── */
    const mineRow = el('div', 'lo__mine');

    const cSel = el('select', 'lo__pick kit-select');
    cSel.setAttribute('aria-label', 'Your Companion');
    for (const slug of pickableCompanions()) {
      const o = el('option', '', `${companionName(slug)}${isStarter(slug) ? ' (starter)' : ''}`);
      o.value = slug;
      if (slug === l.me.companion) o.selected = true;
      cSel.appendChild(o);
    }
    const kSel = el('select', 'lo__pick kit-select');
    kSel.setAttribute('aria-label', 'Your Kid');
    const unlocked = new Set(Save?.data?.kidsUnlocked || ['maya']);
    for (const k of KIDS) {
      if (!unlocked.has(k.slug)) continue;
      const o = el('option', '', k.name);
      o.value = k.slug;
      if (k.slug === l.me.kid) o.selected = true;
      kSel.appendChild(o);
    }
    const onPick = () => {
      this._lobby.setChoice({ companion: cSel.value, kid: kSel.value, name: l.me.name,
                              haunt: Save.hauntLevelFor(MAX_PARTY),
                              freed: (Save?.data?.companionsRescued || []).slice(),
                              entry: canChooseEntry(),
                              pack: loadoutFor(kSel.value) });
    };
    cSel.addEventListener('change', onPick);
    kSel.addEventListener('change', onPick);
    const pick = (lbl, sel) => {
      const lab = el('label', 'lo__pickwrap kit-select-wrap');
      lab.appendChild(el('span', 'lo__picklbl', lbl));
      lab.appendChild(sel);
      return lab;
    };
    mineRow.appendChild(pick('Your Companion', cSel));
    mineRow.appendChild(pick('Your Kid', kSel));
    wrap.appendChild(mineRow);

    /* ── ready, and go ──────────────────────────────────────────────────── */
    const foot = el('div', 'lo__foot lo-foot');

    const ready = el('button', `lo__ready kit-btn${l.me.ready ? ' is-on' : ' kit-btn--quiet'} lo-btn lo-btn--medal-left`,
      `<span class="lo-btn__words">${l.me.ready ? 'Ready' : `I'm ready`}</span>`
      + `<i class="kit-medallion kit-btn__medal lo-btn__medal" aria-hidden="true">${GLYPH.ready}</i>`);
    ready.type = 'button';
    ready.setAttribute('aria-pressed', String(!!l.me.ready));
    ready.addEventListener('click', () => {
      this._lobby.setReady(!l.me.ready);
      try { this.ctx.audio?.play?.('ui:confirm'); } catch { /* audio is best-effort */ }
    });
    const leave = this._kitButton('lo__back', '<span class="lo-arrow" aria-hidden="true">← </span>Back down', GLYPH.back,
      { quiet: true, side: 'left' });
    leave.addEventListener('click', () => this.ctx.scenes?.go?.('title', {}));
    foot.appendChild(leave);

    foot.appendChild(ready);

    /**
     * ONLY THE HOST HAS THIS BUTTON, and that is not the same as the host
     * having authority. `go()` broadcasts LOBBY.GO and every client runs the
     * identical `start()` off it, computing the same seats and the same seed
     * from state it already had. Somebody has to press something; nobody
     * decides anything.
     */
    if (l.isHost) {
      const enough = players.length >= 2;
      const start = this._kitButton('lo__go', 'Go in together', GLYPH.door);
      start.type = 'button';
      start.disabled = !(enough && l.allReady);
      start.title = !enough ? 'Waiting for somebody else to climb up'
        : !l.allReady ? 'Waiting for everyone to be ready'
        : 'Down the ladder and into the house';
      start.addEventListener('click', () => {
        try { this.ctx.audio?.play?.('ui:begin'); } catch { /* audio is best-effort */ }
        this._lobby.go();
      });
      foot.appendChild(start);
    } else {
      foot.appendChild(el('p', 'lo__wait',
        'Whoever is first on the list says when to go.'));
    }

    stage.appendChild(wrap);
    stage.appendChild(foot);
    try { rovingFocus?.(wrap); } catch { /* keyboard nav is an enhancement */ }
    if (had) { try { stage.querySelector(`.${had}`)?.focus(); } catch { /* focus is best-effort */ } }
  }

  /* ── the door opens ───────────────────────────────────────────────────── */

  /**
   * Every client runs this, off its own `start` event, with a roster it derived
   * rather than received. The run is built through the SAME `run:start` seam a
   * solo expedition uses, so there is no second start path to keep in step —
   * and the Session is attached to the Run the seam just created.
   */
  _launch(roster) {
    if (this._launching || !roster) return;
    this._launching = true;

    /* EVERY FIELD COMES OFF THE ROSTER. `haunt` was `Save.hauntLevelFor()` —
       each client's own ladder — which put two machines on different enemy
       scaling from the first fight. `freedRoster` is the same class of fact:
       it decides which Companion a boss frees, and each client's own lifetime
       set gave a different answer. Both are frozen at `Lobby#start()` now. */
    const payload = {
      seed: roster.seed,
      haunt: roster.haunt | 0,
      freedRoster: (roster.freed || []).slice(),
      /* THE PARTY VOTES ON THE WAY IN, and whether it may is seat 0's answer —
         the same anchor as the ladder and the roster. Read per client it would
         put one player at a fork while another walked straight into the Foyer,
         which is two machines in different wings. */
      entryUnlocked: !!roster.entryUnlocked,
      kids: roster.party.map(p => ({ companion: p.companion, kid: p.kid,
                                     backpack: p.backpack || undefined })),
    };

    const off = bus.on('run:ready', ({ run }) => {
      try { off(); } catch { /* already gone */ }
      if (!run) return;
      const session = new Session({
        transport: this._transport, seat: roster.seat,
        seats: roster.seats, seed: roster.seed, host: roster.host,
      });
      /* `attachSession`, NOT `session.attach(run)`. The latter only sets a
         back-pointer; it registers no `on('input')` handler, so the first
         version of this screen launched a networked run in which nothing
         either player did was ever applied. Both tabs reached the map and the
         suite went green. See the note on `attachSession`. */
      attachSession(session, run);
      /* The transport now belongs to the Session. `exit()` must not close it,
         which is what `_launching` is for. */
      this._transport = null;
    });

    bus.emit('run:start', payload);
    this.root.classList.add('is-leaving');
    /* The run says where it belongs: the way-in fork, or straight in. */
    const go = () => this.ctx.scenes?.go?.(this.ctx.run?.openingScene?.() || 'map', payload);
    if (reduceMotion()) go();
    else clock.wait(0.32).then(go);
  }

  update() { /* every animation here is CSS-composited */ }

  async exit() {
    this._unpauseStage?.();
    this._unpauseStage = null;
    for (const off of this._offs) { try { off(); } catch { /* already gone */ } }
    this._offs.length = 0;
    try { this._lobby?.close?.(); } catch { /* already closed */ }
    this._lobby = null;
    // Only when we are NOT handing it to a Session. Closing a transport the
    // Session has just taken would end the expedition on its first input.
    if (!this._launching) { try { this._transport?.close?.(); } catch { /* gone */ } }
    this._transport = null;
    this._$board = this._$stage = null;
    if (this.root) this.root.innerHTML = '';
  }
}
