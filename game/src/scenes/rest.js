/**
 * The Safe Room — a Blanket Fort.  OWNER: meta-run.
 *
 * Design source: docs/design/00-core-overview.md §24.  The kids find a
 * defensible room, barricade the door, drag the furniture together and put
 * blankets over the table.  Dangerous supernatural mansion outside; warm
 * flashlight-lit fort inside.  That contrast is the whole screen.
 *
 * STS2-REFERENCE §6: "Rest site: heal ~30% or upgrade a card — StS2 adds Forge:
 * permanently upgrade a relic (+1 tier) at a max-HP cost."  So four doors, one
 * choice:
 *
 *   Rest    recover 30% of maximum Courage, stated as an exact before → after
 *   Sharpen upgrade a Trick, previewed on the real card
 *   Forge   +1 tier on a Keepsake, paid in maximum Courage, with before/after
 *   Sit     free: a Clue, and a line from your Companion you have not heard
 *
 * Sitting exists because a Safe Room that is only two numbers is not a Safe
 * Room.  It is deliberately the weakest mechanical option and the best one to
 * take when you are already healthy.
 */
import { bus } from '../core/bus.js';
import { TERMS, NodeType, COMPANIONS } from '../data/schema.js';
import { cardById } from '../data/cards.js';
import { relicSigil } from '../data/relics.js';
import { RoomScene, esc } from './reward.js';
import { el, ensureCss, rovingFocus } from '../ui/portrait.js';

const CSS_REST = new URL('./rest.css', import.meta.url).href;

/** What your Companion says when you sit down with them. */
const COMPANION_TALK = {
  marmalade: [
    'She tells you the stair by the west landing is warm at eleven in the morning, and has been for fifty years, and she does not know why she knows that.',
    'She lets you check her ear, which she has never done. There is a notch in it. She says a door did that. She will not say which door.',
    'She sits with her back to you facing the door, which you eventually understand is not rudeness. It is a watch.',
  ],
  bones: [
    'He brings you a bone that is definitely part of him, and is extremely proud, and will not take it back.',
    'He does not remember his name. He remembers the sound of a gate and somebody running, and he is certain the running was towards him.',
    'He falls asleep upside down against your leg and twitches like he is chasing something. You hope he catches it.',
  ],
  pipkin: [
    'She hums. The pumpkin resonates. It is genuinely the nicest sound in the building.',
    'She has been collecting seeds in her hollow. She shows you all of them. It takes a while.',
    'She asks, in the way frogs ask, whether outside is still there. You say yes. She sits with that.',
  ],
  taffy: [
    'He very carefully makes himself the exact shape of a mug so you have something to hold.',
    'He remembers being made. He does not remember being alive before that, and he has decided this is fine, and mostly it is.',
    'He is trying to learn to whistle. He does not have a mouth. He is undeterred.',
  ],
  wink: [
    'She watches the door with four eyes and you with two, which is the most tactful thing anyone has done for you all night.',
    'She has been mapping the wall cavities in web. She has done nine rooms. Nine rooms that are not on the blueprint.',
    'She blinks slowly at you, one eye at a time, all the way round. Your Companion is telling you she is glad you came.',
  ],
};
const GENERIC_TALK = [
  'They lean against you and go quiet, and for eleven minutes nothing in the house is frightening.',
  'They show you something they have been carrying since before you met. You do not know what it is. You say it is very good.',
  'They fall asleep. You keep watch. It is the first time all night that somebody else has been the one resting.',
];

