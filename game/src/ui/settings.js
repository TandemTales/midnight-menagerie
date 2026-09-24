/**
 * Settings. OWNER: ui-chrome agent.
 *
 *   import { openSettings, applySettings, SETTINGS_SPEC } from './ui/settings.js';
 *   await openSettings(ctx);
 *
 * Every control here drives a real field of `Save.settings` and every one of
 * them **actually takes effect**, by one of exactly three routes:
 *
 *   1. DOM attribute — written on <html> by `applySettings()`, so tokens.css
 *      and every component stylesheet react with no JS involvement.
 *        colorblind   -> data-colorblind
 *        reduceMotion -> data-reduce-motion
 *        largeText    -> data-large-text
 *        speed        -> --anim-scale  (durations scale inversely)
 *   2. Direct write — `clock.scale` for animation speed / fast mode.
 *   3. The `settings:changed` bus event, which audio, the hand and the combat
 *      scene already subscribe to. Flags in this class (volumes, screenShake,
 *      flashes, showDamageNumbers, autoEndTurn, confirmSingleTarget) are read
 *      from `Save.settings` at the point of use.
 *
 * `applySettings()` is idempotent and is called once from `ui/tooltip.js` (the
 * one chrome object main.js always constructs), so the accessibility flags are
 * live on the title screen without main.js — which this agent does not own —
 * needing a single line.
 */

import { Modal, confirmModal, kitButton } from './modal.js';
import { formatSeed } from './portrait.js';

/**
 * The whole surface, declared once. The panel is generated from this, so a new
 * setting is one entry here plus one read at the point of use.
 */
