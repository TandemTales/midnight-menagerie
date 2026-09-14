/**
 * The modal primitive. OWNER: ui-chrome agent.
 *
 * Everything that covers the game uses this: the pile viewer, settings, the
 * confirm dialogs. It exists so that focus behaviour is written once and is
 * correct once.
 *
 *   const m = new Modal({ title: 'Your Tricks', size: 'wide' });
 *   m.body.append(node);
 *   m.footer.append(okButton);
 *   await m.open();          // resolves when it closes
 *   m.close(result);
 *
 * Guarantees:
 *   • Escape closes (unless `dismissible:false`), and so does the backdrop.
 *   • Focus moves into the dialog on open and returns to wherever it was.
 *   • Tab is trapped inside the dialog; the background is `inert`.
 *   • Nothing behind it scrolls, and the scroll position is not lost.
 *   • `close()` is idempotent and always removes every listener it added.
 *
 * THE LOOK IS THE KIT'S (ui/kit.css), put on in `_build` as classes, so a
 * dialog is cut from the same boards as the Shop and the Safe Room and changes
 * when they do: the dialog is a `.kit-panel` (the Kid board's gold rail round
 * dark damask, its inner double rule and brass fleurons), the head is the
 * boards' title plaque (`.kit-titleblock--compact`) seated on the top rail,
 * the close is a round enamel `.kit-medallion` on the rail's corner, and the
 * buttons are the boards' nameplates (`kitButton()` below). A `size:'full'`
 * modal is a veil, not a panel (the hot-seat handoff), and wears none of it.
 */

import { icon } from './icons.js';

/** The glyphs the dialogs set in enamel, drawn like the boards' (reward.js KIT_GLYPH). */
export const DIALOG_GLYPH = {
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.3 3.9 12 9.6l5.7-5.7 2.4 2.4-5.7 5.7 5.7 5.7-2.4 2.4-5.7-5.7-5.7 5.7-2.4-2.4 5.7-5.7-5.7-5.7z"/></svg>',
  done: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.6 12.6 5.5 9.7l4.3 4.3 8.7-9.6 2.9 2.7-11.5 12.6z"/></svg>',
};

/**
 * Dress a button in the kit's nameplate. It KEEPS its own classes (`.mm-btn`
 * and its modifiers are what tests and callers find it by); modal.css holds
 * the few lines that stop base.css's chrome button painting over the plate.
 * `medal` seats a round enamel medallion with that glyph on the plate's end.
 * @param {HTMLButtonElement} b
 * @param {{quiet?:boolean, medal?:'done'|'close'}} [o]
 */
export function kitButton(b, { quiet = false, medal = '' } = {}) {
  b.classList.add('kit-btn');
  if (quiet) b.classList.add('kit-btn--quiet');
  if (medal && DIALOG_GLYPH[medal]) {
    const i = document.createElement('i');
    i.className = 'kit-medallion kit-btn__medal mm-dlg-medal';
    i.setAttribute('aria-hidden', 'true');
    i.innerHTML = DIALOG_GLYPH[medal];
    b.classList.add('mm-dlg-btn--medal');
    b.appendChild(i);
  }
  return b;
}

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

let OPEN_COUNT = 0;

export class Modal {
  /**
   * @param {{title?:string, subtitle?:string, size?:'sm'|'md'|'wide'|'full',
   *          dismissible?:boolean, className?:string, host?:Element,
   *          onClose?:Function, labelledBy?:string, frame?:boolean}} [o]
   *   `frame` (default: every size but 'full') dresses it as a kit panel.
   */
  constructor(o = {}) {
    this.opts = { size: 'md', dismissible: true, ...o };
    this.host = o.host || document.getElementById('dom-layer') || document.body;
    this._offs = [];
    this._closed = false;
    this._resolve = null;
    this._prevFocus = null;
    this._inerted = [];
    this._build();
  }