const FORT_SVG = `
<svg class="rs-fort" viewBox="0 0 420 280" role="img"
     aria-label="A blanket fort: a table with blankets over it, a torch burning inside,
                 a kid and a small animal sitting in the warm.">
  <defs>
    <radialGradient id="rsGlow" cx="50%" cy="58%">
      <stop offset="0%" class="rs-glow-a"/><stop offset="100%" class="rs-glow-b"/>
    </radialGradient>
    <radialGradient id="rsInside" cx="50%" cy="86%">
      <stop offset="0%" class="rs-in-a"/><stop offset="100%" class="rs-in-b"/>
    </radialGradient>
  </defs>

  <ellipse class="rs-pool" cx="210" cy="240" rx="192" ry="42" fill="url(#rsGlow)"/>

  <!-- the barricaded door, back left -->
  <path class="rs-dark" d="M18 92h58v158H18Z"/>
  <path class="rs-doorknob" d="M64 172a4 4 0 1 1 0-.01"/>
  <path class="rs-plank" d="M6 128h84M10 162h82M4 196h88"/>

  <!-- the table underneath -->
  <path class="rs-table" d="M96 148h228v12H96Z"/>
  <path class="rs-leg" d="M114 160v88M306 160v88"/>

  <!-- the blanket over the top, hem sagging between the corners -->
  <path class="rs-blanketA" d="M74 248 86 168c6-30 44-46 124-46s118 16 124 46l12 80
    c-28 8-50-8-74 0s-46-8-62 0-38-8-62 0-50-8-74 0Z"/>
  <path class="rs-stitch" d="M92 182c48-14 188-14 236 0M86 210c52-12 196-12 248 0"/>
  <path class="rs-patch" d="M108 132h34v30h-34ZM278 138h32v28h-32Z"/>

  <!-- the way in -->
  <path class="rs-inside" d="M148 250v-40c0-30 26-44 62-44s62 14 62 44v40Z" fill="url(#rsInside)"/>
  <path class="rs-archline" d="M148 250v-40c0-30 26-44 62-44s62 14 62 44v40"/>

  <!-- torch, and two shapes sitting in the warm -->
  <path class="rs-torchbody" d="M205 230h10v18h-10Z"/>
  <path class="rs-flame" d="M210 200c9 11 7 17 4 22-4 7-13 5-14-2-1-8 5-11 10-20Z"/>
  <path class="rs-kid" d="M160 248c0-22 9-34 20-34s20 12 20 34Z"/>
  <path class="rs-kid" d="M180 212a10 10 0 1 1 0-.02"/>
  <path class="rs-pet" d="M228 248c0-13 8-22 18-22s18 9 18 22Z"/>
  <path class="rs-petear" d="M234 230l-4-11m20 10 5-11"/>

  <!-- cushions and floorboards -->
  <path class="rs-cushion" d="M300 248c0-9 9-15 20-15s20 6 20 15ZM72 248c0-8 8-13 18-13s18 5 18 13Z"/>
  <path class="rs-floor" d="M4 250h412M4 262h412"/>
</svg>`;

export class RestScene extends RoomScene {
  constructor(ctx) { super(ctx, { kind: 'rest' }); }

  async enter(params = {}) {
    await this._boot(params, NodeType.SAFE);
    if (this._dead) return;
    await ensureCss(CSS_REST);
    if (this._dead) return;

    this.used = false;
    this._shell({
      eyebrow: TERMS.rest,
      title: 'You Build the Fort',
      sub: 'Door wedged. Table dragged over. Blankets down. Nothing gets in here without knocking things over first.',
    });

    this._buildBody();
    this._buildFoot();
    this._bindKeys();
    bus.emit('rest:ready', {});
  }

  /* ── the four doors ───────────────────────────────────────────────────── */
  _buildBody() {
    const r = this.run;
    const healAmt = r.restHealAmount();
    const upgradeable = r.upgradeableCards?.() || [];
    const forgeable = r.forgeableKeepsakes?.() || [];
    const forgeCost = r.forgeCost?.() ?? 8;
    const forgeAffordable = r.maxCourage - forgeCost >= 10;

    const wrap = el('div', 'rs-room');
    wrap.innerHTML = `
      <div class="rs-art">${FORT_SVG}</div>
      <div class="rs-choices" role="group" aria-label="Choose one thing to do here"></div>`;
    this.$body.appendChild(wrap);
    const list = wrap.querySelector('.rs-choices');

    this._options = [
      {
        id: 'rest', name: 'Rest',
        blurb: `Sleep for two hours with somebody keeping watch.`,
        readout: healAmt > 0
          ? `${TERMS.hp} ${r.courage} <b>&rarr;</b> ${Math.min(r.maxCourage, r.courage + healAmt)}`
          : `No rest tonight`,
        note: healAmt > 0
          ? (r.courage >= r.maxCourage ? 'You are already at full Courage.' : `Recovers ${healAmt}.`)
          : 'A Keepsake you are carrying will not let you.',
        can: healAmt > 0,
        why: healAmt > 0 ? '' : 'The White Glove does not permit resting.',
        run: () => { const n = r.rest(); return `You sleep. ${n} ${TERMS.hp} back.`; },
      },
      {
        id: 'upgrade', name: `Sharpen a ${TERMS.card}`,
        blurb: `Work on one ${TERMS.card} by torchlight until it is better than it was.`,
        readout: `${upgradeable.length} can be sharpened`,
        note: `Permanent, for the rest of the expedition.`,
        can: upgradeable.length > 0,
        why: upgradeable.length ? '' : `Every ${TERMS.card} you carry is already as good as it gets.`,
        run: () => this._doUpgrade(),
      },
      {
        id: 'forge', name: 'Forge a Keepsake',
        blurb: `Hold it in the flame. It comes out meaning more, and you come out smaller.`,
        readout: `Costs ${forgeCost} maximum ${TERMS.hp}`,
        note: `${TERMS.hp} ${r.maxCourage} <b>&rarr;</b> ${r.maxCourage - forgeCost} &middot; the Keepsake fires twice`,
        can: forgeable.length > 0 && forgeAffordable,
        why: !forgeable.length ? 'Nothing left to forge.'
          : !forgeAffordable ? 'You cannot spare the Courage.' : '',
        run: () => this._doForge(),
      },
      {
        id: 'sit', name: 'Sit with your Companion',
        blurb: `Nothing useful. Ask them something.`,
        readout: `+1 Clue`,
        note: 'They have been in this house a long time.',
        can: true, why: '',
        run: () => this._doSit(),
      },
    ];

    for (const o of this._options) {
      const b = el('button', 'rs-door');
      b.type = 'button';
      b.dataset.opt = o.id;
      b.disabled = !o.can;
      b.setAttribute('aria-label', `${o.name}. ${String(o.readout).replace(/<[^>]+>/g, ' ')}`);
      b.innerHTML = `
        <span class="rs-door__glyph" aria-hidden="true">${DOOR_GLYPH[o.id]}</span>
        <span class="rs-door__txt">
          <b>${esc(o.name)}</b>
          <em>${esc(o.blurb)}</em>
          <span class="rs-door__read">${o.readout}</span>
          <span class="rs-door__note">${o.can ? o.note : esc(o.why)}</span>
        </span>`;
      b.addEventListener('click', () => this._choose(o));
      list.appendChild(b);
    }
    this._own(rovingFocus(list, '.rs-door', { cols: 0 }));
    requestAnimationFrame(() => list.querySelector('.rs-door:not(:disabled)')?.focus());
  }

