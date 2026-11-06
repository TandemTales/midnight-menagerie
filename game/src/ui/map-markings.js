/** Personal wax-pencil marks in sheet coordinates. Never part of run RNG/state. */
import { kidPortrait } from './portrait.js';

export class MapMarkings {
  constructor(scene) {
    this.scene = scene;
    this.off = []; this.history = []; this.mode = 'pan'; this.color = 'yellow';
    this.key = `mm.blueprint-marks.v2:${scene.model.seed}:${scene.model.regionId}:plan${scene.model.map.plan.v}:${scene.SW}`;
    this.strokes = [];
    try {
      const saved = JSON.parse(localStorage.getItem(this.key) || '[]');
      if (Array.isArray(saved)) this.strokes = saved.filter(s =>
        ['yellow', 'red', 'green', 'white'].includes(s.color) && Array.isArray(s.points)
        && s.points.length && s.points.length <= 4000
        && s.points.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
      ).slice(-300);
    } catch { /* Storage may be disabled; the tools still work for this visit. */ }
    const ns = 'http://www.w3.org/2000/svg';
    this.svg = document.createElementNS(ns, 'svg');
    this.svg.classList.add('map-player-marks');
    this.svg.setAttribute('viewBox', `0 0 ${scene.SW} ${scene.SH}`);
    this.svg.setAttribute('aria-hidden', 'true');
    scene.el.sheet.append(this.svg);
    this.bar = document.createElement('div');
    this.bar.className = 'map-tools';
    this.bar.setAttribute('role', 'group'); this.bar.setAttribute('aria-label', 'Map pencils and navigation');
    /* Drawn as a pencil tray (scenes/map.css): every word below is live and lettered on its
       own object, and the small drawings are the graphite a Kid would add to a label. The
       actions sit in pairs on one enamel nameplate each (.map-tools__case). */
    const ink = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
    this.bar.innerHTML = `<span class="map-tools__title">Our notes</span>
      <button data-tool="pan" aria-pressed="true" title="Move the sheet (V)">${ink('M9 12V4.5a1.6 1.6 0 0 1 3.2 0V11m0-1.4a1.5 1.5 0 0 1 3 0V11m0-.6a1.5 1.5 0 0 1 3 0V12m0-.4a1.4 1.4 0 0 1 2.8 0V15c0 4-2.6 6.5-6.5 6.5-3 0-4.6-1.2-6-3.4L4.2 14c-.9-1.4 1-2.8 2.2-1.6L9 15')}<span>Hand</span></button>
      ${['yellow', 'red', 'green', 'white'].map(c => `<button class="map-pencil map-pencil--${c}" data-tool="${c}" aria-label="${c} marker" aria-pressed="false" title="Draw with the ${c} marker"><i aria-hidden="true"></i><span>${c === 'white' ? 'Chalk' : c}</span></button>`).join('')}
      <button data-tool="erase" aria-pressed="false" title="Erase your strokes (E)">Eraser</button>
      <span class="map-tools__case"><button data-action="undo" title="Undo the last drawing or erasure (Ctrl Z)">Undo</button><button data-action="clear" title="Erase all your marks on this wing; Undo restores them">Clear</button></span>
      <span class="map-tools__divider"></span>
      <span class="map-tools__case"><button data-action="stamp" title="Mark the selected room with an X (M)">${ink('M5 5.5 19 19M18.5 5 5.5 19')}<span>X room</span></button><button data-action="remove" title="Erase your marks at the selected room (Delete)">Unmark</button></span>
      <span class="map-tools__case"><button data-action="here" title="Return to your current room (0)">${ink('M12 21.5s6.8-6.7 6.8-11.6a6.8 6.8 0 0 0-13.6 0C5.2 14.8 12 21.5 12 21.5ZM12 7.6a2.4 2.4 0 1 0 .01 0')}<span>You are here</span></button><button data-action="overview" title="See the whole sheet">${ink('M3.5 5.5 9 3.5l6 2 5.5-2v15l-5.5 2-6-2-5.5 2ZM9 3.5v15M15 5.5v15')}<span>Overview</span></button></span>
      <button data-action="out" aria-label="Zoom out">−</button>
      <button data-action="in" aria-label="Zoom in">+</button>
      <output class="map-tools__status" aria-live="polite">Drag / scroll · Shift scroll sideways · Ctrl scroll zoom</output>`;
    scene.el.screen.append(this.bar);
    this.status = this.bar.querySelector('output');
    this.on(this.bar, 'click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tool) this.select(b.dataset.tool);
      else this.action(b.dataset.action);
    });
    const vp = scene.el.viewport;
    this.on(vp, 'pointerdown', e => {
      if (e.button !== 0 || this.mode === 'pan') return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (this.active != null) return;
      this.active = e.pointerId; this.remember();
      vp.setPointerCapture(e.pointerId);
      const p = this.point(e);
      if (this.mode === 'erase') { this.lastErase = p; this.erase(p, p); }
      else {
        this.stroke = { color: this.color, points: [p] };
        this.strokes.push(this.stroke);
        this.path = this.makePath(this.stroke);
      }
      scene._hideTip();
    }, true);
    this.on(window, 'pointermove', e => {
      if (this.active !== e.pointerId) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const p = this.point(e);
      if (this.mode === 'erase') { this.erase(this.lastErase, p); this.lastErase = p; }
      else if (this.stroke && this.stroke.points.length < 4000) {
        const last = this.stroke.points.at(-1);
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2 / scene.view.z) return;
        this.stroke.points.push(p); this.path.setAttribute('d', this.d(this.stroke));
      }
    }, true);
    const end = e => {
      if (this.active !== e.pointerId) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (vp.hasPointerCapture(e.pointerId)) vp.releasePointerCapture(e.pointerId);
      this.active = null; this.stroke = null; this.path = null; this.save();
    };
    this.on(window, 'pointerup', end, true);
    this.on(window, 'pointercancel', end, true);
    this.on(vp, 'click', e => {
      if (this.mode !== 'pan') { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    this.on(window, 'keydown', e => {
      /* This listens on window in the capture phase, ahead of every dialog's own
         keys: without this line Escape could not close Discoveries, How to play or
         Settings over the map, and M or Delete changed the marks behind them. */
      if (document.querySelector('.mm-modal, dialog[open]')) return;
      if (e.target.closest?.('input,textarea,select') || e.target.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault(); this.action('undo'); return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('.map-tools')) return;
      const k = e.key.toLowerCase();
      /* Escape puts a pencil down. With none in hand it is not this bar's key: the
         HUD opens Settings on it, and a controller's Start and Cancel send it. */
      if (k === 'escape' && this.mode === 'pan') return;
      if (k === 'v' || k === 'escape') this.select('pan');
      else if (k === 'e') this.select('erase');
      else if (k === 'm') this.action('stamp');
      else if (k === 'delete') this.action('remove');
      else return;
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);
    this.render();
    /* The scene paints the ballot as words and initials; this dresses what it painted, so the
       rooms and the strip show faces and neither one's text changes. See dressBallot. */
    const paintBallot = scene._paintBallot;
    scene._paintBallot = (...args) => { paintBallot.apply(scene, args); this.dressBallot(); };
    this.off.push(() => { delete scene._paintBallot; });
    this.dressBallot();
  }
  /**
   * A friend's vote as a pin stuck in the blueprint: their face in a brass head, their initial
   * in their own pencil on a slip of paper under it, one pin each. The strip gets the same faces
   * as a roll of who has chosen. Only ever adds elements around the scene's text: `.mn-votes`
   * still reads "M A" and `.map-ballot` still reads its sentence.
   */
  dressBallot() {
    const s = this.scene, run = s.model?.run, bar = s.el?.ballot;
    const book = (run && typeof run.votesPending === 'function') ? run.pendingVote : null;
    const votes = book && book.nodeId === (run.currentNodeId || null) ? book.votes : {};
    const face = (seat) => {
      const slug = run.kids?.[seat]?.kid;
      const img = slug ? kidPortrait({ slug }, { w: 96, h: 96, variant: 'thumb' }) : document.createElement('i');
      img.alt = '';
      img.setAttribute?.('aria-hidden', 'true');
      return img;
    };
    for (const [id, el] of s._nodeEls || []) {
      const pin = el.querySelector('.mn-votes');
      if (!pin) continue;
      const who = Object.keys(votes).map(Number).sort((a, b) => a - b).filter(seat => votes[seat] === id);
      pin.replaceChildren(...who.flatMap((seat, i) => {
        const mark = document.createElement('span');
        mark.className = 'mn-vote';
        mark.dataset.seat = String(seat);
        const tag = document.createElement('b');
        tag.textContent = s._kidTag(seat);
        mark.append(face(seat), tag);
        return i ? [' ', mark] : [mark];
      }));
    }
    if (!bar || bar.hidden || !run || typeof run.voters !== 'function') return;
    const roll = document.createElement('span');
    roll.className = 'map-ballot__roll';
    roll.setAttribute('aria-hidden', 'true');
    for (const seat of run.voters()) {
      const mark = document.createElement('span');
      mark.className = 'map-ballot__seat' + (votes[seat] !== undefined ? ' is-in' : '');
      mark.append(face(seat));
      roll.append(mark);
    }
    bar.querySelector('.map-ballot__roll')?.remove();
    bar.prepend(roll);
  }
  on(el, event, fn, options) {
    el.addEventListener(event, fn, options);
    this.off.push(() => el.removeEventListener(event, fn, options));
  }
  point(e) {
    const r = this.scene._vpRect(), v = this.scene.view;
    return [Math.max(0, Math.min(this.scene.SW, (e.clientX - r.left - v.x) / v.z)),
      Math.max(0, Math.min(this.scene.SH, (e.clientY - r.top - v.y) / v.z))];
  }
  d(s) { return 'M' + s.points.map(p => p.map(v => v.toFixed(1)).join(',')).join(' L') + (s.points.length === 1 ? ' l0.1,0' : ''); }
  makePath(s) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', this.d(s)); path.setAttribute('class', `map-pencil--${s.color}`);
    this.svg.append(path); return path;
  }
  render() {
    this.svg.replaceChildren(); this.strokes.forEach(s => this.makePath(s));
    this.bar.querySelector('[data-action="undo"]').disabled = !this.history.length;
    this.bar.querySelector('[data-action="clear"]').disabled = !this.strokes.length;
  }
  remember() {
    this.history.push(JSON.stringify(this.strokes));
    if (this.history.length > 30) this.history.shift();
  }
  save() {
    this.strokes = this.strokes.slice(-300);
    try {
      localStorage.setItem(this.key, JSON.stringify(this.strokes));
      const indexKey = 'mm.blueprint-marks.index';
      const old = JSON.parse(localStorage.getItem(indexKey) || '[]');
      const keys = [...(Array.isArray(old) ? old : []).filter(k => k !== this.key), this.key];
      while (keys.length > 24) {
        const k = keys.shift(); if (typeof k === 'string' && k.startsWith('mm.blueprint-marks.v2:')) localStorage.removeItem(k);
      }
      localStorage.setItem(indexKey, JSON.stringify(keys));
    } catch { this.status.textContent = 'Marks kept for this visit; storage is unavailable'; }
    this.render();
  }
  select(tool) {
    if (this.active != null) return;
    this.scene._hideTip();
    this.mode = ['pan', 'erase'].includes(tool) ? tool : 'draw';
    if (this.mode === 'draw') this.color = tool;
    this.scene.el.screen.dataset.mapTool = this.mode;
    this.bar.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
    this.status.textContent = this.mode === 'pan' ? 'Drag / scroll · Shift scroll sideways · Ctrl scroll zoom'
      : this.mode === 'erase' ? 'Rub out your marks · V returns to Hand' : 'Draw on the sheet · V returns to Hand';
  }
  erase(a, b) {
    const radius = 18 / this.scene.view.z;
    // Swept eraser: catches strokes even when a fast pointer skips between samples.
    const distance = (p, u, v) => {
      const dx = v[0] - u[0], dy = v[1] - u[1];
      const t = Math.max(0, Math.min(1, ((p[0] - u[0]) * dx + (p[1] - u[1]) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(p[0] - u[0] - t * dx, p[1] - u[1] - t * dy);
    };
    const cross = (u, v, p) => (v[0]-u[0])*(p[1]-u[1])-(v[1]-u[1])*(p[0]-u[0]);
    const hits = (u, v) => Math.min(distance(u,a,b), distance(v,a,b), distance(a,u,v), distance(b,u,v)) <= radius
      || (cross(a,b,u)*cross(a,b,v) < 0 && cross(u,v,a)*cross(u,v,b) < 0);
    const before = this.strokes.length;
    this.strokes = this.strokes.filter(s => !s.points.some((p, i) => hits(p, s.points[Math.max(0, i-1)])));
    if (before !== this.strokes.length) this.render();
  }
  action(action) {
    if (this.active != null) return;
    const s = this.scene;
    s._hideTip();
    if (action === 'here') { s._fitView(); return; }
    if (action === 'overview') {
      s.view.z = s._fitZoom; s.view.x = s.view.y = 0; s._applyView(); return;
    }
    if (action === 'in' || action === 'out') { s._zoomCentre(action === 'in' ? 1.2 : 1/1.2); return; }
    if (action === 'undo') {
      if (this.history.length) { this.strokes = JSON.parse(this.history.pop()); this.save(); this.status.textContent = 'Last change undone'; }
      return;
    }
    this.remember();
    if (action === 'clear') { this.strokes = []; this.status.textContent = 'Your marks are cleared · Undo brings them back'; }
    else {
      const n = s.model.map.nodes.find(n => n.id === s._focusId) || s.model.map.nodes.find(n => n.id === s.model.currentId) || s.model.map.nodes[0];
      const x = n.x * s.SW, y = n.y * s.SH;
      if (action === 'stamp') {
        this.strokes.push({ color: this.color, points: [[x-25,y-25],[x+25,y+25]] },
          { color: this.color, points: [[x-25,y+25],[x+25,y-25]] });
        s._lookAt(n, 0);
        this.status.textContent = `Marked ${n.roomName || 'selected room'}`;
      } else if (action === 'remove') { this.erase([x-35,y-35],[x+35,y+35]); this.status.textContent = 'Erased marks at the selected room'; }
    }
    this.save();
  }
  destroy() {
    if (this.active != null) this.save();
    for (const off of this.off) off();
    this.svg.remove(); this.bar.remove();
  }
}