  _build() {
    const id = `mm-modal-${Math.random().toString(36).slice(2, 8)}`;
    const root = document.createElement('div');
    root.className = 'mm-modal' + (this.opts.className ? ' ' + this.opts.className : '');
    root.dataset.size = this.opts.size;
    root.hidden = true;

    const scrim = document.createElement('div');
    scrim.className = 'mm-modal__scrim';

    /* a panel from the boards, unless it is a full-screen veil */
    const framed = this.opts.frame ?? this.opts.size !== 'full';
    root.classList.toggle('mm-modal--kit', framed);

    const dlg = document.createElement('div');
    dlg.className = 'mm-modal__dialog' + (framed ? ' kit-panel kit-panel--damask' : '');
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', `${id}-title`);
    dlg.tabIndex = -1;

    const head = document.createElement('header');
    head.className = 'mm-modal__head' + (framed ? ' kit-titleblock kit-titleblock--compact' : '');
    head.innerHTML =
      `<h2 class="mm-modal__title${framed ? ' kit-cartouche__title' : ''}" id="${id}-title"></h2>` +
      `<p class="mm-modal__subtitle${framed ? ' kit-cartouche__sub' : ''}"></p>`;

    /* The close is the Kid board's round enamel button seated on the rail's
       corner, so it belongs to the dialog, not to the plaque's grid. */
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'mm-modal__close mm-btn mm-btn--ghost' + (framed ? ' kit-medallion' : '');
    close.setAttribute('aria-label', 'Close');
    if (framed) close.innerHTML = DIALOG_GLYPH.close;
    else close.appendChild(icon('ui.close'));

    const body = document.createElement('div');
    body.className = 'mm-modal__body mm-scroll';

    const footer = document.createElement('footer');
    footer.className = 'mm-modal__foot';

    if (framed) {
      /* What makes it a thing in the house rather than a page over it (ui/kit.css,
         OBJECTS IN THE HOUSE): a tufted velvet liner inside the gilt rail, a
         brass guard over each corner, a cobweb the house has strung across its
         top left one and a candle burning on its lower right. Decoration, first
         in the dialog so everything that is read or pressed stands in front of it. */
      const dress = document.createElement('div');
      dress.className = 'mm-dlg-dress';
      dress.setAttribute('aria-hidden', 'true');
      dress.innerHTML =
        '<i class="kit-liner mm-dlg-dress__liner"></i>'
        + '<i class="kit-web mm-dlg-dress__web"></i>'
        + '<i class="kit-bracket kit-bracket--tl mm-dlg-dress__guard"></i>'
        + '<i class="kit-bracket kit-bracket--tr mm-dlg-dress__guard"></i>'
        + '<i class="kit-bracket kit-bracket--bl mm-dlg-dress__guard"></i>'
        + '<i class="kit-bracket kit-bracket--br mm-dlg-dress__guard"></i>'
        + '<i class="mm-dlg-dress__candle"><i class="kit-light kit-light--candle mm-dlg-dress__glow"></i>'
        + '<i class="kit-prop kit-prop--candle"></i></i>';
      dlg.append(dress, head, body, footer, close);
    } else { head.appendChild(close); dlg.append(head, body, footer); }
    root.append(scrim, dlg);

    this.el = root; this.dialog = dlg; this.body = body; this.footer = footer;
    this.head = head;
    this.titleEl = head.querySelector('.mm-modal__title');
    this.subtitleEl = head.querySelector('.mm-modal__subtitle');
    this.closeBtn = close;

    this.setTitle(this.opts.title || '', this.opts.subtitle || '');
    close.hidden = this.opts.dismissible === false;
    close.addEventListener('click', () => this.close(null));
    scrim.addEventListener('pointerdown', (e) => {
      if (this.opts.dismissible !== false && e.target === scrim) this.close(null);
    });
  }

  setTitle(t, sub) {
    this.titleEl.textContent = t || '';
    this.titleEl.hidden = !t;
    this.subtitleEl.textContent = sub || '';
    this.subtitleEl.hidden = !sub;
    this.head.hidden = !t && !sub && this.opts.dismissible === false;
    /* the plaque's lettering is sized for a word or two; a question as long as
       "Play Put Yourself Back Together?" steps down rather than out of it */
    this.titleEl.dataset.len = String(t || '').length > 26 ? 'long' : String(t || '').length > 16 ? 'mid' : '';
  }

