/**
 * Keyword + entity tooltips. OWNER: ui-chrome agent.
 *
 * Slay the Spire's whole design rests on the player never having to guess.
 * This file is the machine that keeps that promise: every keyword, status,
 * intent, Keepsake, Trick and resource anywhere in the game explains itself in
 * plain language, in one consistent panel, in about a tenth of a second.
 *
 * ── Using it ────────────────────────────────────────────────────────────────
 *
 * Nothing needs to call this. It installs ONE delegated pointer/focus handler
 * on `document` and picks up any element carrying a recognised attribute:
 *
 *   data-kw="ghoststep"                 a keyword / status from the registries
 *   data-tip="free text"                literal text  (+ data-tip-title)
 *   data-tip-status="weak"              a live status …
 *     data-tip-stacks="3"                 … with its current stack count …
 *     data-tip-owner="You"                 … and whose it is
 *   data-tip-intent="attackBig"         an enemy intent type
 *   data-tip-card="marmalade/pounce"    a full CardView preview
 *     data-tip-upgraded                    render it upgraded
 *   data-tip-enemy="dust-bunny"         name / Courage / lore / known moves
 *   data-tip-keepsake="brass-button"    a Keepsake
 *   data-tip-node="bigScare"            a map node type
 *
 * Placement is controlled per anchor:
 *
 *   data-tip-placement="top|bottom|left|right|auto"   preference, not a promise
 *   data-tip-avoid=".mm-map__node"      CSS selector for things the tooltip
 *                                       must also not cover (the map's node
 *                                       successors were being hidden by their
 *                                       own tooltip — this is the fix)
 *   data-tip-delay="0"                  override the 110 ms intent delay
 *
 * Programmatic:
 *
 *   ctx.tooltip.show(anchorEl, descriptorOrString, opts)
 *   ctx.tooltip.hide()
 *   ctx.tooltip.attach(el, descriptorOrFn)      bind without data attributes
 *   ctx.tooltip.provide('card', id => cardDef)  supply lookups the tooltip
 *   ctx.tooltip.provide('enemy', id => ({...})) cannot import itself
 *   ctx.tooltip.keyword('ghoststep')            -> descriptor
 *   ctx.tooltip.destroy()
 *
 * ── Why it is shaped like this ──────────────────────────────────────────────
 *
 * PERFORMANCE. There is no `pointermove` listener. `pointerover`/`pointerout`
 * bubble, so one pair of listeners covers the whole document and fires only
 * when the pointer crosses an element boundary. Geometry is read exactly twice
 * per tooltip — once for the anchor, once for the panel, both inside a single
 * rAF — and written as one `transform`. Nothing in this file can thrash layout
 * during a frame.
 *
 * NESTING. A keyword's description is itself full of keywords. Every one of
 * them is rendered as a chip, and hovering a chip opens a second-level panel
 * beside the first. Two levels is the cap: past that you are reading a wiki,
 * not playing.
 *
 * NEVER COVERS ITS SUBJECT. Placement scores four sides by (a) whether the
 * panel fits in the viewport at all and (b) how much of the anchor's own
 * `avoid` set it would occlude. It always sits fully outside the anchor rect.
 */

import { getKeyword, allKeywords, slug, loadCompanionKeywords, loadContentRegistries } from '../data/keywords.js';
import { getStatus, allStatuses, statusDesc } from '../data/statuses.js';
import { icon, hasIcon, statusIcon } from './icons.js';
import { applySettings } from './settings.js';

/** ms of pointer dwell before a tooltip opens. StS-ish: present, not sticky. */
const DELAY = 110;
/** After a tooltip has just been open, the next one opens with no delay. */
const WARM_MS = 420;
/** Clearance between the panel and the thing it describes. */
const GAP = 12;
/** Keep this far from the viewport edge. */
const EDGE = 10;
/** Names shorter than this are never auto-linked inside a description. */
const MIN_KW_LEN = 3;

