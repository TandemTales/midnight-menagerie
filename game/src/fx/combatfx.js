/**
 * CombatFX — damage numbers, impact particles, shatters, deaths.
 * OWNER: combat-scene.  Spec: docs/STS2-REFERENCE.md §4.
 *
 * Two surfaces, both inside the combat scene root:
 *   • one <canvas> for particles (struct-of-arrays pool, zero per-frame alloc)
 *   • one <div> for floating numbers (DOM so they inherit the type tokens and
 *     stay crisp and legible over any background — §4 "numbers stay legible
 *     during shake and particles")
 *
 * Every colour comes from ui/tokens.css, read once at construction.
 *
 *   const fx = new CombatFX(ctx, root);
 *   fx.number(x, y, 12, { kind: 'damage', mag: 12 });
 *   fx.burst(x, y, { color: fx.col.threat, count: 18, speed: 320 });
 *   fx.shatter(x, y); fx.shimmer(x, y); fx.death(x, y, ['#8c8375', ...]);
 *   fx.update(dt);  fx.resize();  fx.destroy();
 */

const MAX_P = 1100;
const MAX_N = 28;
const TAU = Math.PI * 2;

/* particle kinds */
const K_SPARK = 0;   // small, gravity, additive
const K_SHARD = 1;   // rotating quad — block shatter
const K_MOTE = 2;    // slow riser — death
const K_RING = 3;    // expanding stroked circle
const K_DUST = 4;    // soft round puff, no additive
/* A WEAPON TRAIL. px,py = pivot, pw = radius, pr = start angle, pg = sweep.
   STS2-REFERENCE §4 asks for a strike that swings something, and a burst at
   the point of contact has no travel in it — this is the travel. */
const K_ARC = 5;

export class CombatFX {
  /**
   * @param {object} ctx  scene ctx ({ clock, Save, atmosphere, audio })
   * @param {HTMLElement} root  the combat scene root
   */
  constructor(ctx, root) {
    this.ctx = ctx || {};
    this.clock = this.ctx.clock || null;
    this.reduceMotion = !!this.ctx.Save?.settings?.reduceMotion;
    /* THE FLASHES SLIDER IS A 0..1 RANGE, not a boolean (`ui/settings.js`
       declares it `type:'range', min:0, max:1, step:0.1`). Round 4 read it as
       `!== 0`, so 10% and 100% were the same picture and the only value that
       did anything was exactly zero. `glow` is the additive gain every
       lit particle is drawn through; `setFlashes` keeps it live when the
       player moves the slider mid-fight. */
    this.flashes = 1;
    this.glow = 1;
    this.setFlashes(this.ctx.Save?.settings?.flashes, this.reduceMotion);
    this.showNumbers = this.ctx.Save?.settings?.showDamageNumbers !== false;

    const layer = document.createElement('div');
    layer.className = 'cb-fx';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `<canvas class="cb-fx__c"></canvas><div class="cb-fx__nums"></div>`;
    root.appendChild(layer);
    this.el = layer;
    this.canvas = layer.querySelector('canvas');
    this.$nums = layer.querySelector('.cb-fx__nums');
    /* NO `desynchronized: true` HERE. It is the low-latency hint, and it lets
       this canvas present OUTSIDE the page's compositing sync — which on
       Windows/Chromium tears and flickers when the layer sits on top of the
       WebGL canvas, as this one does. Observed 2026-09-01 as a constant
       full-screen flicker in combat that briefly stopped on every `impact()`
       (the hit flash forces a full composite) and resumed immediately after.
       The latency this buys is worth nothing to particles and damage numbers. */
    this.g = this.canvas.getContext('2d', { alpha: true });

    // ── pools ────────────────────────────────────────────────────────────
    this.n = 0;
    this.px = new Float32Array(MAX_P); this.py = new Float32Array(MAX_P);
    this.vx = new Float32Array(MAX_P); this.vy = new Float32Array(MAX_P);
    this.pl = new Float32Array(MAX_P); this.pL = new Float32Array(MAX_P);
    this.ps = new Float32Array(MAX_P); this.pr = new Float32Array(MAX_P);
    this.pw = new Float32Array(MAX_P); this.pg = new Float32Array(MAX_P);
    this.pk = new Uint8Array(MAX_P);
    this.pc = new Array(MAX_P).fill('#fff');

    this.nums = [];
    for (let i = 0; i < MAX_N; i++) {
      const d = document.createElement('div');
      d.className = 'cb-num';
      d.style.display = 'none';
      this.$nums.appendChild(d);
      this.nums.push({ el: d, live: 0, t: 0, dur: 1, x: 0, y: 0, h: 0, rise: 0, drift: 0, scale: 1 });
    }

    this.col = readTokens(root);
    // 1.5 is the point past which extra particle resolution stops being visible
    // and starts costing frames on a full-screen surface.
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this._painted = false;
    this.resize();
  }