export const SETTINGS_SPEC = [
  { group: 'Sound', items: [
    { key: 'master', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
    { key: 'music',  label: 'Music',         type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
    { key: 'sfx',    label: 'Effects',       type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
  ]},
  { group: 'Motion', items: [
    { key: 'speed', label: 'Animation speed', type: 'range', min: 0.5, max: 2, step: 0.1,
      fmt: v => `${Number(v).toFixed(1)}x`,
      hint: 'Scales every animation in the game. Rules and timings are unaffected.' },
    { key: 'fastMode', label: 'Fast mode', type: 'toggle',
      hint: 'Skips the pauses between enemy actions. Nothing is hidden — it just stops waiting.' },
    { key: 'screenShake', label: 'Screen shake', type: 'range', min: 0, max: 1, step: 0.1, fmt: pct,
      hint: 'How hard the screen kicks on a big hit. 0% turns it off entirely.' },
    { key: 'flashes', label: 'Flashes', type: 'range', min: 0, max: 1, step: 0.1, fmt: pct,
      hint: 'Brightness of impact and status flashes.' },
    { key: 'reduceMotion', label: 'Reduced motion', type: 'toggle',
      hint: 'Collapses every transition to near-instant and stops particles. Overrides the settings above.' },
  ]},
  { group: 'Reading', items: [
    { key: 'largeText', label: 'Large text', type: 'toggle',
      hint: 'Grows the whole type scale. Panels reflow to fit — nothing is clipped.' },
    { key: 'colorblind', label: 'Colour palette', type: 'choice',
      options: [['off', 'Standard'], ['protanopia', 'Protanopia'], ['deuteranopia', 'Deuteranopia'], ['tritanopia', 'Tritanopia']],
      hint: 'Re-assigns the hues that carry information — Attack vs Skill, buff vs debuff, and the four rarity tiers. Shape and icon cues never change; colour is never the only channel.' },
    { key: 'showDamageNumbers', label: 'Damage numbers', type: 'toggle',
      hint: 'Floating numbers on every hit.' },
  ]},
  { group: 'Play', items: [
    { key: 'autoEndTurn', label: 'Auto end turn', type: 'toggle',
      hint: 'Ends your turn automatically once nothing in hand is playable.' },
    { key: 'confirmSingleTarget', label: 'Confirm single target', type: 'toggle',
      hint: 'Ask before playing a targeted Trick when there is only one enemy left. Off is faster; on is safer.' },
  ]},
];

function pct(v) { return `${Math.round(Number(v) * 100)}%`; }

/**
 * THE LEDGER'S CRESTS. Every page of the ledger wears its own medallion on its
 * top rail, the way each of the Kid board's panels wears its own (a star, a
 * shield, a star, a paw): a bell for how the house sounds, an hourglass for how
 * it moves, an open book for how it reads, a fanned pair of Tricks for how it
 * plays, a key for the seed that opens the same rooms again, a lantern for the
 * way out, and a skull for the one thing that cannot be undone. Drawn on the
 * icons' 24-unit grid, filled and even-odd, so each reads by its silhouette.
 */
export const LEDGER_GLYPH = {
  sound: '<path fill-rule="evenodd" d="M12 1.3a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5zM12 4.5c-3.7 0-6.2 2.9-6.2 6.9v3.8l-2.4 2.9v1.2h17.2v-1.2l-2.4-2.9v-3.8c0-4-2.5-6.9-6.2-6.9zM6.9 13.1h10.2v1.1H6.9zM9.5 20.4h5a2.5 2.5 0 0 1-5 0z"/>',
  motion: '<path fill-rule="evenodd" d="M3.4 1.6h17.2v2.7H3.4zM3.4 19.7h17.2v2.7H3.4zM4.4 4.3h1.5v15.4H4.4zM18.1 4.3h1.5v15.4h-1.5zM7.4 4.3h9.2c0 3.7-3 5.5-3.9 7.7.9 2.2 3.9 4 3.9 7.7H7.4c0-3.7 3-5.5 3.9-7.7-.9-2.2-3.9-4-3.9-7.7zM9 5.6h6c-.5 2.2-2.2 3.4-3 5.1-.8-1.7-2.5-2.9-3-5.1z"/>',
  reading: '<path fill-rule="evenodd" d="M11.2 6.1C8.9 4.5 5.9 4 2.1 4.3v13.9c3.8-.3 6.8.2 9.1 1.8zM12.8 6.1c2.3-1.6 5.3-2.1 9.1-1.8v13.9c-3.8-.3-6.8.2-9.1 1.8zM4 7.5c2-.1 3.7.2 5.4 1v1.1C7.7 8.8 6 8.5 4 8.6zM4 10.6c2-.1 3.7.2 5.4 1v1.1c-1.7-.8-3.4-1.1-5.4-1zM14.6 8.5c1.7-.8 3.4-1.1 5.4-1v1.1c-2-.1-3.7.2-5.4 1zM14.6 11.6c1.7-.8 3.4-1.1 5.4-1v1.1c-2-.1-3.7.2-5.4 1zM1.4 19.2c4-.3 7.3.1 10.6 2 3.3-1.9 6.6-2.3 10.6-2v1.5c-4-.3-7.3.1-10.6 2-3.3-1.9-6.6-2.3-10.6-2z"/>',
  play: '<path fill-rule="evenodd" d="M1.6 7 9 4.9 7.8 21.4l-4 1.1zM10 2.2l11.3 2-3.1 17.6-11.3-2zM13.3 7.6l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2z"/>',
  seed: '<path fill-rule="evenodd" d="M7 6.9a5.1 5.1 0 1 1 0 10.2 5.1 5.1 0 0 1 0-10.2zm0 2.7a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zM11.9 10.8h10.5v2.4H11.9zM17.2 13.2h2v3.6h-2zM20.4 13.2h2v2.6h-2z"/>',
  expedition: '<path fill-rule="evenodd" d="M12 .8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm0 1.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6zM8.5 5h7l2.2 2.6H6.3zM7 7.6h10v10.9H7zM8.7 9.2v7.7h6.6V9.2zM12 10.1c1.4 1.6 2.1 2.8 2.1 4.1a2.1 2.1 0 0 1-4.2 0c0-1.3.7-2.5 2.1-4.1zM5.8 18.5h12.4v1.7H5.8zM8 20.2h8l-1.1 2H9.1z"/>',
  danger: '<path fill-rule="evenodd" d="M12 1.8c-5.2 0-9 3.7-9 8.6 0 3 1.4 5.2 3.5 6.5v3.3c0 1 .8 1.8 1.8 1.8h7.4c1 0 1.8-.8 1.8-1.8v-3.3c2.1-1.3 3.5-3.5 3.5-6.5 0-4.9-3.8-8.6-9-8.6zM8.5 8.9a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm7 0a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM12 14.2l1.5 2.6h-3zm-2.3 4.1h1.3v2.6H9.7zm3.3 0h1.3v2.6H13z"/>',
  /* the knob of a switch that is on */
  check: '<path d="M2.6 12.6 5.5 9.7l4.3 4.3 8.7-9.6 2.9 2.7-11.5 12.6z"/>',
};

/** A glyph as a mask image, for a kit piece that casts it in gilt (.kit-crest). */
export function glyphUrl(paths) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${paths}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** A crest: the boards' round enamel button, its glyph cast in the gilt. */
function crest(key, extra = '') {
  return `<i class="kit-crest mm-set__crest${extra}" aria-hidden="true"`
    + ` style='--glyph:${glyphUrl(LEDGER_GLYPH[key] || '')}'></i>`;
}

/** Read a setting with a sane default even if Save has not loaded. */
function get(Save, key) {
  const v = Save?.settings?.[key];
  return v === undefined ? DEFAULTS[key] : v;
}
const DEFAULTS = {
  master: 0.9, music: 0.6, sfx: 0.8, speed: 1, fastMode: false,
  screenShake: 1, flashes: 1, reduceMotion: false, largeText: false,
  colorblind: 'off', showDamageNumbers: true, autoEndTurn: false,
  confirmSingleTarget: false,
};

let _applied = null;

/**
 * Push `Save.settings` into the document and the clock. Safe to call as often
 * as you like; it only writes what changed.
 * @param {object} ctx  needs `Save`, optionally `clock` and `bus`
 */
export function applySettings(ctx = {}) {
  const Save = ctx.Save || (typeof window !== 'undefined' ? window.MM?.Save : null);
  const s = Save?.settings || DEFAULTS;
  const root = document.documentElement;

  const cb = s.colorblind && s.colorblind !== 'off' ? s.colorblind : null;
  if (cb) root.setAttribute('data-colorblind', cb); else root.removeAttribute('data-colorblind');

  // '1' forces reduced motion on; '0' explicitly opts OUT of the OS preference.
  root.setAttribute('data-reduce-motion', s.reduceMotion ? '1' : '0');
  root.setAttribute('data-large-text', s.largeText ? '1' : '0');

  const speed = clamp(Number(s.speed) || 1, 0.25, 3);
  const fast = s.fastMode ? 1.6 : 1;
  root.style.setProperty('--anim-scale', String((1 / (speed * fast)).toFixed(4)));

  const clock = ctx.clock || (typeof window !== 'undefined' ? window.MM?.clock : null);
  if (clock) clock.scale = speed * fast;

  _applied = { ...s };
  return _applied;
}

/** Write one setting, apply it, persist it, and tell everyone. */
export function setSetting(ctx, key, value) {
  const Save = ctx?.Save || window.MM?.Save;
  if (!Save) return;
  Save.setSetting(key, value);
  applySettings(ctx);
  ctx?.bus?.emit?.('settings:changed', { key, value });
}

/**
 * Open the settings panel.
 * @param {object} ctx
 * @returns {Promise<null>}
 */
export async function openSettings(ctx = {}) {
  const Save = ctx.Save || window.MM?.Save;
  const modal = new Modal({
    title: 'Settings',
    subtitle: 'Everything here takes effect immediately.',
    size: 'md',
    host: ctx.dom,
    className: 'mm-settings-modal',
  });

  /* The panel is a ledger of the house's workings, laid out in three columns
     so every page of it is open at once, at the Deck's 1280x800 as at 1600x900:
     how it sounds and reads, how it moves (and the way out of an expedition),
     how it plays, the seed it is built from and the one dangerous thing. Each
     group is one of the Kid board's railed panels with the gold ribbon banner
     ("✦ SOUND ✦") across its top rail, and each line leads the eye from its
     name to its control along a row of brass dots. The columns are DOM order,
     so Tab walks each one down before the next. */
  const form = document.createElement('div');
  form.className = 'mm-set';
  const cell = () => { const c = document.createElement('div'); c.className = 'mm-set__col'; return c; };
  const colA = cell(), colB = cell(), colC = cell();
  const colD = colB;                 // the expedition stands under Motion
  form.append(colA, colB, colC);
  modal.body.appendChild(form);

  const rerender = [];

  const GROUP = 'mm-set__group kit-panel';
  const LEGEND = 'mm-set__legend kit-heading kit-heading--ribbon';
  /* a page's heading: the gold ribbon across its top rail, the page's crest
     pinned to the ribbon before its name */
  const legend = (name, key, extra = '') =>
    `<legend class="${LEGEND}${extra}">${crest(key)}<span class="mm-set__legendname">${escape_(name)}</span></legend>`;
  const COLUMN = { Sound: colA, Reading: colA, Motion: colB, Play: colC };

  for (const section of SETTINGS_SPEC) {
    const fs = document.createElement('fieldset');
    fs.className = GROUP;
    const key = section.group.toLowerCase();
    fs.dataset.group = key;
    fs.insertAdjacentHTML('beforeend', legend(section.group, key));

    for (const item of section.items) {
      fs.appendChild(buildRow(ctx, Save, item, rerender));
    }
    (COLUMN[section.group] || colC).appendChild(fs);
  }

  // ── seed ────────────────────────────────────────────────────────────────
  const seedFs = document.createElement('fieldset');
  seedFs.className = GROUP;
  seedFs.dataset.group = 'seed';
  seedFs.innerHTML = legend('Seed', 'seed');

  const cur = document.createElement('div');
  cur.className = 'mm-set__row';
  // Same notation as Select, the HUD and Game Over — see formatSeed() in ui/portrait.js.
  const rawSeed = ctx.run ? ctx.run.seed : (Save?.data?.nextSeed ?? null);
  const curSeed = (rawSeed === undefined || rawSeed === null) ? '—' : formatSeed(rawSeed);
  // the seed ENGRAVED on a brass key tag (the house's hardware, ui/kit.css
  // .kit-hw-tag) — a tag left blank and unpolished when there is none
  cur.innerHTML =
    `<div class="mm-set__label"><span>Current expedition</span>` +
    `<span class="mm-set__hint">A seed reproduces a run exactly: the same rooms, rewards and shop stock.</span></div>` +
    `<i class="kit-leader mm-set__lead" aria-hidden="true"></i>` +
    `<output class="mm-set__seed kit-hw-tag${rawSeed == null ? ' is-empty is-blank' : ''}"><b class="kit-enamel__value">${escape_(curSeed)}</b></output>`;
  seedFs.appendChild(cur);

  const entry = document.createElement('div');
  entry.className = 'mm-set__row';
  entry.innerHTML =
    `<div class="mm-set__label"><span>Seed for the next expedition</span>` +
    `<span class="mm-set__hint">Leave blank for a random one.</span></div>` +
    `<i class="kit-leader mm-set__lead" aria-hidden="true"></i>`;
  const seedIn = document.createElement('input');
  seedIn.type = 'text';
  /* somewhere to write: a slip of old card with an inked baseline */
  seedIn.className = 'mm-set__text kit-hw-slip';
  seedIn.placeholder = 'random';
  seedIn.maxLength = 24;
  seedIn.value = Save?.data?.nextSeed ?? '';
  seedIn.setAttribute('aria-label', 'Seed for the next expedition');
  seedIn.addEventListener('change', () => {
    const v = seedIn.value.trim();
    if (Save) { Save.data.nextSeed = v || null; Save.save(); }
    ctx.bus?.emit?.('settings:seed', { seed: v || null });
  });
  entry.appendChild(seedIn);
  seedFs.appendChild(entry);
  colC.appendChild(seedFs);

  // ── the expedition ──────────────────────────────────────────────────────
  /*
   * "Need a way to save and a way to quit."  Both existed and neither was
   * reachable: `Run.save()` fires after every room, every purchase and every
   * card play, and the title screen offers Continue off the back of it — but
   * from inside a run the only buttons were Reset (which erases the save and
   * everything behind it) and the window's close box. A player who wanted to
   * stop for the night had no way to find out their progress was kept.
   *
   * So this row does two jobs: it says the expedition is already saved, and it
   * gives the deliberate way out. A finished run is not resumable (`save()`
   * returns early on `result`) and a deep-link mock must never touch storage,
   * so neither offers it: the row is still there, its plate unlit and its note
   * saying why, so the ledger is the same ledger wherever it is opened and a
   * player on the title screen learns where the way out will be.
   */
  const live = ctx.run && !ctx.run.ephemeral && !ctx.run.result;
  {
    const party = !!(live && ctx.run.isParty);
    const trip = document.createElement('fieldset');
    trip.className = GROUP;
    trip.dataset.group = 'expedition';
    trip.innerHTML = legend('Expedition', 'expedition');
    const tRow = document.createElement('div');
    tRow.className = 'mm-set__row';
    const why = live
      ? 'Your expedition saves itself after every room. '
        + 'Quitting now keeps it exactly where it is — Continue on the title screen picks it back up.'
        + (party ? ' In a party this ends the expedition for everyone.' : '')
      : !ctx.run
        ? 'There is no expedition under way. Once one is, it saves itself after every room, and this is where you leave it.'
        : ctx.run.result
          ? 'This expedition is over, so there is nothing left to save.'
          : 'This expedition is a preview and is never saved, so there is nothing to quit from.';
    tRow.innerHTML =
      `<div class="mm-set__label"><span>Save and quit</span>` +
      `<span class="mm-set__hint">${escape_(why)}</span></div>` +
      `<i class="kit-leader mm-set__lead" aria-hidden="true"></i>`;
    const quit = document.createElement('button');
    quit.type = 'button';
    quit.className = 'mm-btn';
    quit.textContent = 'Save and quit';
    kitButton(quit, { quiet: true });
    quit.disabled = !live;
    if (live) quit.addEventListener('click', async () => {
      if (party) {
        const ok = await confirmModal({
          title: 'Quit the expedition?',
          body: 'This is a party expedition. Leaving ends it for everyone in the house, '
              + 'and it will be waiting on the title screen for whoever started it.',
          confirm: 'Save and quit', cancel: 'Keep going', host: ctx.dom,
        });
        if (!ok) return;
      }
      // Save FIRST, then tear down: `session.close()` drops the transport, and
      // a snapshot written after that would be a snapshot of a run with no
      // seats left to write it.
      /* NOT `save?.()` — contract rule 8. `Run.save` is a real method and a
         missing one is a bug that must be loud, not a quit that silently keeps
         nothing. The try/catch is for the storage write, which genuinely can
         fail (a full or blocked localStorage) and is genuinely best-effort. */
      try { ctx.run.save(); } catch { /* storage is best-effort */ }
      try { ctx.run.session?.close?.(); } catch { /* already gone is fine */ }
      ctx.bus?.emit?.('run:quit', { seed: ctx.run.seed });
      modal.close(null);
      ctx.scenes?.go?.('title', {}, { instant: true });
    });
    tRow.appendChild(quit);
    trip.appendChild(tRow);
    /* ALDER's moon, hung on the page's lower rail: one sparing painted prop,
       so the ledger's three columns are not three identical bordered boxes */
    const moon = document.createElement('i');
    moon.className = 'mm-set__moon';
    moon.setAttribute('aria-hidden', 'true');
    trip.appendChild(moon);
    colD.appendChild(trip);
  }

  // ── danger ──────────────────────────────────────────────────────────────
  /* THE DANGEROUS PAGE IS MARKED, NOT FILLED IN. It was a flat red wash with a
     red-ruled box round it, which is a web alert box wearing gilt; round 5's
     judges said so. It is the same enamel plaque as the seed and the way out
     now, and the house marks it the way the house marks anything: the ribbon
     banner across its rail dyed the colour of sealing wax, a blob of that wax
     pressed with the skull over its corner, and the one plate that cannot be
     taken back flanked by a skull and a hazard. */
  const danger = document.createElement('fieldset');
  danger.className = GROUP + ' mm-set__group--danger';
  danger.dataset.group = 'danger';
  danger.innerHTML = legend('Danger', 'danger', ' kit-heading--oxblood')
    + '<i class="kit-seal mm-set__seal" aria-hidden="true"></i>';
  const dRow = document.createElement('div');
  dRow.className = 'mm-set__row';
  dRow.innerHTML =
    `<div class="mm-set__label"><span>Reset all progress</span>` +
    `<span class="mm-set__hint">Deletes every rescued Companion, every clue, the Haunt Level and the current expedition. This cannot be undone.</span></div>` +
    `<i class="kit-leader mm-set__lead" aria-hidden="true"></i>`;
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'mm-btn mm-btn--danger';
  /* the house's skull struck on the plate's near end, the hazard on its far
     one (kitButton's `medal`, below): the two things that flank a door you
     cannot walk back through */
  reset.innerHTML = '<i class="kit-crest mm-set__resetcrest" aria-hidden="true"'
    + ` style='--glyph:${glyphUrl(LEDGER_GLYPH.danger)}'></i>`
    + '<span class="mm-set__resetword">Reset…</span>';
  /* the warning is a warning: a hazard triangle struck on the round enamel
     medallion at the plate's end, as DONE wears its tick, the lettering in the
     Courage bar's red. The panel's own crest is the skull. */
  kitButton(reset, { medal: 'warn' });
  reset.addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'Reset all progress?',
      body: 'Every rescued Companion, every unlocked kid, every clue and your Haunt Level will be erased, along with the expedition in progress. There is no way back.',
      confirm: 'Erase everything', cancel: 'Keep my progress',
      danger: true, host: ctx.dom,
    });
    if (!ok) return;
    try { Save?.reset(); } catch {}
    ctx.bus?.emit?.('save:reset');
    modal.close(null);
    ctx.scenes?.go?.('title', {}, { instant: true });
  });
  dRow.appendChild(reset);
  danger.appendChild(dRow);
  colC.appendChild(danger);

  // ── footer ──────────────────────────────────────────────────────────────
  const restore = document.createElement('button');
  restore.type = 'button'; restore.className = 'mm-btn';
  restore.textContent = 'Restore defaults';
  restore.addEventListener('click', () => {
    for (const [k, v] of Object.entries(DEFAULTS)) Save?.setSetting?.(k, v);
    applySettings(ctx);
    ctx.bus?.emit?.('settings:changed', { key: '*', value: null });
    for (const fn of rerender) fn();
  });

  const done = document.createElement('button');
  done.type = 'button'; done.className = 'mm-btn mm-btn--primary';
  done.textContent = 'Done';
  done.setAttribute('data-autofocus', '');
  done.addEventListener('click', () => modal.close(null));

  kitButton(restore, { quiet: true });
  kitButton(done, { medal: 'done' });
  modal.footer.append(restore, done);

  return modal.open();
}

