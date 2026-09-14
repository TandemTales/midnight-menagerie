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
import { Lobby } from '../net/lobby.js';
import { Session } from '../net/session.js';
import { attachSession } from '../net/actions.js';
import { ChannelTransport, canChannel } from '../net/transport.js';
import {
  ensureCss, el, rovingFocus, reduceMotion,
  availableCompanions, isStarter, warmFaces,
  companionPortrait, kidPortrait, menuArtSrc,
} from '../ui/portrait.js';
import { paintBackdrop, kitDressMarkup } from '../ui/kitboard.js';
import { pauseStageFor } from './_stage.js';

const CSS_KIT   = new URL('../ui/portrait.css', import.meta.url).href;
const CSS_LOBBY = new URL('./lobby.css', import.meta.url).href;

/**
 * The glyphs set in the board's round enamel buttons (ui/kit.css .kit-medallion):
 * flat antique gold with an ink outline, the painted arrow and tick of the Kid
 * board's two corner buttons, and a die for rolling a new password.
 */
const GLYPH = {
  back: '<svg viewBox="0 0 24 24"><path d="M20.5 9.6h-9.2V5.2L3 12l8.3 6.8v-4.4h9.2z"/></svg>',
  onward: '<svg viewBox="0 0 24 24"><path d="M3.5 9.6h9.2V5.2L21 12l-8.3 6.8v-4.4H3.5z"/></svg>',
  ready: '<svg viewBox="0 0 24 24"><path d="M2.8 12.6 6 9.4l4.2 4.2L18 5.8l3.2 3.2-11 11z"/></svg>',
  roll: '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zm2 3.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zm8 0a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM12 10.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zm-4 4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zm8 0a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z"/></svg>',
};

/**
 * The board both states of this screen stand on, as every kit board is laid
 * (ui/kit.css; `RoomScene._shell` in scenes/reward.js is the worked example):
 * the painted room in the dark with its candle and moon light, the vignette,
 * and the select boards' rule, vines, candles and cobwebs at its edges. The
 * room's painting, `lobby.png`, drops into the ground when Josh has made it.
 */
function boardMarkup() {
  return '<div class="kit-ground lo-ground" aria-hidden="true"><i class="kit-ground__warm"></i><i class="kit-ground__moon"></i></div>'
    + '<div class="lo-vig" aria-hidden="true"></div>'
    /* a brass sconce on the wall either side of the stage, lighting the
       panelling round it, as the Curiosity's hall is staged */
    + '<div class="lo-hall" aria-hidden="true"><i class="kit-sconce lo-hall__sconce lo-hall__sconce--l"></i><i class="kit-sconce lo-hall__sconce lo-hall__sconce--r"></i></div>'
    /* the Kids' own light, strung across the wall between the corner candles
       and under the plaque: the same bulbs as their Headquarters */
    + `<div class="lo-bulbs kit-bulbs kit-bulbs--candle" aria-hidden="true" style="--n:12">${Array.from({ length: 12 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>`
    + kitDressMarkup().replace('<i class="kit-dress__rule"></i>',
      '<i class="kit-dress__rule"></i><i class="kit-dress__footscroll"></i>');
}

/**
 * The house, out there in the dark: Josh's own painting of it (UI/mainMenu.png)
 * hung in the Kid board's gold frame, the moon medallion on its top rail the
 * way the mirror wears one, a nameplate on its bottom rail. It is the window
 * of the treehouse the prompt for `lobby.png` asks for — the one thing every
 * Kid up here is looking at.
 */