  resize() {
    const r = this.el.getBoundingClientRect();
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.left = r.left; this.top = r.top;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return this;
  }

  /** Viewport px -> layer px. */
  toLocal(x, y, out) {
    const o = out || { x: 0, y: 0 };
    o.x = x - this.left; o.y = y - this.top;
    return o;
  }

  /* ── particles ──────────────────────────────────────────────────────────── */
  _spawn(kind, x, y, vx, vy, life, size, color, grav, spin) {
    if (this.n >= MAX_P) return -1;
    const i = this.n++;
    this.pk[i] = kind;
    this.px[i] = x; this.py[i] = y;
    this.vx[i] = vx; this.vy[i] = vy;
    this.pl[i] = life; this.pL[i] = life;
    this.ps[i] = size; this.pc[i] = color;
    this.pg[i] = grav; this.pr[i] = 0; this.pw[i] = spin || 0;
    return i;
  }

  /** An impact: a hot spark burst plus a shock ring. */
  burst(x, y, o = {}) {
    if (this.reduceMotion) return this;
    const n = Math.round((o.count ?? 16) * (0.4 + 0.6 * this.flashes));
    const sp = o.speed ?? 300;
    const col = o.color || this.col.flame;
    const spread = o.spread ?? TAU;
    const a0 = o.angle ?? 0;
    for (let i = 0; i < n; i++) {
      const a = a0 + (Math.random() - 0.5) * spread;
      const s = sp * (0.35 + Math.random() * 0.9);
      this._spawn(K_SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s,
        0.28 + Math.random() * 0.38, 1.6 + Math.random() * 3.1, col, 820, 0);
    }
    if (o.ring !== false) this.ring(x, y, col, o.ringR ?? (34 + (o.count ?? 16) * 1.6));
    return this;
  }

  ring(x, y, color, r = 46, life = 0.34) {
    if (this.reduceMotion) return this;
    const i = this._spawn(K_RING, x, y, 0, 0, life, 6, color || this.col.flame, 0, 0);
    if (i >= 0) this.pw[i] = r;
    return this;
  }

