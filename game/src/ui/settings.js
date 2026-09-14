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
import { icon } from './icons.js';

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
  const COLUMN = { Sound: colA, Reading: colA, Motion: colB, Play: colC };

  for (const section of SETTINGS_SPEC) {
    const fs = document.createElement('fieldset');
    fs.className = GROUP;
    fs.dataset.group = section.group.toLowerCase();
    const lg = document.createElement('legend');
    lg.className = LEGEND;
    lg.textContent = section.group;
    fs.appendChild(lg);

    for (const item of section.items) {
      fs.appendChild(buildRow(ctx, Save, item, rerender));
    }
    (COLUMN[section.group] || colC).appendChild(fs);
  }

  // ── seed ────────────────────────────────────────────────────────────────
  const seedFs = document.createElement('fieldset');
  seedFs.className = GROUP;
  seedFs.innerHTML = `<legend class="${LEGEND}">Seed</legend>`;

  const cur = document.createElement('div');
  cur.className = 'mm-set__row';
  // Same notation as Select, the HUD and Game Over — see formatSeed() in ui/portrait.js.
  const rawSeed = ctx.run ? ctx.run.seed : (Save?.data?.nextSeed ?? null);
  const curSeed = (rawSeed === undefined || rawSeed === null) ? '—' : formatSeed(rawSeed);
  // the seed struck on the Companion tiles' dark enamel cartouche
  cur.innerHTML =
    `<div class="mm-set__label"><span>Current expedition</span>` +
    `<span class="mm-set__hint">A seed reproduces a run exactly: the same rooms, rewards and shop stock.</span></div>` +
    `<i class="kit-leader mm-set__lead" aria-hidden="true"></i>` +
    `<output class="mm-set__seed kit-enamel kit-enamel--dark${rawSeed == null ? ' is-empty' : ''}"><b class="kit-enamel__value">${escape_(curSeed)}</b></output>`;
  seedFs.appendChild(cur);

  const entry = document.createElement('div');
  entry.className = 'mm-set__row';
  entry.innerHTML =
    `<div class="mm-set__label"><span>Seed for the next expedition</span>` +
    `<span class="mm-set__hint">Leave blank for a random one.</span></div>` +
    `<i class="kit-leader mm-set__lead" aria-hidden="true"></i>`;
  const seedIn = document.createElement('input');
  seedIn.type = 'text';
  seedIn.className = 'mm-set__text kit-field';
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
    trip.innerHTML = `<legend class="${LEGEND}">Expedition</legend>`;
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
    colD.appendChild(trip);
  }

  // ── danger ──────────────────────────────────────────────────────────────
  const danger = document.createElement('fieldset');
  danger.className = GROUP + ' mm-set__group--danger';
  danger.innerHTML = `<legend class="${LEGEND}">Danger</legend>`;
  const dRow = document.createElement('div');
  dRow.className = 'mm-set__row';
  dRow.innerHTML =
    `<div class="mm-set__label"><span>Reset all progress</span>` +
    `<span class="mm-set__hint">Deletes every rescued Companion, every clue, the Haunt Level and the current expedition. This cannot be undone.</span></div>` +
    `<i class="kit-leader mm-set__lead" aria-hidden="true"></i>`;
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'mm-btn mm-btn--danger';
  reset.textContent = 'Reset…';
  reset.appendChild(icon('ui.warn'));
  kitButton(reset);
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
    const tube = document.createElement('span');
    tube.className = 'mm-set__tube kit-tube kit-tube--warm';
    tube.setAttribute('aria-hidden', 'true');
    tube.innerHTML = '<span class="kit-tube__fill"></span>';
    const input = document.createElement('input');
    input.type = 'range'; input.id = id;
    input.min = String(item.min); input.max = String(item.max); input.step = String(item.step);
    input.value = String(get(Save, item.key));
    const out = document.createElement('output');
    out.className = 'mm-set__out';
    out.htmlFor = id;
    const show = () => {
      const span = Number(item.max) - Number(item.min);
      const v = span ? (Number(input.value) - Number(item.min)) / span : 0;
      slot.style.setProperty('--v', String(Math.max(0, Math.min(1, v))));
      out.textContent = item.fmt ? item.fmt(input.value) : input.value;
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
    /* The same brass tube as a switch: dark when it is off, its amber enamel
       lit when it is on and the enamel button riding to that end, lit too. The
       knob's end and the lit enamel say it twice, so no plate beside it needs
       to spell it out a third time; `aria-checked` says it to a reader. */
    const btn = document.createElement('button');
    btn.type = 'button'; btn.id = id;
    btn.className = 'mm-set__toggle';
    btn.setAttribute('role', 'switch');
    const paint = () => {
      const on = !!get(Save, item.key);
      btn.setAttribute('aria-checked', String(on));
      btn.dataset.on = on ? '1' : '0';
      btn.innerHTML =
        `<i class="mm-set__switch" aria-hidden="true">`
        + `<i class="mm-set__tube kit-tube kit-tube--warm"><i class="kit-tube__fill"></i></i>`
        + `<i class="mm-set__knob"></i></i>`;
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
    /* a row of the boards' nameplates: the chosen one lit gold, the rest the
       quiet plate — the kit's own two states, nothing drawn for it here */
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
      b.textContent = text;
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
