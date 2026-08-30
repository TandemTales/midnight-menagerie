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
import { Lobby, seedFromRoom } from '../net/lobby.js';
import { Session } from '../net/session.js';
import { ChannelTransport, canChannel } from '../net/transport.js';
import {
  ensureCss, el, rovingFocus, reduceMotion,
  availableCompanions, isStarter, warmFaces,
} from '../ui/portrait.js';
import { pauseStageFor } from './_stage.js';

const CSS_KIT   = new URL('../ui/portrait.css', import.meta.url).href;
const CSS_LOBBY = new URL('./lobby.css', import.meta.url).href;

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

  /* ── the door: pick a room ────────────────────────────────────────────── */

  _renderDoor() {
    const suggested = coinRoom();
    this.root.innerHTML = '';
    const wrap = el('div', 'lo__door');

    wrap.appendChild(el('h1', 'lo__title', 'The Treehouse'));
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

    const form = el('form', 'lo__form');
    const input = el('input', 'lo__code');
    input.type = 'text';
    input.value = suggested;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Password');
    input.maxLength = 40;

    const go = el('button', 'lo__enter', 'Climb up');
    go.type = 'submit';
    go.disabled = !canChannel();

    const roll = el('button', 'lo__roll', 'New password');
    roll.type = 'button';
    roll.addEventListener('click', () => { input.value = coinRoom(); input.focus(); });

    form.appendChild(input);
    form.appendChild(roll);
    form.appendChild(go);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const room = tidyRoom(input.value);
      if (!room || !canChannel()) return;
      this._open(room);
    });

    wrap.appendChild(form);

    const back = el('button', 'lo__back', '← Back down');
    back.type = 'button';
    back.addEventListener('click', () => this.ctx.scenes?.go?.('title', {}));
    wrap.appendChild(back);

    this.root.appendChild(wrap);
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
    });

    this._offs.push(this._lobby.on('change', () => this._paintRoom()));
    this._offs.push(this._lobby.on('start', (roster) => this._launch(roster)));
    this._paintRoom();
  }

  _paintRoom() {
    if (!this._lobby || this._launching) return;
    const l = this._lobby;
    const players = l.players;

    this.root.innerHTML = '';
    const wrap = el('div', 'lo__room');

    const head = el('header', 'lo__head');
    head.appendChild(el('h1', 'lo__title', 'The Treehouse'));
    head.appendChild(el('p', 'lo__code-out',
      `<span>${this._room}</span> · seed ${seedFromRoom(this._room)}`));
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
      this._lobby.setChoice({ companion: cSel.value, kid: kSel.value, name: l.me.name });
    };
    cSel.addEventListener('change', onPick);
    kSel.addEventListener('change', onPick);
    mineRow.appendChild(cSel);
    mineRow.appendChild(kSel);
    wrap.appendChild(mineRow);

    /* ── ready, and go ──────────────────────────────────────────────────── */
    const foot = el('div', 'lo__foot');

    const ready = el('button', `lo__ready${l.me.ready ? ' is-on' : ''}`,
      l.me.ready ? 'Ready' : `I'm ready`);
    ready.type = 'button';
    ready.setAttribute('aria-pressed', String(!!l.me.ready));
    ready.addEventListener('click', () => {
      this._lobby.setReady(!l.me.ready);
      try { this.ctx.audio?.play?.('ui:confirm'); } catch { /* audio is best-effort */ }
    });
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
      const start = el('button', 'lo__go', 'Go in together');
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

    const leave = el('button', 'lo__back', '← Back down');
    leave.type = 'button';
    leave.addEventListener('click', () => this.ctx.scenes?.go?.('title', {}));
    foot.appendChild(leave);

    wrap.appendChild(foot);
    this.root.appendChild(wrap);
    try { rovingFocus?.(wrap); } catch { /* keyboard nav is an enhancement */ }
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

    const payload = {
      seed: roster.seed,
      haunt: Save.hauntLevelFor(roster.seats),
      kids: roster.party.map(p => ({ companion: p.companion, kid: p.kid })),
    };

    const off = bus.on('run:ready', ({ run }) => {
      try { off(); } catch { /* already gone */ }
      if (!run) return;
      const session = new Session({
        transport: this._transport, seat: roster.seat,
        seats: roster.seats, seed: roster.seed, host: roster.host,
      });
      session.attach(run);
      /* The transport now belongs to the Session. `exit()` must not close it,
         which is what `_launching` is for. */
      this._transport = null;
    });

    bus.emit('run:start', payload);
    this.root.classList.add('is-leaving');
    const go = () => this.ctx.scenes?.go?.('map', payload);
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
    if (this.root) this.root.innerHTML = '';
  }
}