const ATTRS = [
  'data-kw', 'data-tip', 'data-tip-status', 'data-tip-intent',
  'data-tip-card', 'data-tip-enemy', 'data-tip-keepsake', 'data-tip-node',
];
const SELECTOR = ATTRS.map(a => `[${a}]`).join(',');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const INTENT_TEXT = {
  attack: ['Attacking', 'This enemy will deal damage. The number shown is per hit, after every modifier that applies right now.'],
  attackBig: ['Attacking hard', 'A heavy hit. Same promise: the number is exact.'],
  attackDefend: ['Attacking and defending', 'It will hit you and gain Guard in the same turn.'],
  attackBuff: ['Attacking and scheming', 'It will hit you and strengthen itself or an ally.'],
  attackDebuff: ['Attacking and scheming', 'It will hit you and weaken you.'],
  defend: ['Defending', 'This enemy will gain Guard.'],
  defendBuff: ['Defending and scheming', 'Guard for itself, plus a buff.'],
  defendDebuff: ['Defending and scheming', 'Guard for itself, plus a debuff on you.'],
  buff: ['Scheming', 'This enemy will strengthen itself or its allies.'],
  debuff: ['Scheming', 'This enemy will weaken you.'],
  strongDebuff: ['Scheming badly', 'A heavy debuff. Consider stopping this one.'],
  summon: ['Calling for help', 'This enemy will bring something else into the Scuffle.'],
  sleep: ['Asleep', 'It will do nothing this turn. Something will wake it.'],
  stun: ['Stunned', 'It cannot act this turn.'],
  escape: ['Leaving', 'It will flee at the end of its turn and you get nothing for it.'],
  unknown: ['Unknown', 'You cannot tell what this one is planning.'],
};

const NODE_TEXT = {
  scuffle: ['Scuffle', 'An ordinary fight. Win it and pick one Trick from three.'],
  bigScare: ['Big Scare', 'A harder fight with a Keepsake as the prize.'],
  boss: ['The Boss', 'The end of this region. Multi-phase, and it changes at half Courage.'],
  safe: ['Safe Room', 'Rest to recover Courage, or upgrade one Trick permanently.'],
  shop: ["Mr. Moth's", 'Spend Lost Things on Tricks, Keepsakes, Snacks, and card removal.'],
  curiosity: ['Curiosity', 'Something odd. Usually a choice, occasionally a fight.'],
  treasure: ['Treasure', 'A free Keepsake.'],
  rescue: ['Rescue', 'A trapped Companion. Free them and they join the Menagerie for good.'],
  unknown: ['Unknown', 'Could be anything. That is the point.'],
};

/** decay -> a plain-language sentence about what happens to it next. */
function decayLine(def, stacks) {
  const n = Number(stacks) || 0;
  switch (def?.decay) {
    case 'turnEnd':
      return n > 1 ? `At the end of this turn it drops to ${n - 1}.`
                   : 'It falls off at the end of this turn.';
    case 'turnStart':
      return n > 1 ? `At the start of the next turn it drops to ${n - 1}.`
                   : 'It falls off at the start of the next turn.';
    case 'enemyTurnEnd':
      return 'Whatever is left expires at the end of the enemy turn.';
    default:
      return 'It lasts for the rest of the Scuffle.';
  }
}

export class Tooltip {
  /** @param {object} ctx  the shared app context (bus, Save, tipLayer…) */
  constructor(ctx = {}) {
    this.ctx = ctx;
    this.enabled = true;
    this._providers = Object.create(null);
    this._attached = new WeakMap();
    this._matcher = null;          // lazy nested-keyword regex
    this._matchMap = null;
    this._timer = 0;
    this._lastHidden = 0;
    this._anchor = null;
    this._raf = 0;
    this._offs = [];
    this._destroyed = false;

    // The tooltip layer is `aria-hidden` in index.html (it was built as a pure
    // decoration layer). A tooltip is not decoration — it is often the only
    // place a rule is written down — so the panel is announced through a live
    // region inside #dom-layer instead, and the anchor gets aria-describedby.
    this.layer = ctx.tipLayer || document.getElementById('tooltip-layer') || document.body;

    this._build();
    this._bind();

    // main.js always constructs a Tooltip, and this agent does not own main.js,
    // so the accessibility flags (colourblind palette, reduced motion, large
    // text, animation speed) are applied from here. Idempotent.
    try { applySettings(ctx); } catch (e) { console.warn('[tooltip] settings not applied', e); }
    if (ctx.bus?.on) this._offs.push(ctx.bus.on('settings:changed', () => { try { applySettings(ctx); } catch {} }));

    // Merge every registry we can reach. All three loaders are idempotent and
    // individually guarded, so this is safe before content exists.
    this.ready = (async () => {
      try { await loadCompanionKeywords(); } catch { /* not present yet */ }
      try { await loadContentRegistries(null); } catch { /* not present yet */ }
      this._matcher = null;        // rebuild on next use
      return this;
    })();
  }