  /** Guard gained: a cool upward shimmer. */
  shimmer(x, y, color) {
    if (this.reduceMotion) return this;
    const col = color || this.col.guard;
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.7;
      const s = 70 + Math.random() * 130;
      this._spawn(K_MOTE, x + (Math.random() - 0.5) * 54, y + (Math.random() - 0.5) * 30,
        Math.cos(a) * s * 0.4, Math.sin(a) * s, 0.5 + Math.random() * 0.4,
        1.6 + Math.random() * 2.4, col, -30, 0);
    }
    this.ring(x, y, col, 40, 0.4);
    return this;
  }

  /** Guard broken: hard shards fly off. */
  shatter(x, y, color) {
    const col = color || this.col.guard;
    if (this.reduceMotion) return this;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + Math.random() * 0.4;
      const s = 180 + Math.random() * 260;
      this._spawn(K_SHARD, x, y, Math.cos(a) * s, Math.sin(a) * s - 60,
        0.5 + Math.random() * 0.34, 4 + Math.random() * 7, col, 1100,
        (Math.random() - 0.5) * 22);
    }
    this.ring(x, y, col, 76, 0.3);
    return this;
  }

  /** Death: a slow, sad bloom of motes plus a puff of the creature's own colour. */
  death(x, y, palette) {
    const p = palette && palette.length ? palette : [this.col.spectre, this.col.text, this.col.ink];
    for (let i = 0; i < (this.reduceMotion ? 8 : 44); i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const s = 30 + Math.random() * 130;
      this._spawn(K_MOTE, x + (Math.random() - 0.5) * 90, y + (Math.random() - 0.5) * 80,
        Math.cos(a) * s * 0.55, Math.sin(a) * s, 0.9 + Math.random() * 1.0,
        2 + Math.random() * 4, p[i % p.length], -34, 0);
    }
    for (let i = 0; i < (this.reduceMotion ? 4 : 22); i++) {
      const a = Math.random() * TAU;
      const s = 40 + Math.random() * 150;
      this._spawn(K_DUST, x, y, Math.cos(a) * s, Math.sin(a) * s * 0.5,
        0.6 + Math.random() * 0.6, 9 + Math.random() * 18, p[2] || p[0], 120, 0);
    }
    this.ring(x, y, this.col.spectre, 130, 0.6);
    return this;
  }

  /** A quick directional claw-mark at the point of contact. */
  slash(x, y, angle = -0.5, color) {
    if (this.reduceMotion) return this;
    this.burst(x, y, {
      color: color || this.col.threat, count: 13, speed: 420,
      angle, spread: 0.85, ring: false,
    });
    this.ring(x, y, color || this.col.threat, 30, 0.22);
    return this;
  }

  /**
   * A WEAPON TRAIL: a crescent that sweeps through an arc and fades from the
   * tail. STS2-REFERENCE §4 — "a strike swings a weapon" — is about the swing
   * having a PATH, not about a burst appearing at the end of one. `slash` marks
   * the contact; this is the travel that caused it.
   *
   * @param {number} x @param {number} y  centre of the arc, layer-local px
   * @param {number} r      radius of the swing
   * @param {number} a0     start angle, radians
   * @param {number} sweep  signed sweep, radians
   */
  swing(x, y, r = 90, a0 = -1.2, sweep = 1.9, color, life = 0.26) {
    if (this.reduceMotion) return this;
    const i = this._spawn(K_ARC, x, y, 0, 0, life, 7, color || this.col.flame, 0, 0);
    if (i >= 0) { this.pw[i] = r; this.pr[i] = a0; this.pg[i] = sweep; }
    return this;
  }

  /* ── floating numbers ───────────────────────────────────────────────────── */
  /**
   * @param {number} x @param {number} y  layer-local px
   * @param {string|number} text
   * @param {object} o { kind:'damage'|'blocked'|'block'|'heal'|'crit'|'status'|'miss',
   *                     mag, delay, rise }
   *   `rise` caps how far the numeral climbs, in px. The caller needs it because
   *   the default 62-100px carried a damage number off the top of a short rig
   *   and straight onto that enemy's intent chip — every hit briefly replaced
   *   the intent's value with the damage value, in the same spot.
   */
  number(x, y, text, o = {}) {
    if (!this.showNumbers && o.kind !== 'status') return this;
    const owned=['status','buff','debuff','counter','blocked'].includes(o.kind)&&o.actor;
    if(owned&&!this._retryWord&&this.wordQueue?.some(e=>e.o.actorId===o.actorId)){
      this._deferWord(x,y,text,o);return this;
    }
    const s = this.nums.find(n => !n.live);
    if (!s) {if(owned&&!this._retryWord)this._deferWord(x,y,text,o);return this;}
    const mag = o.mag ?? (typeof text === 'number' ? text : 6);
    // scaled by magnitude — a 30 must not look like a 3
    const scale = clamp(0.82 + Math.log(1 + Math.max(0, mag)) * 0.30, 0.82, 2.15);
    s.live = 1; s.t = -(o.delay || 0); s.born = this._born = (this._born || 0) + 1;
    s.dur = 0.72 + scale * 0.24;
    s.x = x + (Math.random() - 0.5) * 26;
    s.rise = o.rise > 0 ? Math.min(o.rise, 62 + scale * 26) : 62 + scale * 26;
    s.drift = (Math.random() - 0.5) * 34;
    s.scale = scale;
    const el = s.el;
    el.textContent = String(text);
    el.dataset.kind = o.kind || 'damage';
    el.classList.toggle('is-big', scale > 1.5);
    el.style.display = '';
    el.style.opacity = '0';
    const tag = ['status', 'buff', 'debuff', 'counter', 'blocked'].includes(o.kind);
    s.actorId = tag && o.actor ? o.actorId : null;
    s.ownerBounds = s.actorId ? o : null;
    el.dataset.actorId = s.actorId || '';
    delete el.dataset.side;
    if (s.actorId) {
      // Reserve the largest pop/fade scale. Fixed local groups retain the same
      // pop, fade and lifetime without drifting across neighboring silhouettes.
      // Measure without the previous pooled slot's animation transform. Text
      // can extend asymmetrically outside its line box (notably Cinzel caps).
      const priorTransform = el.style.transform;
      el.style.transform = 'none';
      const box = el.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(el);
      const ink = range.getBoundingClientRect();
      const left = Math.min(box.left, ink.left), right = Math.max(box.right, ink.right);
      const top = Math.min(box.top, ink.top), bottom = Math.max(box.bottom, ink.bottom);
      el.style.transform = priorTransform;
      // Include scale rounding (three decimals) and translation rounding (tenths).
      // A line on a board never swells past its own line: _updateNumbers holds an
      // owned word at its landed scale, so its envelope is that scale, not the 12%
      // a loose floater grows by as it fades.
      const maximum = scale + .0005;
      s.wordW = (right - left) * maximum + .1;
      s.wordH = (bottom - top) * maximum + .1;
      // A constant offset at maximum scale nests every smaller envelope around
      // the DOM transform center, including independent translate: -50% -50%.
      s.wordDX = ((box.left + box.right) - (left + right)) * maximum / 2;
      s.wordDY = ((box.top + box.bottom) - (top + bottom)) * maximum / 2;
      s.drift = 0; s.rise = 0; s.y = y;
      if(!this._fitWords(o)){
        s.live=0;el.style.display='none';
        if(!this._retryWord)this._deferWord(x,y,text,o);
        return this;
      }
      this._lastWordFit=true;
    } else {
      s.y = this._lane(s, x, y, (el.offsetHeight || 20) * scale);
    }
    el.style.transform = `translate3d(${s.x}px,${s.y}px,0) scale(0.4)`;
    return this;
  }

  /** One measured cartouche per owner, reserved alongside the ribbon envelopes. */
  _ownerCaption(actor) {
    this.ownerCaptions ??= new Map();
    let cap=this.ownerCaptions.get(actor.id);
    if(!cap){
      /* ROUND 61 REPAIR 5: the owner's conditions land on ONE framed board, the party
         tiles' violet enamel plate in its bowed gilt rim, with the owner lettered at its head
         and each condition on its own line under an engraved gilt rule. The board is laid by
         _fitWords as part of the group's envelope, so it is held clear of every face,
         nameplate, Courage bar and intent exactly as the words were. */
      const board=document.createElement('div');board.className='cb-fx-board';
      board.dataset.fxBoard=actor.id;board.style.visibility='hidden';this.$nums.appendChild(board);
      const el=document.createElement('div');el.className='cb-fx-owner';
      el.dataset.fxOwner=actor.id;el.style.visibility='hidden';this.$nums.appendChild(el);
      cap={el,board};this.ownerCaptions.set(actor.id,cap);
    }
    cap.ownerElement=actor.element;
    const name=actor.name||actor.id;
    if(cap.el.textContent!==name){
      cap.el.textContent=name;
      const range=document.createRange();range.selectNodeContents(cap.el);
      const box=cap.el.getBoundingClientRect(),text=range.getBoundingClientRect();
      cap.dx=Math.max(0,box.left-text.left);cap.dy=Math.max(0,box.top-text.top);
      cap.w=Math.max(box.right,text.right)-Math.min(box.left,text.left);
      cap.h=Math.max(box.bottom,text.bottom)-Math.min(box.top,text.top);
    }
    return cap;
  }

  _syncOwnerCaptions() {
    for(const [id,cap] of this.ownerCaptions||[]){
      const live=this.nums.filter(n=>n.live&&n.actorId===id);
      if(cap.ownerElement&&!cap.ownerElement.isConnected){for(const n of live){n.live=0;n.el.style.display='none';}cap.el.remove();cap.board?.remove();this.ownerCaptions.delete(id);continue;}
      if(!live.length){cap.el.remove();cap.board?.remove();this.ownerCaptions.delete(id);continue;}
      // the board and its head fade with the last line still on it
      const shown=live.filter(n=>n.t>=0).reduce((a,n)=>Math.max(a,+n.el.style.opacity||0),0);
      const vis=shown>0?'visible':'hidden';
      cap.el.style.visibility=vis;cap.el.style.opacity=String(shown);
      if(cap.board){cap.board.style.visibility=vis;cap.board.style.opacity=String(shown);}
    }
  }

  /** Fit actor-local groups. Dense overflow waits instead of covering the board. */
  _fitWords(bounds) {
    const gap=3, inset=12;
    const hit=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
    const obstacles=[...bounds.actors,...bounds.plates].map(b=>({left:b.left-2,right:b.right+2,top:b.top-2,bottom:b.bottom+2}));
    const groups=new Map();
    for(const n of this.nums)if(n.live&&n.actorId){
      if(!groups.has(n.actorId))groups.set(n.actorId,[]);groups.get(n.actorId).push(n);
    }
    // a board reads top to bottom in the order its lines landed, whatever pool slot each took
    for(const words of groups.values())words.sort((a,b)=>(a.born||0)-(b.born||0));
    const domains=[];
    for(const words of groups.values()){
      const actor=bounds.actors.find(a=>a.id===words[0].actorId)||words[0].ownerBounds.actor;
      const cap=this._ownerCaption(actor);
      const candidates=[];
      // A label's centre stays in its actor's horizontal neighborhood. This
      // avoids a clear but misleading ribbon above somebody else's head.
      const neighbors=bounds.actors.filter(a=>a.id!==actor.id);
      const leftNeighbor=neighbors.filter(a=>a.x<actor.x).sort((a,b)=>b.x-a.x)[0];
      const rightNeighbor=neighbors.filter(a=>a.x>actor.x).sort((a,b)=>a.x-b.x)[0];
      const ownerLeft=leftNeighbor?(leftNeighbor.x+actor.x)/2:inset;
      const ownerRight=rightNeighbor?(rightNeighbor.x+actor.x)/2:this.w-inset;
      // The board's rim and the rules between its lines are part of the envelope. The
      // owner's nameplate is seated ON the board's top rail, half above it, the way a
      // medallion rides a kit panel, so the band above a short enemy holds a whole board.
      const padX=13,padT=2,padB=6,rule=7,colGap=14;
      for(let cols=1;cols<=Math.min(words.length,3);cols++){
        const rows=[];
        for(let i=0;i<words.length;i+=cols){
          const row=words.slice(i,i+cols);
          rows.push({row,w:row.reduce((a,n)=>a+n.wordW,0)+colGap*(row.length-1),h:Math.max(...row.map(n=>n.wordH))});
        }
        const inner=Math.max(cap.w,...rows.map(r=>r.w)),w=inner+padX*2;
        const cells=[],rules=[];let y=cap.h+padT;
        for(const r of rows){
          if(cells.length){rules.push(y+rule/2-cap.h/2);y+=rule;}
          let x=padX+(inner-r.w)/2;
          for(const n of r.row){cells.push({n,left:x,right:x+n.wordW,top:y+(r.h-n.wordH)/2,bottom:y+(r.h+n.wordH)/2});x+=n.wordW+colGap;}
          y+=r.h;
        }
        const h=y+padB;
        cells.push({cap,left:(w-cap.w)/2,right:(w+cap.w)/2,top:0,bottom:cap.h});
        cells.push({board:cap,rules,left:0,right:w,top:cap.h/2,bottom:h});
        const xs=new Set([inset,actor.x-w/2,ownerLeft-w/2+1,ownerRight-w/2-1,actor.left-w-gap,actor.right+gap]);
        const ys=new Set([68,actor.top-219-cap.h/2,actor.top-h-gap,actor.top,actor.bottom+gap]);
        for(const b of obstacles){xs.add(b.left-w-gap);xs.add(b.right+gap);ys.add(b.top-h-1);ys.add(b.bottom+1);}
        for(const x0 of xs){const x=Math.round(x0);
          if(x<inset||x+w>this.w-inset||Math.abs(x+w/2-actor.x)>Math.max(230,(actor.right-actor.left)/2+180))continue;
          for(const y0 of ys){const y=Math.round(y0);
            if(y<inset||y+h>this.h-inset)continue;
            const cx=x+w/2,cy=y+h/2;
            if(cy<actor.top-180||cy>actor.bottom+80)continue;
            const boxes=cells.map(c=>({left:x+c.left,right:x+c.right,top:y+c.top,bottom:y+c.bottom}));
            if(boxes.some(box=>(box.top+box.bottom)/2<actor.top-220||(box.top+box.bottom)/2>actor.bottom+100||(box.left+box.right)/2<ownerLeft||(box.left+box.right)/2>ownerRight||Math.abs((box.left+box.right)/2-actor.x)>Math.max(230,(actor.right-actor.left)/2+180)||obstacles.some(b=>hit(box,b))))continue;
            // one line per condition, stacked, unless no single column fits
            const score=Math.hypot(cx-actor.x,(cy-actor.top)*.9)+w*.08+h*.03+(cols-1)*160;
            candidates.push({boxes,cells,score,actor});
          }
        }
      }
      candidates.sort((a,b)=>a.score-b.score);domains.push({words,candidates:candidates.slice(0,100)});
    }
    domains.sort((a,b)=>a.candidates.length-b.candidates.length);
    const chosen=[];let visited=0;
    // Forward-filter each remaining domain: impossible crowded sets stop early
    // instead of revisiting the same incompatible rectangles down every branch.
    const solve=(i,options)=>{
      if(i===domains.length)return true;if(++visited>384)return false;
      for(const c of options[i]){
        if(visited>=384)return false;
        const next=options.slice();let viable=true;
        for(let j=i+1;j<domains.length;j++){
          next[j]=options[j].filter(other=>!c.boxes.some(box=>other.boxes.some(b=>hit(box,b))));
          if(!next[j].length){viable=false;break;}
        }
        if(!viable)continue;
        chosen.push(c);if(solve(i+1,next))return true;chosen.pop();
      }return false;
    };
    const fit=solve(0,domains.map(d=>d.candidates));
    this.wordLayout={fit,groups:domains.length,visited,candidates:domains.map(g=>g.candidates.length)};
    if(!fit)return false;
    chosen.forEach(c=>c.cells.forEach((cell,j)=>{
      const box=c.boxes[j];
      if(cell.board){
        const b=cell.board.board;cell.board.boardBox=box;if(!b)return;
        b.style.transform=`translate3d(${box.left}px,${box.top}px,0)`;
        b.style.width=`${box.right-box.left}px`;b.style.height=`${box.bottom-box.top}px`;
        b.replaceChildren(...cell.rules.map(y=>{const r=document.createElement('i');r.className='cb-fx-board__rule';r.style.top=`${y}px`;return r;}));
        return;
      }
      if(cell.cap){cell.cap.box=box;cell.cap.el.style.transform=`translate3d(${box.left+(cell.cap.dx||0)}px,${box.top+(cell.cap.dy||0)}px,0)`;return;}
      const n=cell.n;n.x=(box.left+box.right)/2+n.wordDX;n.y=(box.top+box.bottom)/2+n.wordDY;n.wordBox=box;
      // Publish a group's new positions atomically, retaining each ribbon's current pop scale.
      n.el.style.transform=n.el.style.transform.replace(/^translate3d\([^)]*\)/,`translate3d(${n.x}px,${n.y}px,0)`);
      n.el.dataset.side=n.x<c.actor.left?'left':n.x>c.actor.right?'right':'above';
    }));
    return true;
  }

  _deferWord(x,y,text,o){
    (this.wordQueue??=[]).push({x,y,text,o});
  }

  _flushWords(){
    if(!this.wordQueue?.length)return;
    const blocked=new Set();
    for(const entry of [...this.wordQueue]){
      if(blocked.has(entry.o.actorId))continue;
      const fresh=entry.o.refreshBounds?.();
      // Despawned owners have no place for pending presentation. Retire the
      // entry once instead of repeatedly spawning an unowned label on retry.
      if(fresh&&!fresh.actor){
        this.wordQueue.splice(this.wordQueue.indexOf(entry),1);continue;
      }
      this._retryWord=true;this._lastWordFit=false;
      this.number(entry.x,entry.y,entry.text,{...entry.o,...fresh});
      this._retryWord=false;
      if(this._lastWordFit)this.wordQueue.splice(this.wordQueue.indexOf(entry),1);
      else blocked.add(entry.o.actorId);
    }
  }

  /**
   * ROUND 20 GRAFT (brief item 5b): floaters that land together STACK. A
   * card that stacks three conditions on the boss printed "+2 Vulnerable"
   * and "+4 Bristle" over each other at one spot, and a hit's number over
   * the word before it. A new floater starts clear BELOW every one still
   * climbing from near the same spot; they all rise the same way, so the
   * one that started first stays above it the whole way up.
   * @returns {number} the y it starts from
   */
  _lane(s, x, y, h) {
    s.h = h;
    let ny = y;
    const near = this.nums.filter((o) => o !== s && o.live && (s.actorId && o.actorId === s.actorId || Math.abs(o.x - x) < 130)
      && Math.max(0, o.t) < o.dur * 0.75)
      .sort((a, b) => s.actorId ? b.y - a.y : a.y - b.y);
    for (const o of near) {
      const gap = ((o.h || 20) + h) / 2 + 3;
      if (Math.abs(o.y - ny) < gap) ny = s.actorId ? o.y - gap : o.y + gap;
    }
    if (s.actorId && ny < 96) {
      const shift = 96 - ny;
      for (const o of this.nums) if (o !== s && o.live && o.actorId === s.actorId) o.y += shift;
      ny = 96;
    }
    return ny;
  }

  /** A word, not a number: "LETHAL", "BLOCKED", "Weak". */
  word(x, y, text, kind = 'status', owner = {}) {
    return this.number(x, y, text, { kind, mag: 4, ...owner });
  }

  /* ── frame ──────────────────────────────────────────────────────────────── */
  update(dt) {
    // particles — an idle board must not repaint a full-screen surface
    const g = this.g;
    if (this.n === 0 && !this._painted) { this._updateNumbers(dt); return this; }
    g.clearRect(0, 0, this.w, this.h);
    this._painted = this.n > 0;
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.pl[i] -= dt;
      if (this.pl[i] <= 0) {
        // swap-remove
        n--;
        if (i !== n) {
          this.px[i] = this.px[n]; this.py[i] = this.py[n];
          this.vx[i] = this.vx[n]; this.vy[i] = this.vy[n];
          this.pl[i] = this.pl[n]; this.pL[i] = this.pL[n];
          this.ps[i] = this.ps[n]; this.pr[i] = this.pr[n];
          this.pw[i] = this.pw[n]; this.pg[i] = this.pg[n];
          this.pk[i] = this.pk[n]; this.pc[i] = this.pc[n];
        }
        i--; continue;
      }
      const k = this.pk[i];
      if (k !== K_RING && k !== K_ARC) {
        this.vy[i] += this.pg[i] * dt;
        this.vx[i] *= 1 - Math.min(1, dt * (k === K_MOTE ? 1.2 : 2.4));
        this.px[i] += this.vx[i] * dt;
        this.py[i] += this.vy[i] * dt;
        this.pr[i] += this.pw[i] * dt;
      }
    }
    this.n = n;

    /* draw — grouped by blend mode to keep state changes down.
       `glow` is the Flashes slider: additive particles are the part of a hit
       that actually raises room luminance, so the slider scales their alpha
       rather than removing them. At 0% the sparks are still there, they just
       stop washing the frame. */
    const glow = this.glow;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const k = this.pk[i];
      if (k === K_DUST) continue;
      const a = this.pl[i] / this.pL[i];
      g.globalAlpha = glow * (k === K_RING ? a * a * 0.65 : Math.min(1, a * 1.5));
      g.fillStyle = this.pc[i];
      const x = this.px[i], y = this.py[i];
      if (k === K_RING) {
        const r = this.pw[i] * (1 - a * a);
        g.strokeStyle = this.pc[i];
        g.lineWidth = Math.max(1, this.ps[i] * a);
        g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, TAU); g.stroke();
      } else if (k === K_ARC) {
        /* The crescent leads with its head and dissolves from the tail: the
           swept fraction grows with time while the drawn tail shortens, which
           is what makes it read as a moving edge and not a static arc. */
        const p = 1 - a;
        const sweep = this.pg[i];
        const head = this.pr[i] + sweep * Math.min(1, p * 1.35);
        const tail = this.pr[i] + sweep * Math.max(0, p * 1.35 - 0.55);
        g.strokeStyle = this.pc[i];
        g.lineCap = 'round';
        g.lineWidth = Math.max(1, this.ps[i] * (0.4 + a * 0.9));
        g.beginPath();
        g.arc(x, y, Math.max(1, this.pw[i]), tail, head, sweep < 0);
        g.stroke();
        g.lineCap = 'butt';
      } else if (k === K_SHARD) {
        const s = this.ps[i];
        g.save(); g.translate(x, y); g.rotate(this.pr[i]);
        g.fillRect(-s * 0.5, -s * 0.35, s, s * 0.7);
        g.restore();
      } else {
        const s = this.ps[i] * (k === K_MOTE ? a * 0.6 + 0.4 : a);
        g.beginPath(); g.arc(x, y, Math.max(0.4, s), 0, TAU); g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < n; i++) {
      if (this.pk[i] !== K_DUST) continue;
      const a = this.pl[i] / this.pL[i];
      g.globalAlpha = a * a * 0.5;
      g.fillStyle = this.pc[i];
      g.beginPath(); g.arc(this.px[i], this.py[i], this.ps[i] * (1.4 - a * 0.5), 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    this._updateNumbers(dt);
    return this;
  }

  _updateNumbers(dt) {
    let released=false;
    for (const s of this.nums) {
      if (!s.live) continue;
      s.t += dt;
      if (s.t < 0) continue;
      const p = s.t / s.dur;
      if (p >= 1) { if(s.actorId)this._closeUp=true; s.live = 0; s.el.style.display = 'none'; released=true; continue; }
      // pop in fast, drift up, fade late
      const pop = p < 0.16 ? easeOutBack(p / 0.16) : 1;
      const rise = easeOutCubic(Math.min(1, p * 1.25));
      const fade = p < 0.62 ? 1 : 1 - (p - 0.62) / 0.38;
      let sc = s.scale * (0.4 + 0.6 * pop) * (1 + (1 - fade) * 0.12);
      if (s.actorId) sc = Math.min(sc, s.scale);
      s.el.style.opacity = String(Math.max(0, fade));
      s.el.style.transform =
        `translate3d(${(s.x + s.drift * rise).toFixed(1)}px,${(s.y - s.rise * rise).toFixed(1)}px,0) scale(${sc.toFixed(3)})`;
    }
    /* A line that has faded leaves no gap on its board: the lines still on it close up and
       the board shortens. If the shorter board cannot be laid (it always fits where the
       taller one did, so this is only stale bounds), everything stays where it is. */
    if(this._closeUp){
      this._closeUp=false;
      const last=this.nums.filter(n=>n.live&&n.actorId&&n.ownerBounds).sort((a,b)=>b.born-a.born)[0];
      if(last){const fresh=last.ownerBounds.refreshBounds?.();this._fitWords(fresh?.actor?fresh:last.ownerBounds);}
    }
    this._wordRetryIn=(this._wordRetryIn||0)-dt;
    if(released||(this.wordQueue?.length&&this._wordRetryIn<=0)){
      this._wordRetryIn=.25;this._flushWords();
    }
    this._syncOwnerCaptions();
    return this;
  }

  /**
   * Live update from `settings:changed`. Reduced motion's own hint promises it
   * "Overrides the settings above", so it pins the gain to zero regardless of
   * where the Flashes slider is sitting.
   */
  setFlashes(v, reduceMotion) {
    if (reduceMotion !== undefined) this.reduceMotion = !!reduceMotion;
    const n = Number(v);
    const g = this.reduceMotion ? 0 : (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1);
    this.flashes = g;
    // Never fully dark: a spark you cannot see is not an accessibility win,
    // it is a missing hit. 0.22 keeps the shape and drops the bloom.
    this.glow = 0.22 + 0.78 * g;
    return this;
  }

  clear() {
    this.wordQueue=[];
    for(const cap of this.ownerCaptions?.values()||[]){cap.el.remove();cap.board?.remove();}
    this.ownerCaptions?.clear();
    this.n = 0;
    for (const s of this.nums) { s.live = 0; s.el.style.display = 'none'; }
    this.g.clearRect(0, 0, this.w, this.h);
    return this;
  }

  destroy() { this.clear(); this.el.remove(); }
}

/* ── helpers ────────────────────────────────────────────────────────────────*/
function readTokens(root) {
  const cs = getComputedStyle(root);
  const v = (n, fb) => (cs.getPropertyValue(n) || '').trim() || fb;
  return {
    threat: v('--threat-300', '#f2654c'),
    threatHi: v('--threat-200', '#ff9c8a'),
    courage: v('--courage-300', '#f26d78'),
    guard: v('--guard-300', '#8fb7d9'),
    guardHi: v('--spectre-200', '#a8ecf7'),
    flame: v('--flame-300', '#f8c96b'),
    flameHi: v('--flame-100', '#fff4d6'),
    spectre: v('--spectre-300', '#6fd9ec'),
    pluck: v('--pluck-300', '#ffd75e'),
    text: v('--text-hi', '#f4efe4'),
    ink: v('--ink-500', '#2a2442'),
    power: v('--type-power', '#b071d6'),
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
function easeOutBack(x) { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }

export default CombatFX;