  /** @returns {Promise<any>} the value passed to close() */
  open() {
    if (this._opened) return this._promise;
    this._opened = true;
    this._prevFocus = document.activeElement;
    this.host.appendChild(this.el);
    this.el.hidden = false;

    OPEN_COUNT++;
    document.documentElement.classList.add('mm-modal-open');
    this._makeBackgroundInert();

    const onKey = (e) => {
      if (e.key === 'Escape' && this.opts.dismissible !== false) {
        e.stopPropagation(); e.preventDefault(); this.close(null);
      } else if (e.key === 'Tab') {
        this._trapTab(e);
      }
    };
    document.addEventListener('keydown', onKey, true);
    this._offs.push(() => document.removeEventListener('keydown', onKey, true));

    // focus the first useful control, or the dialog itself
    requestAnimationFrame(() => {
      const first = this.dialog.querySelector('[data-autofocus]')
        || this.body.querySelector(FOCUSABLE)
        || this.footer.querySelector(FOCUSABLE)
        || this.dialog;
      first.focus?.({ preventScroll: true });
      this.el.classList.add('is-in');
    });

    this._promise = new Promise((res) => { this._resolve = res; });
    return this._promise;
  }

  close(result = null) {
    if (this._closed || !this._opened) return;
    this._closed = true;
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    this._releaseBackground();
    OPEN_COUNT = Math.max(0, OPEN_COUNT - 1);
    if (OPEN_COUNT === 0) document.documentElement.classList.remove('mm-modal-open');
    this.el.classList.remove('is-in');
    this.el.remove();
    try { this._prevFocus?.focus?.({ preventScroll: true }); } catch {}
    this.opts.onClose?.(result);
    this._resolve?.(result);
  }

  _trapTab(e) {
    const list = [...this.dialog.querySelectorAll(FOCUSABLE)].filter(n => n.offsetParent !== null || n === document.activeElement);
    if (!list.length) { e.preventDefault(); this.dialog.focus(); return; }
    const first = list[0], last = list[list.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === this.dialog)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    else if (!this.dialog.contains(active)) { e.preventDefault(); first.focus(); }
  }

  /** Everything that is not this modal stops taking pointer + AT attention. */
  _makeBackgroundInert() {
    for (const sib of [...this.host.children]) {
      if (sib === this.el || sib.hasAttribute('inert')) continue;
      sib.setAttribute('inert', '');
      sib.setAttribute('data-mm-inert', '');
      this._inerted.push(sib);
    }
    for (const id of ['gl', 'fx-layer']) {
      const n = document.getElementById(id);
      if (n && !n.hasAttribute('inert')) { n.setAttribute('inert', ''); n.setAttribute('data-mm-inert', ''); this._inerted.push(n); }
    }
  }
  _releaseBackground() {
    for (const n of this._inerted) { n.removeAttribute('inert'); n.removeAttribute('data-mm-inert'); }
    this._inerted.length = 0;
  }
}

/**
 * A yes/no dialog. Resolves true/false.
 *   if (await confirmModal({ title:'Reset everything?', body:'…', danger:true }))
 */
export async function confirmModal({
  title = 'Are you sure?', body = '', confirm = 'Confirm', cancel = 'Cancel',
  danger = false, host,
} = {}) {
  const m = new Modal({ title, size: 'sm', host });
  const p = document.createElement('p');
  p.className = 'mm-modal__text';
  p.textContent = body;
  m.body.appendChild(p);

  const no = document.createElement('button');
  no.type = 'button'; no.className = 'mm-btn'; no.textContent = cancel;
  no.addEventListener('click', () => m.close(false));
  kitButton(no, { quiet: true });

  const yes = document.createElement('button');
  yes.type = 'button';
  yes.className = 'mm-btn ' + (danger ? 'mm-btn--danger' : 'mm-btn--primary');
  yes.textContent = confirm;
  yes.addEventListener('click', () => m.close(true));
  kitButton(yes);

  m.footer.append(no, yes);
  no.setAttribute('data-autofocus', '');     // the safe option is pre-selected
  return (await m.open()) === true;
}

export default Modal;