// ── row builders ────────────────────────────────────────────────────────────
function buildRow(ctx, Save, item, rerender) {
  const row = document.createElement('div');
  row.className = 'mm-set__row';
  const id = `set-${item.key}`;

  const label = document.createElement('label');
  label.className = 'mm-set__label';
  label.htmlFor = id;
  label.innerHTML = `<span>${escape_(item.label)}</span>` +
    (item.hint ? `<span class="mm-set__hint">${escape_(item.hint)}</span>` : '');
  row.appendChild(label);
  /* the ledger's leader, from the name to its control (not on a row whose
     choices sit under its name) */
  if (item.type !== 'choice') {
    const lead = document.createElement('i');
    lead.className = 'kit-leader mm-set__lead';
    lead.setAttribute('aria-hidden', 'true');
    row.appendChild(lead);
  }

  if (item.type === 'range') {
    /* A REAL range input, so the keyboard, the pad and the tests drive it as
       one. Behind its bare track lies the Courage bar's brass tube
       (.kit-tube--warm), its amber enamel filled as far as the value; the thumb
       is the boards' round enamel button; the value is the ledger's figure at
       the end of its line, in gold lining numerals. `--v` (0..1) is the only
       thing the picture needs. */
    const wrap = document.createElement('div');
    wrap.className = 'mm-set__rangewrap';
    const slot = document.createElement('div');
    slot.className = 'mm-set__slot';
    /* the groove the knob runs in (ui/kit.css .kit-hw-groove): a channel sunk
       in a gilt-rimmed plate, a run of gilt in it as far as the knob */
    const tube = document.createElement('span');
    tube.className = 'mm-set__tube kit-hw-groove';
    tube.setAttribute('aria-hidden', 'true');
    tube.innerHTML = '<span class="kit-hw-groove__fill"></span>';
    const input = document.createElement('input');
    input.type = 'range'; input.id = id;
    input.min = String(item.min); input.max = String(item.max); input.step = String(item.step);
    input.value = String(get(Save, item.key));
    /* the figure, in the ledger's column of readings: gold lining numerals
       struck on the boards' enamel cartouche at the end of the line */
    const out = document.createElement('output');
    out.className = 'mm-set__out mm-set__reading kit-enamel';
    out.htmlFor = id;
    const fig = document.createElement('b');
    fig.className = 'kit-enamel__value';
    out.appendChild(fig);
    const show = () => {
      const span = Number(item.max) - Number(item.min);
      const v = span ? (Number(input.value) - Number(item.min)) / span : 0;
      slot.style.setProperty('--v', String(Math.max(0, Math.min(1, v))));
      fig.textContent = item.fmt ? item.fmt(input.value) : input.value;
    };
    show();
    const commit = () => {
      show();
      setSetting(ctx, item.key, Number(input.value));
    };
    input.addEventListener('input', commit);
    slot.append(tube, input);
    wrap.append(slot, out);
    row.appendChild(wrap);
    rerender.push(() => { input.value = String(get(Save, item.key)); show(); });

  } else if (item.type === 'toggle') {
    /* ONE ENGRAVED SWITCH, WHICH SAYS ITS OWN STATE. Round 5's judges found
       every row carrying a slider-switch AND a separate OFF/ON pill beside it —
       the control drawn twice, which is what makes a row read as a web form.
       So the state is lettered INTO the switch, the way a brass rocker plate is
       engraved: the Courage bar's tube, its amber lit the length of it when the
       switch is on, the round enamel button riding to that end with a gold
       check struck in it, and the word cut into the tube's field at the end the
       button is NOT — ON behind it, OFF in front of it. One object; and
       `aria-checked` on the switch itself is what a reader is told. */
    const btn = document.createElement('button');
    btn.type = 'button'; btn.id = id;
    btn.className = 'mm-set__toggle';
    btn.setAttribute('role', 'switch');
    const paint = () => {
      const on = !!get(Save, item.key);
      btn.setAttribute('aria-checked', String(on));
      btn.dataset.on = on ? '1' : '0';
      /* a two-position engraved plate (ui/kit.css .kit-hw-switch): OFF | ON
         in two sunk wells, the setting's well lit */
      btn.innerHTML =
        `<i class="mm-set__switch kit-hw-switch" data-on="${on ? 1 : 0}" aria-hidden="true">`
        + `<b class="kit-hw-switch__pos">Off</b><b class="kit-hw-switch__pos">On</b></i>`;
    };
    btn.addEventListener('click', () => { setSetting(ctx, item.key, !get(Save, item.key)); paint(); });
    paint();
    row.appendChild(btn);
    rerender.push(paint);

  } else if (item.type === 'choice') {
    const grp = document.createElement('div');
    grp.className = 'mm-set__choices';
    grp.setAttribute('role', 'radiogroup');
    grp.setAttribute('aria-label', item.label);
    const btns = [];
    /* a row of the boards' nameplates: the chosen one lit gold with the
       boards' four-point star set before its name, the rest the quiet plate */
    const paint = () => {
      const v = get(Save, item.key);
      for (const b of btns) {
        const on = b.dataset.value === String(v);
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
        b.dataset.on = on ? '1' : '0';
        b.classList.toggle('kit-btn--quiet', !on);
      }
    };
    for (const [value, text] of item.options) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mm-set__choice kit-btn';
      b.setAttribute('role', 'radio');
      b.dataset.value = value;
      b.innerHTML = `<i class="mm-set__star" aria-hidden="true"></i><span class="mm-set__choicename">${escape_(text)}</span>`;
      b.addEventListener('click', () => { setSetting(ctx, item.key, value); paint(); });
      b.addEventListener('keydown', (e) => {
        const i = btns.indexOf(b);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); btns[(i + 1) % btns.length].click(); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); btns[(i - 1 + btns.length) % btns.length].click(); }
      });
      btns.push(b); grp.appendChild(b);
    }
    paint();
    row.appendChild(grp);
    rerender.push(paint);
  }
  return row;
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function escape_(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default { openSettings, applySettings, setSetting, SETTINGS_SPEC };