  async _choose(o) {
    if (this.used || !o.can) return;
    this.used = true;
    this._lock();
    let msg = null;
    try { msg = await o.run(); } catch (e) { console.error('[rest]', e); }
    if (this._dead) return;
    if (!msg) {                       // the player backed out of a picker
      this.used = false;
      this._lock(false);
      return;
    }
    this.root.querySelector(`[data-opt="${o.id}"]`)?.classList.add('is-done');
    this._say(msg);
    this._syncHud();
    this.$go?.classList.add('is-ready');
    this.$go?.focus();
    this.ctx.audio?.play?.('ui/confirm');
  }

  _lock(on = true) {
    for (const b of this.root.querySelectorAll('.rs-door')) {
      b.disabled = on ? true : !this._options.find(o => o.id === b.dataset.opt)?.can;
      b.classList.toggle('is-spent', on);
    }
    this.root.querySelector('.rs-room')?.classList.toggle('is-spent', on);
  }

  /* ── the three real actions ───────────────────────────────────────────── */
  async _doUpgrade() {
    const cards = this.run.upgradeableCards().map(c => ({
      uid: c.uid, def: cardById(c.id), upgraded: c.upgraded,
    })).filter(c => c.def);
    const uid = await this.pickCard({
      title: `Which ${TERMS.card} do you want to be better at?`,
      sub: 'Hover or arrow across them — the card shows you what it becomes.',
      cards, preview: 'upgrade', confirmLabel: 'Sharpen it',
    });
    if (!uid) return null;
    const c = this.run.upgradeCard(uid);
    if (!c) return null;
    return `${cardById(c.id)?.name}+ for the rest of the expedition.`;
  }

  async _doForge() {
    const id = await this._pickKeepsake();
    if (!id) return null;
    const k = this.run.forgeKeepsake(id);
    if (!k) return null;
    return `${k.name} is forged. It costs you ${this.run.forgeCost()} maximum ${TERMS.hp} and it was worth it.`;
  }

  _doSit() {
    const lines = COMPANION_TALK[this.run.companion] || GENERIC_TALK;
    const g = this.run.fork(`sit:${this.run.currentNodeId}`);
    const line = lines[g.int(lines.length)];
    this.run.addClues(1);
    const name = COMPANIONS.find(c => c.slug === this.run.companion)?.name || 'They';
    return `${name}: ${line}`;
  }

