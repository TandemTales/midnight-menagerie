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

import { Modal, confirmModal } from './modal.js';
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

  const form = document.createElement('div');
  form.className = 'mm-set';
  modal.body.appendChild(form);

  const rerender = [];

  for (const section of SETTINGS_SPEC) {
    const fs = document.createElement('fieldset');
    fs.className = 'mm-set__group';
    const lg = document.createElement('legend');
    lg.className = 'mm-set__legend';
    lg.textContent = section.group;
    fs.appendChild(lg);

    for (const item of section.items) {
      fs.appendChild(buildRow(ctx, Save, item, rerender));
    }
    form.appendChild(fs);
  }

  // ── seed ────────────────────────────────────────────────────────────────
  const seedFs = document.createElement('fieldset');
  seedFs.className = 'mm-set__group';
  seedFs.innerHTML = '<legend class="mm-set__legend">Seed</legend>';

  const cur = document.createElement('div');
  cur.className = 'mm-set__row';
  // Same notation as Select, the HUD and Game Over — see formatSeed() in ui/portrait.js.
  const rawSeed = ctx.run ? ctx.run.seed : (Save?.data?.nextSeed ?? null);
  const curSeed = (rawSeed === undefined || rawSeed === null) ? '—' : formatSeed(rawSeed);
  cur.innerHTML =
    `<div class="mm-set__label"><span>Current expedition</span>` +
    `<span class="mm-set__hint">A seed reproduces a run exactly: the same rooms, rewards and shop stock.</span></div>` +
    `<output class="mm-set__seed">${escape_(curSeed)}</output>`;
  seedFs.appendChild(cur);

  const entry = document.createElement('div');
  entry.className = 'mm-set__row';
  entry.innerHTML =
    `<div class="mm-set__label"><span>Seed for the next expedition</span>` +
    `<span class="mm-set__hint">Leave blank for a random one.</span></div>`;
  const seedIn = document.createElement('input');
  seedIn.type = 'text';
  seedIn.className = 'mm-set__text';
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
  form.appendChild(seedFs);

  // ── danger ──────────────────────────────────────────────────────────────
  const danger = document.createElement('fieldset');
  danger.className = 'mm-set__group mm-set__group--danger';
  danger.innerHTML = '<legend class="mm-set__legend">Danger</legend>';
  const dRow = document.createElement('div');
  dRow.className = 'mm-set__row';
  dRow.innerHTML =
    `<div class="mm-set__label"><span>Reset all progress</span>` +
    `<span class="mm-set__hint">Deletes every rescued Companion, every clue, the Haunt Level and the current expedition. This cannot be undone.</span></div>`;
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'mm-btn mm-btn--danger';
  reset.textContent = 'Reset…';
  reset.appendChild(icon('ui.warn'));
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
  form.appendChild(danger);

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

  if (item.type === 'range') {
    const wrap = document.createElement('div');
    wrap.className = 'mm-set__rangewrap';
    const input = document.createElement('input');
    input.type = 'range'; input.id = id;
    input.min = String(item.min); input.max = String(item.max); input.step = String(item.step);
    input.value = String(get(Save, item.key));
    const out = document.createElement('output');
    out.className = 'mm-set__out';
    out.textContent = item.fmt ? item.fmt(input.value) : input.value;
    const commit = () => {
      out.textContent = item.fmt ? item.fmt(input.value) : input.value;
      setSetting(ctx, item.key, Number(input.value));
    };
    input.addEventListener('input', commit);
    wrap.append(input, out);
    row.appendChild(wrap);
    rerender.push(() => { input.value = String(get(Save, item.key)); out.textContent = item.fmt ? item.fmt(input.value) : input.value; });

  } else if (item.type === 'toggle') {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.id = id;
    btn.className = 'mm-set__toggle';
    btn.setAttribute('role', 'switch');
    const paint = () => {
      const on = !!get(Save, item.key);
      btn.setAttribute('aria-checked', String(on));
      btn.dataset.on = on ? '1' : '0';
      btn.innerHTML = `<i></i><span>${on ? 'On' : 'Off'}</span>`;
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
    const paint = () => {
      const v = get(Save, item.key);
      for (const b of btns) {
        const on = b.dataset.value === String(v);
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
        b.dataset.on = on ? '1' : '0';
      }
    };
    for (const [value, text] of item.options) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mm-set__choice';
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