function viewMarkup() {
  return `<figure class="lo-view" aria-hidden="true">
      <div class="lo-view__pic kit-frame kit-frame--over"><span class="lo-view__art" style="background-image:url('${menuArtSrc('menu')}')"></span></div>
      <i class="lo-view__medal"></i>
      <figcaption class="lo-view__plate kit-plate"><b class="kit-plate__name">The House</b><span class="kit-plate__epithet">somewhere out there in the dark</span></figcaption>
      <i class="kit-web lo-view__web"></i>
      <i class="kit-prop kit-prop--skull lo-view__skull"></i>
      <i class="kit-prop kit-prop--candle lo-view__candle"></i>
    </figure>`;
}

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
    /** The Companion portraits on the roster, destroyed on every repaint. */
    this._portraits = [];
    this._dead = false;
  }

  _dropPortraits() {
    for (const p of this._portraits) { try { p.destroy(); } catch { /* gone */ } }
    this._portraits.length = 0;
  }

  /** Lay the kit board on the root and hand back the element to build on. */
  _board(cls) {
    this._dropPortraits();
    this.root.innerHTML = '';
    const board = el('div', `${cls} lo-board kit-board`);
    board.innerHTML = boardMarkup();
    this.root.appendChild(board);
    paintBackdrop(board, 'lobby', () => !this._dead);
    return board;
  }

  /** The title plaque both states share: the wordmark's cartouche and ribbon. */
  _head(cls = '') {
    const head = el('header', `lo-head kit-titleblock${cls ? ` ${cls}` : ''}`);
    head.appendChild(el('span', 'lo-ribbon kit-ribbon', 'Play Together'));
    head.appendChild(el('h1', 'lo__title kit-cartouche__title', 'The Treehouse'));
    return head;
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

  /* ── the door: pick a room ────────────────────────────────────────────── */

  _renderDoor() {
    const suggested = coinRoom();
    /* A kit board: the title in the cartouche, the house in its frame on the
       left, the password on an engraved plate in a gold-railed panel on the
       right, and the board's two ways out along the foot — back down on the
       left, up the ladder on the right, each with its enamel button. */
    const wrap = this._board('lo__door');

    const head = this._head();
    head.appendChild(el('p', 'lo__sub kit-cartouche__sub', 'Climb up and wait for your friends.'));
    wrap.appendChild(head);

    /* The form is the body AND the foot, so "Climb up" can stand where every
       board keeps its way on (bottom right) and still submit the password. */
    const form = el('form', 'lo__form lo-body');
    const stage = el('div', 'lo-stage');
    stage.insertAdjacentHTML('beforeend', viewMarkup());

    /* THE PANEL READS IN ONE ORDER: the password, then the way to roll new
       words, then why it matters. The two words are the one thing on this
       board a player must carry to somebody else, so they are the biggest,
       brightest letters under the title, on the plate the candle is on; the
       explanation is a slip of paper pinned under them, in the shadow; and
       the seed the words hash to — a ten-digit number nobody says aloud —
       is not printed at all. The room still derives it (`seedFromRoom`). */
    const card = el('section', 'lo-card kit-panel kit-panel--damask');
    card.dataset.medal = 'star';
    card.setAttribute('aria-label', 'The password');
    card.appendChild(el('h2', 'lo-card__h kit-heading kit-heading--ribbon kit-heading--inline kit-heading--clasp',
      'The password <em>say it out loud</em>'));

    /* The field is an engraved nameplate: the word PASSWORD cut into its top
       edge and the two words lettered across it. */
    const plate = el('label', 'lo-plate');
    plate.appendChild(el('span', 'lo-plate__k', 'Password'));
    const input = el('input', 'lo__code');
    input.type = 'text';
    input.value = suggested;
    input.placeholder = 'say two words';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Password');
    input.maxLength = 40;
    plate.appendChild(input);
    card.appendChild(plate);

    const actions = el('div', 'lo-card__actions');
    const roll = el('button', 'lo__roll kit-btn kit-btn--quiet');
    roll.type = 'button';
    roll.innerHTML = `<i class="kit-medallion kit-btn__medal lo-knob" aria-hidden="true">${GLYPH.roll}</i><span>New password</span>`;
    roll.addEventListener('click', () => { input.value = coinRoom(); input.focus(); });
    actions.appendChild(roll);
    card.appendChild(actions);

    const slip = el('div', 'lo-slip kit-paper');
    slip.appendChild(el('i', 'lo-slip__pin kit-pin'));
    slip.firstChild.setAttribute('aria-hidden', 'true');
    slip.appendChild(el('p', 'lo__sub lo-card__lede',
      'Everyone who knows the password ends up in the same treehouse — and the '
      + 'password is the map, so the same words always draw the same house.'));
    card.appendChild(slip);

    if (!canChannel()) {
      /* Said plainly rather than left as a dead button. A browser without
         BroadcastChannel cannot reach the only wire that exists yet. */
      card.appendChild(el('p', 'lo__warn',
        'This browser has no BroadcastChannel, so nobody else can climb up. '
        + 'Two Kids on one screen still works from New Expedition.'));
    }

    stage.appendChild(card);
    form.appendChild(stage);

    const foot = el('div', 'lo-foot');
    const back = el('button', 'lo__back kit-btn kit-btn--quiet');
    back.type = 'button';
    back.innerHTML = `<i class="kit-medallion kit-medallion--ornate kit-btn__medal" aria-hidden="true">${GLYPH.back}</i><span>Back down</span>`;
    back.addEventListener('click', () => this.ctx.scenes?.go?.('title', {}));
    foot.appendChild(back);

    /* The way up: CLIMB UP over its epithet, the Enter key engraved after the
       epithet on the same small line, so neither crowds the other or the
       medallion at 1280. */
    const go = el('button', 'lo__enter kit-btn');
    go.type = 'submit';
    go.disabled = !canChannel();
    go.innerHTML = `<span>Climb up</span><em>up the rope ladder <kbd>Enter</kbd></em>`
      + `<i class="kit-medallion kit-medallion--ornate kit-btn__medal" aria-hidden="true">${GLYPH.onward}</i>`;
    foot.appendChild(go);
    form.appendChild(foot);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const room = tidyRoom(input.value);
      if (!room || !canChannel()) return;
      this._open(room);
    });

    wrap.appendChild(form);
    try { input.focus(); input.select(); } catch { /* focus is best-effort */ }
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

    /* FOCUS SURVIVES THE REPAINT (IVORY's, ui/r2-expand2-c). The wire repaints
       this whole board on every lobby message — somebody climbing up, somebody
       picking a Companion — and a player who had just tabbed to "I'm ready"
       was thrown back to the top of the page each time. Remember which control
       had focus, by its `lo__` class and its place among the controls sharing
       that class (both pickers are `.lo__pick`), and put focus back on its
       replacement, visibly only if it was visible. */
    const had = this._focusKey();

    const wrap = this._board('lo__room');

    const head = this._head('lo__head kit-titleblock--compact');
    head.appendChild(el('p', 'lo__code-out kit-cartouche__sub',
      `the password is <span>${this._room}</span>`));
    head.appendChild(el('p', 'lo__sub kit-titleblock__note',
      `You are ${l.seat + 1} of ${players.length} up here. `
      + 'Everybody sees the same order, and it is not the order you arrived in.'));
    wrap.appendChild(head);

    const body = el('main', 'lo-body lo-body--room');

    /* ── the roster ─────────────────────────────────────────────────────────
       Four seats, as four of the Companion board's portrait tiles: the pair
       in the Kid board's gold frame, their names on the dark nameplate under
       it, the seat's number in enamel on its top rail. An empty seat is the
       same frame with nobody in it. */
    const list = el('ul', 'lo__roster');
    for (const p of players) {
      const mine = p.id === l.me.id;
      const row = el('li', `lo__seat${mine ? ' is-me' : ''}${p.ready ? ' is-ready' : ''}`);
      row.appendChild(el('span', 'lo__n kit-medallion', String(players.indexOf(p) + 1)));
      const pic = el('div', 'lo-seat__pic kit-frame kit-frame--over');
      const art = el('div', 'lo-seat__art');
      const pf = companionPortrait({ slug: p.companion || 'marmalade', variant: '@2x', parallax: 0, shimmer: false });
      this._portraits.push(pf);
      art.appendChild(pf.el);
      const face = el('span', 'lo-seat__kid');
      const kid = KIDS.find(k => k.slug === p.kid);
      if (kid) {
        const img = kidPortrait(kid, { w: 192, h: 192, variant: 'thumb' });
        img.alt = '';
        face.appendChild(img);
      }
      art.appendChild(face);
      pic.appendChild(art);
      row.appendChild(pic);
      const plate = el('div', 'lo-seat__plate kit-plate');
      plate.appendChild(el('span', 'lo__who kit-plate__name',
        `${companionName(p.companion)} <i>&amp;</i> ${kidName(p.kid)}`
        + (mine ? ' <b>(you)</b>' : '')));
      plate.appendChild(el('span', 'lo__state kit-plate__epithet', p.ready ? 'ready' : 'choosing…'));
      row.appendChild(plate);
      list.appendChild(row);
    }
    for (let i = players.length; i < MAX_PARTY; i++) {
      list.appendChild(el('li', 'lo__seat is-empty',
        `<span class="lo__n kit-medallion">${i + 1}</span>`
        + '<div class="lo-seat__pic kit-frame kit-frame--over"><div class="lo-seat__art"></div></div>'
        + '<div class="lo-seat__plate kit-plate"><span class="lo__who kit-plate__name">nobody up here yet</span></div>'));
    }
    body.appendChild(list);

    /* ── your choice ────────────────────────────────────────────────────── */
    const mineRow = el('div', 'lo__mine kit-panel');
    mineRow.dataset.medal = 'paw';
    mineRow.appendChild(el('h2', 'lo-mine__h kit-heading kit-heading--ribbon kit-heading--inline kit-heading--clasp',
      'Who you bring <em>up the ladder</em>'));

    const cSel = el('select', 'lo__pick');
    cSel.setAttribute('aria-label', 'Your Companion');
    for (const slug of pickableCompanions()) {
      const o = el('option', '', `${companionName(slug)}${isStarter(slug) ? ' (starter)' : ''}`);
      o.value = slug;
      if (slug === l.me.companion) o.selected = true;
      cSel.appendChild(o);
    }
    const kSel = el('select', 'lo__pick');
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
    /* Each picker is a nameplate with its label engraved on its top edge, the
       same plate the password is lettered on at the door. */
    const pickPlate = (label, sel) => {
      const pl = el('label', 'lo-plate lo-plate--pick');
      pl.appendChild(el('span', 'lo-plate__k', label));
      pl.appendChild(sel);
      return pl;
    };
    mineRow.appendChild(pickPlate('Companion', cSel));
    mineRow.appendChild(pickPlate('Kid', kSel));

    /* ── ready ──────────────────────────────────────────────────────────── */
    const ready = el('button', `lo__ready kit-btn${l.me.ready ? ' is-on' : ' kit-btn--quiet'}`);
    ready.innerHTML = `<i class="kit-medallion kit-btn__medal lo-knob" aria-hidden="true">${GLYPH.ready}</i>`
      + `<span>${l.me.ready ? 'Ready' : `I'm ready`}</span>`;
    ready.type = 'button';
    ready.setAttribute('aria-pressed', String(!!l.me.ready));
    ready.addEventListener('click', () => {
      this._lobby.setReady(!l.me.ready);
      try { this.ctx.audio?.play?.('ui:confirm'); } catch { /* audio is best-effort */ }
    });
    mineRow.appendChild(ready);
    body.appendChild(mineRow);
    wrap.appendChild(body);

    /* ── the ways out: back down, and in together ───────────────────────── */
    const foot = el('div', 'lo__foot lo-foot');

    const leave = el('button', 'lo__back kit-btn kit-btn--quiet');
    leave.type = 'button';
    leave.innerHTML = `<i class="kit-medallion kit-medallion--ornate kit-btn__medal" aria-hidden="true">${GLYPH.back}</i><span>Back down</span>`;
    leave.addEventListener('click', () => this.ctx.scenes?.go?.('title', {}));
    foot.appendChild(leave);

    /**
     * ONLY THE HOST HAS THIS BUTTON, and that is not the same as the host
     * having authority. `go()` broadcasts LOBBY.GO and every client runs the
     * identical `start()` off it, computing the same seats and the same seed
     * from state it already had. Somebody has to press something; nobody
     * decides anything.
     */
    if (l.isHost) {
      const enough = players.length >= 2;
      const start = el('button', 'lo__go kit-btn');
      start.innerHTML = `<span>Go in together</span><em>${!enough ? 'waiting for somebody else'
        : !l.allReady ? 'waiting for everyone to be ready' : 'down the ladder and in'}</em>`
        + `<i class="kit-medallion kit-medallion--ornate kit-btn__medal" aria-hidden="true">${GLYPH.onward}</i>`;
      start.type = 'button';
      start.disabled = !(enough && l.allReady);
      start.classList.toggle('is-ready', !start.disabled);
      start.title = !enough ? 'Waiting for somebody else to climb up'
        : !l.allReady ? 'Waiting for everyone to be ready'
        : 'Down the ladder and into the house';
      start.addEventListener('click', () => {
        try { this.ctx.audio?.play?.('ui:begin'); } catch { /* audio is best-effort */ }
        this._lobby.go();
      });
      foot.appendChild(start);
    } else {
      foot.appendChild(el('p', 'lo__wait kit-enamel kit-enamel--dark',
        '<i class="kit-enamel__label">Whoever is first on the list says when to go.</i>'));
    }

    wrap.appendChild(foot);
    try { rovingFocus?.(wrap); } catch { /* keyboard nav is an enhancement */ }
    this._restoreFocus(had);
  }

  /** Which control has focus on this board, as something a rebuild can find. */
  _focusKey() {
    const a = document.activeElement;
    if (!a || !this.root || !this.root.contains(a)) return null;
    const cls = [...a.classList].find((c) => c.startsWith('lo__'));
    if (!cls) return null;
    const same = [...this.root.querySelectorAll(`.${cls}`)];
    let visible = false;
    try { visible = a.matches(':focus-visible'); } catch { /* older engines */ }
    return { cls, i: Math.max(0, same.indexOf(a)), visible };
  }

  _restoreFocus(key) {
    if (!key || !this.root) return;
    const next = this.root.querySelectorAll(`.${key.cls}`)[key.i];
    if (!next || next.disabled) return;
    try { next.focus({ preventScroll: true, focusVisible: key.visible }); } catch { /* focus is best-effort */ }
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
    this._dead = true;
    this._dropPortraits();
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
    if (this.root) this.root.innerHTML = '';
  }
}