  // ── DOM ────────────────────────────────────────────────────────────────
  _build() {
    const root = document.createElement('div');
    root.className = 'mm-tip';
    root.setAttribute('role', 'tooltip');
    root.id = 'mm-tip-panel';
    root.hidden = true;
    root.innerHTML = '<div class="mm-tip__inner"></div><i class="mm-tip__beak"></i>';
    this.el = root;
    this.inner = root.querySelector('.mm-tip__inner');
    this.beak = root.querySelector('.mm-tip__beak');
    this.layer.appendChild(root);

    // second level
    const sub = document.createElement('div');
    sub.className = 'mm-tip mm-tip--sub';
    sub.setAttribute('role', 'tooltip');
    sub.hidden = true;
    sub.innerHTML = '<div class="mm-tip__inner"></div><i class="mm-tip__beak"></i>';
    this.subEl = sub;
    this.subInner = sub.querySelector('.mm-tip__inner');
    this.layer.appendChild(sub);

    // screen-reader channel: #tooltip-layer is aria-hidden, so announce here.
    const live = document.createElement('div');
    live.className = 'sr-only';
    live.setAttribute('aria-live', 'polite');
    live.id = 'mm-tip-live';
    (this.ctx.dom || document.body).appendChild(live);
    this.live = live;
  }