  /**
   * The Forge picker.  Same shell as the card picker, but a Keepsake is not a
   * card, so it gets its own list with an explicit before / after.
   */
  _pickKeepsake() {
    return new Promise((resolve) => {
      const items = this.run.forgeableKeepsakes()
        .map(k => this.run.forgePreview(k.id)).filter(Boolean);
      const ov = el('div', 'rm-picker rs-forge');
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.setAttribute('aria-label', 'Forge a Keepsake');
      ov.innerHTML = `
        <div class="rm-picker__scrim"></div>
        <div class="rm-picker__panel">
          <h2>Which Keepsake goes in the flame?</h2>
          <p class="rm-picker__sub">Costs ${this.run.forgeCost()} maximum ${esc(TERMS.hp)}.
             A forged Keepsake does its opening trick twice.</p>
          <div class="rs-forgelist" role="listbox" aria-label="Your Keepsakes"></div>
          <div class="rm-picker__foot">
            <p class="rm-picker__read" aria-live="polite"></p>
            <button type="button" class="rm-btn rm-btn--ghost" data-cancel>Not this one <kbd>Esc</kbd></button>
            <button type="button" class="rm-btn rm-btn--go" data-ok disabled>Put it in the flame</button>
          </div>
        </div>`;
      const list = ov.querySelector('.rs-forgelist');
      const read = ov.querySelector('.rm-picker__read');
      const ok = ov.querySelector('[data-ok]');
      let chosen = null;

      for (const it of items) {
        const row = el('button', 'rs-forgerow');
        row.type = 'button';
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', 'false');
        row.dataset.id = it.id;
        row.innerHTML = `
          <span class="rs-forgerow__sig"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${relicSigil(it.id)}"/></svg></span>
          <span class="rs-forgerow__txt">
            <b>${esc(it.name)}</b>
            <span class="rs-ba">
              <em class="rs-ba__before">${esc(it.before)}</em>
              <i aria-hidden="true">&rarr;</i>
              <em class="rs-ba__after">${esc(it.after)}</em>
            </span>
          </span>`;
        if (!it.worthwhile) row.classList.add('is-weak');
        row.addEventListener('click', () => {
          chosen = it.id;
          for (const n of list.children) {
            n.classList.toggle('is-chosen', n.dataset.id === chosen);
            n.setAttribute('aria-selected', String(n.dataset.id === chosen));
          }
          read.textContent = it.worthwhile
            ? `${it.name} will fire twice.`
            : `${it.name} has no opening trick — forging it does very little.`;
          ok.disabled = false;
        });
        list.appendChild(row);
      }

      const done = (v) => { offRove?.(); ov.remove(); resolve(v); };
      const offRove = rovingFocus(list, '.rs-forgerow', { cols: 0 });
      ov.querySelector('[data-cancel]').addEventListener('click', () => done(null));
      ok.addEventListener('click', () => chosen && done(chosen));
      ov.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); done(null); }
      });
      this.root.appendChild(ov);
      this._own(() => ov.remove());
      requestAnimationFrame(() => list.querySelector('.rs-forgerow')?.focus());
    });
  }

  /* ── chrome ───────────────────────────────────────────────────────────── */
  _say(text) {
    if (!this.$line) {
      this.$line = el('p', 'rs-line');
      this.$line.setAttribute('role', 'status');
      this.$line.setAttribute('aria-live', 'polite');
      this.$foot.prepend(this.$line);
    }
    this.$line.textContent = text;
  }

  _buildFoot() {
    this._say('');
    this._primary('Pack up and go on', () => this._leave(), {
      hint: 'you have not used the fort yet', key: 'Enter',
    });
    const sync = () => {
      const hint = this.$go.querySelector('em');
      if (hint) hint.textContent = this.used ? '' : 'you have not used the fort yet';
    };
    sync();
    this._own(bus.on('run:courage', sync));
  }

  _bindKeys() {
    this._on(window, 'keydown', (e) => {
      if (e.defaultPrevented || this.root.querySelector('.rm-picker')) return;
      if (e.key === 'Escape') { e.preventDefault(); this._leave(); return; }
      if (e.key >= '1' && e.key <= '4') {
        const o = this._options?.[Number(e.key) - 1];
        if (o) { e.preventDefault(); this.root.querySelector(`[data-opt="${o.id}"]`)?.focus(); }
      }
    });
  }
}

const DOOR_GLYPH = {
  rest: '<svg viewBox="0 0 24 24"><path d="M4 17v-5a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v5M2 17h20v3H2ZM7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/></svg>',
  upgrade: '<svg viewBox="0 0 24 24"><path d="M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4ZM19 3v4M17 5h4"/></svg>',
  forge: '<svg viewBox="0 0 24 24"><path d="M12 3c3.6 4.6 1.6 7 0 9.4C9.6 10 8.4 7.6 12 3ZM6 14h12l-1.6 7H7.6Z"/></svg>',
  sit: '<svg viewBox="0 0 24 24"><path d="M8 20c0-4 2-6 4-6s4 2 4 6ZM12 11a3 3 0 1 1 0-.01M4 20c0-2.4 1.4-4 3-4M20 20c0-2.4-1.4-4-3-4"/></svg>',
};

export default RestScene;