  _bind() {
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); this._offs.push(() => t.removeEventListener(ev, fn, o)); };

    // pointerover/out bubble, so this is ONE pair of listeners for the whole
    // app and it fires only on boundary crossings — never per mouse move.
    on(document, 'pointerover', this._onOver = (e) => {
      if (!this.enabled || e.pointerType === 'touch') return;
      const chip = e.target.closest?.('.mm-tip__kw');
      if (chip && this.el.contains(chip)) { this._showSub(chip); return; }
      const a = this._anchorFor(e.target);
      if (a) this._request(a); else if (!this._inPanel(e.target)) this._schedHide();
    }, true);

    on(document, 'pointerout', this._onOut = (e) => {
      if (!this.enabled) return;
      const to = e.relatedTarget;
      if (to && (this._inPanel(to) || this._anchorFor(to) === this._anchor)) return;
      const chip = e.target.closest?.('.mm-tip__kw');
      if (chip && this.el.contains(chip)) { this._hideSub(); if (to && this._inPanel(to)) return; }
      if (this._anchorFor(e.target)) this._schedHide();
    }, true);

    // Keyboard: focusing an element shows its tooltip; Escape dismisses.
    on(document, 'focusin', (e) => {
      if (!this.enabled) return;
      const a = this._anchorFor(e.target);
      if (a) this._request(a, 0); else if (!this._inPanel(e.target)) this.hide();
    });
    on(document, 'focusout', (e) => {
      if (this._anchorFor(e.target) === this._anchor) this._schedHide();
    });
    on(document, 'keydown', (e) => {
      if (e.key === 'Escape' && this._anchor) { this.hide(); }
      // A focused anchor can pop its own second level with the down arrow.
      if (e.key === 'ArrowDown' && this._anchor && this.el.querySelector('.mm-tip__kw')) {
        this._showSub(this.el.querySelector('.mm-tip__kw'));
      }
    });

    // Anything that moves the world under the panel closes it — cheaper and
    // less confusing than chasing the anchor.
    on(window, 'resize', () => this.hide());
    on(window, 'scroll', () => this.hide(), true);
    on(document, 'pointerdown', () => this.hide(), true);
    if (this.ctx.bus?.on) {
      this._offs.push(this.ctx.bus.on('scene:enter', () => this.hide()));
      this._offs.push(this.ctx.bus.on('scene:exit', () => this.hide()));
    }
  }

  _inPanel(n) { return !!n && (this.el.contains(n) || this.subEl.contains(n)); }

  _anchorFor(node) {
    if (!node || node.nodeType !== 1) return null;
    if (this._inPanel(node)) return null;
    const el = node.closest(SELECTOR);
    if (el) return el;
    // programmatic attachments
    for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
      if (this._attached.has(n)) return n;
    }
    return null;
  }

  // ── scheduling ─────────────────────────────────────────────────────────
  _request(anchor, delayOverride) {
    if (anchor === this._anchor) { clearTimeout(this._timer); this._timer = 0; return; }
    clearTimeout(this._timer);
    const attr = Number(anchor.dataset?.tipDelay);
    const warm = performance.now() - this._lastHidden < WARM_MS;
    const d = delayOverride != null ? delayOverride
            : Number.isFinite(attr) ? attr
            : warm ? 0 : DELAY;
    if (d <= 0) { this._open(anchor); return; }
    this._timer = setTimeout(() => { this._timer = 0; this._open(anchor); }, d);
  }

  _schedHide() {
    clearTimeout(this._timer);
    this._timer = 0;
    // disappears immediately — no close delay, that is what makes it feel fast
    this.hide();
  }

  // ── public API ─────────────────────────────────────────────────────────

  /**
   * Show a tooltip for `anchorEl`.
   * @param {Element} anchorEl
   * @param {string|object} content  literal text, or a descriptor
   *        `{kind, title, subtitle, color, icon, body, lines[], rows[], chips[],
   *          footer, node}`
   * @param {{placement?:string, avoid?:string|Element[]}} [opts]
   */
  show(anchorEl, content, opts = {}) {
    if (!anchorEl || this._destroyed) return;
    const desc = this._normalise(content, anchorEl);
    if (!desc) return;
    this._anchor = anchorEl;
    this._render(this.inner, desc);
    this.el.dataset.kind = desc.kind || 'text';
    this.el.hidden = false;
    this.el.classList.remove('is-in');
    this._place(this.el, anchorEl, {
      placement: opts.placement || anchorEl.dataset?.tipPlacement || 'auto',
      avoid: opts.avoid ?? anchorEl.dataset?.tipAvoid,
    });
    anchorEl.setAttribute('aria-describedby', 'mm-tip-panel');
    this.live.textContent = this._plain(desc);
    return desc;
  }

  hide() {
    clearTimeout(this._timer); this._timer = 0;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    this._hideSub();
    if (this._anchor) { this._anchor.removeAttribute('aria-describedby'); this._anchor = null; }
    if (!this.el.hidden) { this.el.hidden = true; this.el.classList.remove('is-in'); this._lastHidden = performance.now(); }
    this.live.textContent = '';
  }

  /** Bind a descriptor (or a function returning one) to an element. */
  attach(el, descriptorOrFn) {
    if (!el) return () => {};
    this._attached.set(el, descriptorOrFn);
    if (!el.hasAttribute('tabindex') && !el.matches('a,button,input,select,textarea')) {
      el.setAttribute('tabindex', '0');
    }
    return () => this._attached.delete(el);
  }

  /**
   * Supply a lookup the tooltip cannot import for itself.
   *   tooltip.provide('card',     id  => CardDef)
   *   tooltip.provide('enemy',    id  => ({def, name, hp, maxHp, lore, moves, seen}))
   *   tooltip.provide('keepsake', id  => RelicDef)
   *   tooltip.provide('status',   (id, el) => ({stacks, owner}))
   */
  provide(kind, fn) { this._providers[kind] = fn; return this; }

  /** The merged registry lookup, with a usable answer for anything unknown. */
  keyword(id) {
    const kw = getKeyword(id) || getKeyword(slug(id));
    if (kw) return this._kwDesc(kw);
    const st = getStatus(id);
    if (st && !st._missing) return this._statusDesc(st, null, null);
    return null;
  }

  /** Every id the tooltip can resolve — used by tests/chrome. */
  allIds() {
    const ids = new Set(allKeywords().map(k => k.id));
    for (const s of allStatuses()) ids.add(s.id);
    return [...ids];
  }

  setEnabled(v) { this.enabled = !!v; if (!v) this.hide(); }

  destroy() {
    this._destroyed = true;
    this.hide();
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    this.el.remove(); this.subEl.remove(); this.live.remove();
  }

  // ── resolution ─────────────────────────────────────────────────────────
  _open(anchor) {
    const desc = this._descFor(anchor);
    if (desc) this.show(anchor, desc);
  }

  _descFor(el) {
    const d = el.dataset || {};
    const bound = this._attached.get(el);
    if (bound) return this._normalise(typeof bound === 'function' ? bound(el) : bound, el);

    if (d.kw != null && d.kw !== '') {
      return this.keyword(d.kw) || { kind: 'text', title: d.kw, body: 'No description registered for this keyword yet.' };
    }
    if (d.tipStatus) {
      const p = this._providers.status?.(d.tipStatus, el) || {};
      const stacks = d.tipStacks != null ? Number(d.tipStacks) : p.stacks;
      return this._statusDesc(getStatus(d.tipStatus), stacks, d.tipOwner || p.owner);
    }
    if (d.tipIntent) return this._intentDesc(d.tipIntent, el);
    if (d.tipCard) return this._cardDesc(d.tipCard, el);
    if (d.tipEnemy) return this._enemyDesc(d.tipEnemy, el);
    if (d.tipKeepsake) return this._keepsakeDesc(d.tipKeepsake, el);
    if (d.tipNode) return this._nodeDesc(d.tipNode, el);
    if (d.tip) return { kind: 'text', title: d.tipTitle || '', body: d.tip };
    return null;
  }

  _normalise(c, anchor) {
    if (!c) return null;
    if (typeof c === 'string') return { kind: 'text', body: c };
    if (c.nodeType === 1) return { kind: 'custom', node: c };
    if (c.kind === 'keyword' && c.id && !c.body) return this.keyword(c.id);
    return c;
  }

  // ── descriptor builders ────────────────────────────────────────────────
  _kwDesc(kw) {
    const st = kw.status ? getStatus(kw.id) : null;
    return {
      kind: 'keyword',
      id: kw.id,
      title: kw.name,
      subtitle: this._catLabel(kw),
      color: kw.color,
      icon: hasIcon(`status.${kw.icon || kw.id}`) ? `status.${kw.icon || kw.id}`
          : hasIcon(kw.id) ? kw.id : null,
      body: kw.desc,
      footer: st && st.decay && st.decay !== 'never' && st.decay !== 'combat'
        ? null : null,
    };
  }

  _catLabel(kw) {
    const c = kw.category;
    if (kw.companion) return `${cap(kw.companion)} · ${cap(c || 'keyword')}`;
    return { core: 'Core rule', resource: 'Resource', buff: 'Buff', debuff: 'Debuff',
             card: 'Trick rule', zone: 'Zone', intent: 'Intent', companion: 'Companion' }[c] || 'Keyword';
  }

  _statusDesc(def, stacks, owner) {
    if (!def) return null;
    const n = Number.isFinite(stacks) ? stacks : null;
    const lines = [];
    // "what it will do this turn", concretely, with the real number in it.
    lines.push(n == null ? String(def.desc || '').replace(/\{n\}/g, 'X') : statusDesc(def.id, n));
    if (n != null) lines.push(decayLine(def, n));
    return {
      kind: 'status',
      id: def.id,
      title: def.name || def.id,
      subtitle: (owner ? `${owner} · ` : '') +
        (def.kind === 'buff' ? 'Buff' : def.kind === 'debuff' ? 'Debuff' : 'Counter'),
      color: def.kind === 'buff' ? 'var(--good-300)' : def.kind === 'debuff' ? 'var(--threat-300)' : 'var(--flame-200)',
      icon: statusIcon(def),
      stacks: n,
      lines,
    };
  }

  _intentDesc(type, el) {
    const [title, body] = INTENT_TEXT[type] || INTENT_TEXT.unknown;
    const dmg = el?.dataset?.tipDamage;
    const hits = el?.dataset?.tipHits;
    const lines = [body];
    if (dmg) {
      lines.push(hits && Number(hits) > 1
        ? `${dmg} damage, ${hits} times. Every modifier is already counted.`
        : `${dmg} damage. Every modifier is already counted.`);
    }
    return {
      kind: 'intent', title, subtitle: 'Intent',
      color: /^attack/.test(type) ? 'var(--type-attack)'
           : /^defend/.test(type) ? 'var(--guard-300)' : 'var(--spectre-300)',
      icon: `intent.${INTENT_TEXT[type] ? type : 'unknown'}`,
      lines,
    };
  }

  _cardDesc(id, el) {
    const def = this._providers.card?.(id, el);
    if (!def) return { kind: 'text', title: id, body: 'Trick not found.' };
    return {
      kind: 'card', title: def.name, id: def.id,
      upgraded: el?.dataset?.tipUpgraded != null,
      def,
    };
  }

  _enemyDesc(id, el) {
    const e = this._providers.enemy?.(id, el);
    if (!e) return { kind: 'text', title: id, body: 'Nothing known about this one yet.' };
    const def = e.def || e;
    const rows = [];
    if (e.hp != null) rows.push(['Courage', e.maxHp != null ? `${e.hp} / ${e.maxHp}` : String(e.hp)]);
    if (e.block) rows.push(['Guard', String(e.block)]);
    const seen = e.seen instanceof Set ? e.seen : new Set(e.seen || []);
    const moves = Object.entries(def.moves || {})
      .filter(([k]) => !seen.size || seen.has(k))
      .map(([k, m]) => [m.name || k, moveSummary(m)]);
    return {
      kind: 'enemy',
      title: e.name || def.name || id,
      subtitle: def.tier === 'boss' ? 'Boss' : def.tier === 'elite' ? 'Big Scare' : 'Creature',
      color: 'var(--threat-200)',
      body: def.lore || def.flavour || def.desc || '',
      rows,
      moves,
      movesNote: seen.size ? 'Moves you have seen it use.' : 'Its full repertoire.',
    };
  }

  _keepsakeDesc(id, el) {
    const r = this._providers.keepsake?.(id, el);
    if (!r) return { kind: 'text', title: id, body: 'Keepsake not found.' };
    const lines = [r.desc || r.text || ''];
    if (r.counter != null) lines.push(`Currently at ${r.counter}.`);
    return {
      kind: 'keepsake',
      title: r.name || id,
      subtitle: `${cap(r.rarity || 'common')} Keepsake`,
      color: `var(--rarity-${r.rarity || 'common'})`,
      icon: hasIcon(`res.keepsake`) ? 'res.keepsake' : null,
      lines,
      footer: r.flavour || r.flavor || null,
    };
  }

  _nodeDesc(type, el) {
    const [title, body] = NODE_TEXT[type] || NODE_TEXT.unknown;
    return {
      kind: 'node', title,
      subtitle: el?.dataset?.tipRoom || 'Room',
      icon: `node.${NODE_TEXT[type] ? type : 'unknown'}`,
      color: 'var(--flame-200)',
      body,
    };
  }

  // ── rendering ──────────────────────────────────────────────────────────
  _render(host, d) {
    host.textContent = '';
    if (d.node) { host.appendChild(d.node); return; }

    const head = document.createElement('div');
    head.className = 'mm-tip__head';
    if (d.icon) { const i = icon(d.icon); i.classList.add('mm-tip__icon'); head.appendChild(i); }
    const t = document.createElement('span');
    t.className = 'mm-tip__title';
    if (d.color) t.style.color = d.color;
    t.textContent = d.title || '';
    head.appendChild(t);
    if (d.stacks != null) {
      const s = document.createElement('span');
      s.className = 'mm-tip__stacks';
      s.textContent = String(d.stacks);
      head.appendChild(s);
    }
    if (d.subtitle) {
      const s = document.createElement('span');
      s.className = 'mm-tip__sub';
      s.textContent = d.subtitle;
      head.appendChild(s);
    }
    if (d.title) host.appendChild(head);

    // card preview: a real CardView, so the tooltip and the hand can never
    // disagree about what a Trick says.
    if (d.kind === 'card' && d.def) {
      const wrap = document.createElement('div');
      wrap.className = 'mm-tip__card';
      host.appendChild(wrap);
      this._mountCard(wrap, d);
    }

    const bodies = [];
    if (d.body) bodies.push(d.body);
    if (Array.isArray(d.lines)) bodies.push(...d.lines.filter(Boolean));
    for (const line of bodies) {
      const p = document.createElement('p');
      p.className = 'mm-tip__body';
      p.innerHTML = this._linkKeywords(line, d.id);
      host.appendChild(p);
    }

    if (Array.isArray(d.rows) && d.rows.length) {
      const dl = document.createElement('dl');
      dl.className = 'mm-tip__rows';
      for (const [k, v] of d.rows) {
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd'); dd.textContent = v;
        dl.append(dt, dd);
      }
      host.appendChild(dl);
    }

    if (Array.isArray(d.moves) && d.moves.length) {
      const h = document.createElement('div');
      h.className = 'mm-tip__movenote';
      h.textContent = d.movesNote || '';
      host.appendChild(h);
      const ul = document.createElement('ul');
      ul.className = 'mm-tip__moves';
      for (const [name, sum] of d.moves) {
        const li = document.createElement('li');
        li.innerHTML = `<b>${esc(name)}</b>${sum ? ' — ' + this._linkKeywords(sum, d.id) : ''}`;
        ul.appendChild(li);
      }
      host.appendChild(ul);
    }

    if (d.footer) {
      const f = document.createElement('p');
      f.className = 'mm-tip__footer';
      f.textContent = d.footer;
      host.appendChild(f);
    }
  }

  async _mountCard(wrap, d) {
    try {
      const { CardView } = await import('./card.js');
      if (!wrap.isConnected) return;
      const v = new CardView(d.def, { uid: `tip:${d.def.id}`, upgraded: !!d.upgraded, playable: true });
      v.el.style.position = 'static';
      v.el.style.pointerEvents = 'none';
      wrap.appendChild(v.el);
      wrap.classList.add('is-ready');
      this._cardView?.destroy?.();
      this._cardView = v;
      // the panel just grew — re-place it against the same anchor
      if (this._anchor) this._place(this.el, this._anchor, {
        placement: this._anchor.dataset?.tipPlacement || 'auto',
        avoid: this._anchor.dataset?.tipAvoid,
      });
    } catch (e) {
      wrap.textContent = '';
    }
  }

  /** Plain-text version for the live region. */
  _plain(d) {
    const bits = [d.title, d.subtitle, d.body, ...(d.lines || [])].filter(Boolean);
    if (d.stacks != null) bits.splice(1, 0, `${d.stacks} stacks`);
    return bits.join('. ');
  }

  // ── nested keywords ────────────────────────────────────────────────────
  _buildMatcher() {
    const map = new Map();
    const push = (label, id) => {
      const k = String(label || '').toLowerCase();
      if (k.length < MIN_KW_LEN) return;
      if (!map.has(k)) map.set(k, id);
    };
    for (const kw of allKeywords()) { push(kw.name, kw.id); push(kw.id.replace(/-/g, ' '), kw.id); }
    for (const st of allStatuses()) { push(st.name, st.id); }
    const words = [...map.keys()].sort((a, b) => b.length - a.length)
      .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    this._matchMap = map;
    this._matcher = words.length
      ? new RegExp(`\\b(${words.join('|')})(s|es)?\\b`, 'gi')
      : /(?!)/g;
  }

  /**
   * Turn every keyword mentioned inside a description into a chip. `selfId` is
   * excluded so a keyword never links to itself.
   * Returns escaped HTML — the input is registry prose, but it is still
   * escaped before any markup is added.
   */
  _linkKeywords(text, selfId) {
    if (!this._matcher) this._buildMatcher();
    const src = String(text ?? '');
    let out = '', last = 0;
    this._matcher.lastIndex = 0;
    let m;
    while ((m = this._matcher.exec(src)) !== null) {
      const id = this._matchMap.get(m[1].toLowerCase());
      if (!id || id === selfId) continue;
      out += esc(src.slice(last, m.index));
      out += `<span class="mm-tip__kw" data-kw="${esc(id)}" tabindex="-1">${esc(m[0])}</span>`;
      last = m.index + m[0].length;
    }
    out += esc(src.slice(last));
    return out;
  }

  _showSub(chip) {
    const id = chip?.dataset?.kw;
    if (!id) return;
    const d = this.keyword(id);
    if (!d) return;
    this._render(this.subInner, { ...d, kind: 'keyword-sub' });
    this.subEl.hidden = false;
    this._place(this.subEl, chip, { placement: 'auto', avoid: [this.el] });
  }
  _hideSub() { if (!this.subEl.hidden) { this.subEl.hidden = true; this.subEl.classList.remove('is-in'); } }

  // ── placement ──────────────────────────────────────────────────────────
  /**
   * Two geometry reads, one write, inside one rAF. The panel is placed fully
   * OUTSIDE the anchor on whichever side scores best:
   *   +1000  fits entirely in the viewport
   *   −(px²) area of `avoid` elements it would cover
   *   +bias  for the caller's preferred side
   */
  _place(panel, anchor, { placement = 'auto', avoid = null } = {}) {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      if (panel.hidden || !anchor.isConnected) return;

      // one read pass
      const a = anchor.getBoundingClientRect();
      panel.style.maxHeight = '';
      const p = panel.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const avoidRects = this._avoidRects(avoid, anchor);

      const w = p.width, h = p.height;
      const cands = [];
      const clampX = (x) => Math.max(EDGE, Math.min(x, vw - w - EDGE));
      const clampY = (y) => Math.max(EDGE, Math.min(y, vh - h - EDGE));

      cands.push({ side: 'top',    x: clampX(a.left + a.width / 2 - w / 2), y: a.top - h - GAP });
      cands.push({ side: 'bottom', x: clampX(a.left + a.width / 2 - w / 2), y: a.bottom + GAP });
      cands.push({ side: 'right',  x: a.right + GAP,     y: clampY(a.top + a.height / 2 - h / 2) });
      cands.push({ side: 'left',   x: a.left - w - GAP,  y: clampY(a.top + a.height / 2 - h / 2) });

      let best = null;
      for (const c of cands) {
        const fits = c.x >= EDGE && c.y >= EDGE && c.x + w <= vw - EDGE && c.y + h <= vh - EDGE;
        let score = fits ? 1000 : 0;
        if (!fits) {
          // how much of it would hang off — least-bad wins
          const over = Math.max(0, EDGE - c.x) + Math.max(0, EDGE - c.y)
                     + Math.max(0, c.x + w - (vw - EDGE)) + Math.max(0, c.y + h - (vh - EDGE));
          score -= over;
        }
        const r = { left: c.x, top: c.y, right: c.x + w, bottom: c.y + h };
        for (const ar of avoidRects) score -= overlapArea(r, ar) / 400;
        if (c.side === placement) score += 300;
        else if (placement === 'auto' && c.side === 'top') score += 20;  // gentle default
        if (!best || score > best.score) best = { ...c, score, fits };
      }

      // Last resort: it fits nowhere (huge panel / tiny window). Clamp it into
      // the viewport on the side with the most room and let it scroll, rather
      // than let it run off screen.
      let { x, y, side } = best;
      if (!best.fits) {
        const room = { top: a.top, bottom: vh - a.bottom, left: a.left, right: vw - a.right };
        side = Object.keys(room).reduce((m, k) => room[k] > room[m] ? k : m, 'bottom');
        const maxH = Math.max(120, room[side] - GAP - EDGE);
        if (side === 'top' || side === 'bottom') {
          panel.style.maxHeight = `${Math.min(h, maxH)}px`;
          const hh = Math.min(h, maxH);
          y = side === 'top' ? Math.max(EDGE, a.top - hh - GAP) : Math.min(vh - hh - EDGE, a.bottom + GAP);
          x = clampX(a.left + a.width / 2 - w / 2);
        } else {
          panel.style.maxHeight = `${Math.min(h, vh - 2 * EDGE)}px`;
          x = side === 'left' ? Math.max(EDGE, a.left - w - GAP) : Math.min(vw - w - EDGE, a.right + GAP);
          y = clampY(a.top + a.height / 2 - h / 2);
        }
      }

      // one write pass
      panel.dataset.side = side;
      panel.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      const beak = panel.querySelector('.mm-tip__beak');
      if (beak) {
        const cx = Math.max(10, Math.min(a.left + a.width / 2 - x, w - 10));
        const cy = Math.max(10, Math.min(a.top + a.height / 2 - y, h - 10));
        beak.style.left = (side === 'left') ? `${w}px` : (side === 'right') ? '0px' : `${cx}px`;
        beak.style.top = (side === 'top') ? `${h}px` : (side === 'bottom') ? '0px' : `${cy}px`;
      }
      panel.classList.add('is-in');
    });
  }

  _avoidRects(avoid, anchor) {
    const out = [];
    if (!avoid) return out;
    let els = [];
    if (typeof avoid === 'string') {
      try { els = [...document.querySelectorAll(avoid)]; } catch { els = []; }
    } else if (Array.isArray(avoid)) els = avoid;
    for (const e of els) {
      if (!e || e === anchor || !e.isConnected) continue;
      const r = e.getBoundingClientRect();
      if (r.width && r.height) out.push(r);
    }
    // the anchor itself is always avoided
    const ar = anchor.getBoundingClientRect();
    out.push(ar);
    return out;
  }
}

function overlapArea(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return (w > 0 && h > 0) ? w * h : 0;
}

function moveSummary(m) {
  if (!m) return '';
  if (m.tip || m.desc || m.text) return String(m.tip || m.desc || m.text);
  const bits = [];
  if (m.damage) bits.push(`${m.damage}${m.hits > 1 ? `x${m.hits}` : ''} damage`);
  if (m.block) bits.push(`${m.block} Guard`);
  if (m.status) bits.push(`applies ${m.status}`);
  return bits.join(', ');
}

function cap(s) { return String(s || '').replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase()); }

export default Tooltip;
