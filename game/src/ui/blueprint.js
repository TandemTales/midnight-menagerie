/**
 * The wing's floorplan, drawn as a BLUEPRINT.  OWNER: map.
 *
 * `state/floorplan.js` builds the building and the route as one thing; this
 * draws the building.  It is a cyanotype — chalk-white linework on Prussian
 * blue, the way a working drawing comes off the copier — because the one job
 * of this layer is to be READ: which rooms touch, where the doors are, which
 * way the hallways run.  The classic sheet re-inked a traced drawing at 40%
 * against tea-dark paper and was, in the designer's word, "not readable".
 *
 * What is drawn, in order:
 *   grid       the drafting grid, faint
 *   floors     each room and hallway a hair lighter than the ground
 *   furniture  what the room is for, kept to the walls (the room's middle is
 *              where its mark stands)
 *   walls      exterior heavy, partitions light, every door a real gap
 *   openings   door leaves and their swings, the front doors' steps, windows
 *   secrets    the device at each end of a secret way (the Kids' crayon line
 *              between them is a route leg, drawn by the scene)
 *   lettering  room names where they fit, the column dimensions, the notes
 *              the Kids scrawled on it
 *
 * Every function here draws into a context already in SHEET px.
 */
import { RNG, hashSeed } from '../core/rng.js';
import { SECRET_DEVICES } from '../state/floorplan.js';

/** The copier's colours. */
export const BP = Object.freeze({
  get ground() { return blueprintToken('--bp-ground', '#304f58'); },          // faded cyanotype pigment
  deep: '#0f2f5c',            // where it is darkest (edges, folds)
  get line() { return blueprintToken('--bp-paper-ink', '#e5d9b4'); },            // ivory lines on worn rag paper
  faint: 'rgba(225, 238, 255, 0.10)',
  crayon: { red: '#ff6a52', yellow: '#ffd24a', green: '#8fe388', white: '#fff6e0', orange: '#ffa23a' },
});

function blueprintToken(name, fallback) {
  return typeof document === 'undefined' ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const DOOR_W = { door: 28, front: 32, boss: 40, hall: 34 };

/**
 * Turn the painted old paper into an aged cyanotype, in place.  The paper's
 * own clouding, folds and burnt edges survive as tone, because colour is laid
 * over them rather than replacing them.
 */
export function tintBlueprint(g, w, h) {
  g.save();
  g.globalCompositeOperation = 'color';
  g.fillStyle = BP.ground;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = '#829794';
  g.fillRect(0, 0, w, h);
  // a lift through the middle, where the light is and the route is read
  g.globalCompositeOperation = 'screen';
  const lift = g.createRadialGradient(w * 0.5, h * 0.45, 40, w * 0.5, h * 0.45, w * 0.62);
  lift.addColorStop(0, 'rgba(123, 151, 141, 0.3)');
  lift.addColorStop(0.6, 'rgba(112, 131, 119, 0.16)');
  lift.addColorStop(1, 'rgba(90, 110, 100, 0)');
  g.fillStyle = lift;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  // Cyanotype pigment wears away at folds to expose yellowed rag paper.
  const wear = new RNG(hashSeed('recovered-survey-1891'));
  for (let i = 1; i < 6; i++) {
    const x = w * i / 6;
    const crease = g.createLinearGradient(x - 13, 0, x + 13, 0);
    crease.addColorStop(0, 'rgba(221,201,157,0)');
    crease.addColorStop(.42, 'rgba(221,201,157,.08)');
    crease.addColorStop(.5, 'rgba(231,214,173,.34)');
    crease.addColorStop(.56, 'rgba(22,37,38,.25)');
    crease.addColorStop(1, 'rgba(221,201,157,0)');
    g.fillStyle = crease; g.fillRect(x - 13, 0, 26, h);
    for (let j = 0; j < 160; j++) {
      g.fillStyle = 'rgba(228,211,168,.25)';
      g.fillRect(x + (wear.next()-.5)*5, wear.next()*h, .7+wear.next()*2, 1+wear.next()*11);
    }
  }
  for (let i = 0; i < 6500; i++) {
    g.fillStyle = i % 3 ? 'rgba(233,214,168,.09)' : 'rgba(16,34,37,.12)';
    g.fillRect(wear.next()*w, wear.next()*h, .5+wear.next()*2, .5+wear.next()*2);
  }
  // Uneven sun bleaching and tide marks, left on a damp windowsill.
  for (const [x,y,r] of [[.08,.2,260],[.84,.8,220],[.55,.04,300]]) {
    const stain = g.createRadialGradient(w*x,h*y,0,w*x,h*y,r);
    stain.addColorStop(0, 'rgba(193,168,116,.16)');
    stain.addColorStop(.8, 'rgba(171,148,102,.07)');
    stain.addColorStop(1, 'rgba(171,148,102,0)');
    g.fillStyle = stain; g.fillRect(w*x-r,h*y-r,r*2,r*2);
  }
  g.restore();
}

/** The drafting grid, inside a rectangle. */
export function drawGrid(g, x, y, w, h) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.strokeStyle = BP.line;
  for (const [step, a, lw] of [[25, 0.05, 1], [125, 0.1, 1.3]]) {
    g.globalAlpha = a; g.lineWidth = lw;
    g.beginPath();
    for (let gx = x + step; gx < x + w; gx += step) { g.moveTo(gx, y); g.lineTo(gx, y + h); }
    for (let gy = y + step; gy < y + h; gy += step) { g.moveTo(x, gy); g.lineTo(x + w, gy); }
    g.stroke();
  }
  g.restore();
}

/**
 * Every wall on the plan as RUNS: maximal stretches of one wall line, each with
 * how many spaces it bounds — one is an outside wall, two is a partition.
 * Openings (doors, hallway mouths, windows) are cut out afterwards.
 */
function wallRuns(spaces) {
  const V = new Map(), H = new Map();
  const add = (M, k, a, b) => { let l = M.get(k); if (!l) M.set(k, l = []); l.push([a, b]); };
  for (const r of spaces) {
    add(V, r.x0, r.y0, r.y1); add(V, r.x1, r.y0, r.y1);
    add(H, r.y0, r.x0, r.x1); add(H, r.y1, r.x0, r.x1);
  }
  const runs = [];
  for (const [M, vert] of [[V, true], [H, false]]) {
    for (const [at, list] of M) {
      const ev = [];
      for (const [a, b] of list) ev.push([a, 1], [b, -1]);
      ev.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      let c = 0, last = null;
      for (const [v, d] of ev) {
        if (last !== null && v > last && c > 0) {
          const prev = runs[runs.length - 1];
          // merge with the run before when it continues it at the same weight
          if (prev && prev.vert === vert && prev.at === at && prev.b === last && (prev.n > 1) === (c > 1)) prev.b = v;
          else runs.push({ vert, at, a: last, b: v, n: c });
        }
        c += d; last = v;
      }
    }
  }
  return runs;
}

/** Cut openings out of runs.  `cuts` are { vert, at, a, b }. */
function cutRuns(runs, cuts) {
  let out = runs;
  for (const c of cuts) {
    const next = [];
    for (const r of out) {
      if (r.vert !== c.vert || Math.abs(r.at - c.at) > 0.5 || c.b <= r.a || c.a >= r.b) { next.push(r); continue; }
      if (c.a > r.a) next.push({ ...r, b: c.a, capB: true });
      if (c.b < r.b) next.push({ ...r, a: c.b, capA: true });
    }
    out = next;
  }
  return out;
}

/**
 * Draw the whole floorplan.
 * @param {CanvasRenderingContext2D} g   in sheet px
 * @param {object} plan                  map.plan from state/floorplan.js
 * @param {{ seed:string|number, regionId:string, nodes:object[], boss:string }} ctx
 */
export function drawFloorplan(g, plan, ctx) {
  const rng = new RNG(hashSeed(`bp|${ctx.regionId}|${ctx.seed}`));
  const style = plan.style || 'interior';
  const rooms = plan.rooms, halls = plan.halls || [];
  const spaces = [...rooms, ...halls, ...(plan.annexes || [])];
  const W = { ext: 9, int: 4.2 };
  if (style === 'stone') { W.ext = 13; W.int = 6.5; }
  if (style === 'glass') { W.ext = 5; W.int = 2.6; }
  const box = plan.box;

  // ── grid, and floors ────────────────────────────────────────────────────
  drawGrid(g, box.x0 - 70, box.y0 - 60, box.x1 - box.x0 + 110, box.y1 - box.y0 + 110);
  g.save();
  g.fillStyle = style === 'garden' ? 'rgba(160, 220, 170, 0.06)' : 'rgba(230, 242, 255, 0.07)';
  for (const r of spaces) g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  // the hallways a shade lighter again, with a runner down them: circulation
  // reads at a glance as circulation
  g.fillStyle = 'rgba(230, 242, 255, 0.07)';
  for (const h of halls) g.fillRect(h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0);
  g.strokeStyle = BP.line; g.globalAlpha = 0.45; g.lineWidth = 1.1;
  g.setLineDash([6, 5]);
  for (const h of halls) {
    g.beginPath();
    if(h.vertical) { g.moveTo(h.x,h.y0+10);g.lineTo(h.x,h.y1-10); }
    else { g.moveTo(h.x0+10,h.y);g.lineTo(h.x1-10,h.y); }
    g.stroke();
  }
  g.setLineDash([]);
  g.restore();

  drawCourtyard(g, plan);
  // ── furniture ─────────────────────────────────────────────────────────────
  drawFurniture(g, plan, ctx, rng, style);

  // ── walls ────────────────────────────────────────────────────────────────
  let runs = wallRuns(spaces);
  const cuts = [];
  for (const d of plan.doors) {
    const w = d.w || DOOR_W[d.kind] || 28;
    cuts.push({ vert: d.vert !== false, at: d.vert === false ? d.y : d.x, a: (d.vert === false ? d.x : d.y) - w / 2, b: (d.vert === false ? d.x : d.y) + w / 2, door: d });
  }
  // windows on the outside walls, clear of every door and corner
  const windows = [];
  if (style !== 'garden') {
    for (const r of runs) {
      if (r.n !== 1) continue;
      const len = r.b - r.a;
      if (len < 70) continue;
      const count = Math.floor((len - 20) / 78);
      for (let i = 0; i < count; i++) {
        const c = r.a + (len * (i + 0.5)) / count;
        const a = c - 13, b = c + 13;
        const clash = cuts.some((k) => k.vert === r.vert && Math.abs(k.at - r.at) < 0.5 && k.a < b + 16 && k.b > a - 16);
        if (clash || a < r.a + 14 || b > r.b - 14) continue;
        windows.push({ vert: r.vert, at: r.at, a, b });
      }
    }
  }
  runs = cutRuns(runs, [...cuts, ...windows]);

  g.save();
  g.strokeStyle = BP.line; g.fillStyle = BP.line;
  g.lineCap = 'butt';
  if (style === 'garden') {
    drawHedges(g, runs, W);
  } else {
    // ink bleed: the same walls, wider and faint, under the line
    g.globalAlpha = 0.16;
    for (const r of runs) strokeRun(g, r, (r.n > 1 ? W.int : W.ext) + 4);
    g.globalAlpha = 0.95;
    for (const r of runs) strokeRun(g, r, r.n > 1 ? W.int : W.ext);
    // square the corners where two walls meet (butt caps leave a notch)
    for (const r of runs) {
      const lw = r.n > 1 ? W.int : W.ext;
      for (const [end, cap] of [[r.a, r.capA], [r.b, r.capB]]) {
        if (cap) continue;
        const x = r.vert ? r.at : end, y = r.vert ? end : r.at;
        g.fillRect(x - lw / 2, y - lw / 2, lw, lw);
      }
    }
    if (style === 'glass') {
      // glazing bars: a tick across every outside wall
      g.globalAlpha = 0.7; g.lineWidth = 1.2;
      g.beginPath();
      for (const r of runs) {
        if (r.n !== 1) continue;
        for (let v = r.a + 12; v < r.b - 6; v += 16) {
          if (r.vert) { g.moveTo(r.at - 7, v); g.lineTo(r.at + 7, v); } else { g.moveTo(v, r.at - 7); g.lineTo(v, r.at + 7); }
        }
      }
      g.stroke();
    }
  }
  g.restore();

  // ── openings ─────────────────────────────────────────────────────────────
  g.save();
  g.strokeStyle = BP.line; g.fillStyle = BP.line;
  for (const w of windows) drawWindow(g, w, W.ext);
  for (const c of cuts) drawOpening(g, c.door, rng, style, c.door.kind === 'front' || c.door.kind === 'boss' ? W.ext : W.int);
  g.restore();

  // ── secret devices ───────────────────────────────────────────────────────
  for (const s of plan.secrets || []) {
    drawDevice(g, s.device, s.a, rng);
    drawDevice(g, s.device, s.b, rng);
    if(s.id)for(const p of [s.a,s.b]){
      g.save();g.font='bold 12px monospace';g.textAlign='center';g.fillStyle=blueprintToken('--bp-pencil-yellow',BP.line);
      g.fillText(s.id,p[0],p[1]+27);g.restore();
    }
  }

  for(const b of plan.blockers || []) drawObstruction(g,b);

  // ── lettering ────────────────────────────────────────────────────────────
  drawRoomNames(g, plan);
  drawDimensions(g, plan);
}

/** Tonight's damage is drawn over the permanent survey, across the FULL
 * threshold. Symbols differ in silhouette as well as their handwritten note. */
function drawObstruction(g,b){
  g.save();g.translate(b.x,b.y);if(b.vert!==false)g.rotate(Math.PI/2);
  const red=blueprintToken('--bp-pencil-red',BP.line);
  g.strokeStyle=red;g.fillStyle=BP.ground;g.lineWidth=3;g.fillRect(-47,-21,94,42);
  const rng=new RNG(hashSeed(b.id));
  if(['rubble','glass','books','furniture'].includes(b.kind)){
    for(let i=0;i<9;i++){
      const x=-44+i*10,y=(i%2?1:-1)*9;
      g.save();g.translate(x,y);g.rotate((rng.next()-.5)*1.2);
      g.strokeRect(-7,-7,b.kind==='furniture'?25:14,14);g.restore();
    }
  }else if(b.kind==='flood'){
    for(let y=-14;y<=14;y+=14){g.beginPath();g.moveTo(-47,y);for(let x=-47;x<47;x+=16)g.quadraticCurveTo(x+8,y-12,x+16,y);g.stroke();}
  }else if(b.kind==='roots'){
    for(let i=0;i<5;i++){g.beginPath();g.moveTo(-48,-20+i*10);g.bezierCurveTo(-12,25,18,-25,48,20-i*10);g.stroke();}
  }else if(b.kind==='collapse'){
    g.beginPath();g.moveTo(-48,-20);for(let x=-40;x<=48;x+=11)g.lineTo(x,x%2?-9:-19);g.stroke();
    g.beginPath();g.moveTo(-48,20);for(let x=-40;x<=48;x+=11)g.lineTo(x,x%2?9:19);g.stroke();
    g.setLineDash([3,5]);g.strokeRect(-47,-20,94,40);g.setLineDash([]);
  }else{
    g.strokeRect(-47,-18,94,36);for(let x=-40;x<47;x+=12){g.beginPath();g.moveTo(x,-18);g.lineTo(x,18);g.stroke();}
    if(b.kind==='gears'){g.beginPath();g.arc(0,0,16,0,Math.PI*2);g.stroke();}
  }
  g.restore();
  crayonText(g,b.note,b.x+16,b.y+55,{color:red,size:19,rot:-.04,seed:b.id,align:'center'});
}

function drawCourtyard(g, plan) {
  g.save();g.strokeStyle=BP.line;g.fillStyle=BP.line;g.globalAlpha=.45;g.lineWidth=1.4;
  for(const r of plan.courts || []) {
    const x=(r.x0+r.x1)/2,y=(r.y0+r.y1)/2;
    g.setLineDash([5,7]);g.strokeRect(r.x0,r.y0,r.x1-r.x0,r.y1-r.y0);g.setLineDash([]);
    if(r.kind==='pool'){
      for(const inset of [28,40,52])g.strokeRect(r.x0+inset,r.y0+inset,r.x1-r.x0-inset*2,r.y1-r.y0-inset*2);
      for(let yy=r.y0+85;yy<r.y1-65;yy+=65){g.beginPath();g.moveTo(r.x0+75,yy);for(let xx=r.x0+75;xx<r.x1-100;xx+=50)g.quadraticCurveTo(xx+25,yy-12,xx+50,yy);g.stroke();}
      for(let i=0;i<5;i++)g.strokeRect(x-75,r.y0+52+i*12,150,12);
      g.font='22px Cinzel, Georgia, serif';g.textAlign='center';g.fillText(r.name,x,y);continue;
    }
    // Formal beds in a garden; roof terraces and lower light courts have
    // paved setbacks instead. The architecture fits the level of the wing.
    for(const side of [-1,1]) {
      const bx=side<0?r.x0+35:x+120,bw=(r.x1-r.x0)/2-155;
      g.strokeRect(bx,r.y0+35,bw,r.y1-r.y0-70);
      for(let xx=bx+26;xx<bx+bw-10;xx+=90) {
        if(r.kind !== 'garden') {g.beginPath();g.moveTo(xx,r.y0+35);g.lineTo(xx,r.y1-35);g.stroke();continue;}
        g.beginPath();g.arc(xx,r.y0+61,12,0,Math.PI*2);g.stroke();
        g.beginPath();g.arc(xx,r.y1-61,12,0,Math.PI*2);g.stroke();
      }
    }
    for(const radius of [24,34,58]) { g.beginPath();g.arc(x,y,radius,0,Math.PI*2);g.stroke(); }
    g.globalAlpha=.8;g.font='18px Cinzel, Georgia, serif';g.textAlign='center';
    g.fillText(r.name,x,y-85);g.font='italic 14px Georgia';g.fillText(({terrace:'open air · roof level',lightwell:'retaining walls · open above',atrium:'glazed roof above'})[r.kind] || 'open to the sky',x,y+88);g.globalAlpha=.45;
  }
  g.restore();
}

function strokeRun(g, r, lw) {
  g.lineWidth = lw;
  g.beginPath();
  if (r.vert) { g.moveTo(r.at, r.a); g.lineTo(r.at, r.b); } else { g.moveTo(r.a, r.at); g.lineTo(r.b, r.at); }
  g.stroke();
}

/** Exterior grounds: hedges, a row of clipped bushes, not a wall. */
function drawHedges(g, runs, W) {
  for (const r of runs) {
    const big = r.n === 1;
    const rad = big ? 6.2 : 3.6;
    const step = rad * 1.45;
    g.globalAlpha = big ? 0.9 : 0.75;
    g.lineWidth = big ? 1.8 : 1.3;
    for (let v = r.a + rad; v <= r.b - rad + 0.1; v += step) {
      const x = r.vert ? r.at : v, y = r.vert ? v : r.at;
      g.beginPath(); g.arc(x, y, rad, 0, 6.2832); g.stroke();
    }
    g.globalAlpha = 0.18;
    strokeRun(g, r, big ? W.ext + 4 : W.int + 3);
  }
  g.globalAlpha = 1;
}

function drawWindow(g, w, lw) {
  g.save();
  g.globalAlpha = 0.9; g.lineWidth = 1.3;
  const o = lw / 2;
  g.beginPath();
  for (const off of [-o, 0, o]) {
    if (w.vert) { g.moveTo(w.at + off, w.a); g.lineTo(w.at + off, w.b); } else { g.moveTo(w.a, w.at + off); g.lineTo(w.b, w.at + off); }
  }
  // the jambs
  if (w.vert) { g.moveTo(w.at - o, w.a); g.lineTo(w.at + o, w.a); g.moveTo(w.at - o, w.b); g.lineTo(w.at + o, w.b); }
  else { g.moveTo(w.a, w.at - o); g.lineTo(w.a, w.at + o); g.moveTo(w.b, w.at - o); g.lineTo(w.b, w.at + o); }
  g.stroke();
  g.restore();
}

/**
 * A door in a vertical wall: jambs, a leaf standing open into the room it
 * leads to (east — the way the route runs), and its swing.  The front doors
 * are a pair with the steps outside; the boss's are a grand pair; a hallway's
 * mouth is an open arch, jambs only.
 */
function drawOpening(g, d, rng, style, lw) {
  if(d.vert === false || d.opens === 'west') {
    g.save();g.translate(d.x,d.y);
    g.rotate(d.vert === false ? (d.opens === 'north' ? -Math.PI/2 : Math.PI/2) : Math.PI);
    drawOpening(g,{...d,x:0,y:0,vert:true,opens:'east'},rng,style,lw);
    g.restore();return;
  }
  const w = d.w || DOOR_W[d.kind] || 28;
  const x = d.x, y0 = d.y - w / 2, y1 = d.y + w / 2;
  g.save();
  g.lineCap = 'round';
  // jambs
  g.globalAlpha = 0.95; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x - lw / 2 - 1, y0); g.lineTo(x + lw / 2 + 1, y0);
  g.moveTo(x - lw / 2 - 1, y1); g.lineTo(x + lw / 2 + 1, y1);
  g.stroke();
  if (d.kind === 'hall' || d.latch) { g.restore(); return; }
  if (style === 'garden') {
    // a gate: two posts and a light swing
    g.fillRect(x - 3.5, y0 - 3.5, 7, 7); g.fillRect(x - 3.5, y1 - 3.5, 7, 7);
    g.globalAlpha = 0.6; g.lineWidth = 1.2; g.setLineDash([3, 3]);
    g.beginPath(); g.arc(x, y0, w, 0, Math.PI / 2); g.stroke();
    g.setLineDash([]);
    g.restore(); return;
  }
  const leaf = (hx, hy, len, down) => {
    // leaf drawn open at 90 degrees into the east room, and its swing
    g.globalAlpha = 0.95; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + len, hy); g.stroke();
    g.globalAlpha = 0.55; g.lineWidth = 1.1;
    g.beginPath();
    if (down) g.arc(hx, hy, len, 0, Math.PI / 2);
    else g.arc(hx, hy, len, -Math.PI / 2, 0);
    g.stroke();
  };
  if (d.kind === 'front' || d.kind === 'boss' || d.kind === 'double') {
    leaf(x, y0, w / 2, true);
    leaf(x, y1, w / 2, false);
    if (d.kind === 'front') {
      // the steps up to the door, outside
      g.globalAlpha = 0.8; g.lineWidth = 1.3;
      g.beginPath();
      for (let i = 1; i <= 3; i++) {
        const sx = x - lw / 2 - i * 5.5;
        g.moveTo(sx, y0 - 4 - i * 2); g.lineTo(sx, y1 + 4 + i * 2);
      }
      g.stroke();
    }
  } else {
    if (rng.chance(0.5)) leaf(x, y0, w, true); else leaf(x, y1, w, false);
  }
  g.restore();
}

/** A secret way's device, at the wall it hides in. */
function drawDevice(g, device, [x, y], rng) {
  g.save();
  g.strokeStyle = BP.line; g.fillStyle = BP.line;
  g.lineWidth = 1.6; g.globalAlpha = 0.95;
  switch (device) {
    case 'painting': case 'dollhouse': case 'coldstore': case 'curtain': {
      g.strokeRect(x-17,y-11,34,22);g.strokeRect(x-12,y-7,24,14);
      g.beginPath();g.moveTo(x-12,y+7);g.lineTo(x,y-6);g.lineTo(x+12,y+7);g.stroke();break;
    }
    case 'statue': case 'globe': case 'clock': {
      g.strokeRect(x-13,y+7,26,5);g.beginPath();g.arc(x,y-4,10,0,Math.PI*2);
      g.moveTo(x,y-13);g.lineTo(x,y+6);g.moveTo(x-8,y-4);g.lineTo(x+8,y-4);g.stroke();break;
    }
    case 'underbed': case 'piano': case 'toybox': case 'kennel': {
      g.strokeRect(x-18,y-8,36,16);g.beginPath();g.moveTo(x-18,y+8);g.lineTo(x-18,y+14);
      g.moveTo(x+18,y+8);g.lineTo(x+18,y+14);g.moveTo(x-8,y+8);g.lineTo(x,y);g.lineTo(x+8,y+8);g.stroke();break;
    }
    case 'ladder': case 'roofwalk': case 'trellis': case 'bellpull': {
      g.beginPath();g.moveTo(x-9,y-15);g.lineTo(x-9,y+15);g.moveTo(x+9,y-15);g.lineTo(x+9,y+15);
      for(let yy=-12;yy<=12;yy+=6){g.moveTo(x-9,y+yy);g.lineTo(x+9,y+yy);}g.stroke();break;
    }
    case 'fireplace': {
      // a chimney breast on the wall, the hearth in front of it
      g.fillRect(x - 15, y - 6, 30, 12);
      g.strokeRect(x - 20, y - 11, 40, 22);
      g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x + 9, y); g.stroke();
      break;
    }
    case 'bookcase': case 'wardrobe': case 'mirror': case 'panel': {
      const len = device === 'panel' ? 26 : 38;
      g.strokeRect(x - len / 2, y - 6, len, 12);
      g.beginPath();
      if (device === 'bookcase') for (let i = -len / 2 + 4; i < len / 2; i += 4) { g.moveTo(x + i, y - 6); g.lineTo(x + i, y + 6); }
      else if (device === 'mirror') { g.ellipse(x, y, len / 2 - 4, 3, 0, 0, 6.2832); }
      else { g.moveTo(x, y - 6); g.lineTo(x, y + 6); }
      g.stroke();
      break;
    }
    case 'stair': {
      // a spiral stair: a ring, its newel, and the treads round it
      g.beginPath(); g.arc(x, y, 14, 0, 6.2832); g.stroke();
      g.beginPath(); g.arc(x, y, 3, 0, 6.2832); g.fill();
      g.beginPath();
      for (let i = 0; i < 8; i++) { const t = i / 8 * 6.2832; g.moveTo(x + Math.cos(t) * 3, y + Math.sin(t) * 3); g.lineTo(x + Math.cos(t) * 14, y + Math.sin(t) * 14); }
      g.stroke();
      break;
    }
    case 'tunnel': case 'gap': {
      g.setLineDash([3, 3]);
      g.beginPath(); g.arc(x, y, 12, 0, 6.2832); g.stroke();
      g.setLineDash([]);
      g.beginPath(); g.arc(x, y, 5, 0, 6.2832); g.fill();
      break;
    }
    default: {
      // trapdoor, grate, drain, vent, dumbwaiter: a hatch in the floor
      g.strokeRect(x - 12, y - 12, 24, 24);
      g.beginPath();
      if (device === 'trapdoor' || device === 'dumbwaiter') { g.moveTo(x - 12, y - 12); g.lineTo(x + 12, y + 12); g.moveTo(x + 12, y - 12); g.lineTo(x - 12, y + 12); }
      else for (let i = -8; i <= 8; i += 4) { g.moveTo(x + i, y - 12); g.lineTo(x + i, y + 12); }
      g.stroke();
    }
  }
  void rng;
  g.restore();
}

/**
 * What a room is for, kept to its walls.  The middle of every room is where
 * its mark stands, so nothing is drawn there; the furniture is a band along the
 * top and bottom walls, the side walls being where the doors are.
 */
function drawFurniture(g, plan, ctx, rng, style) {
  const region = ctx.regionId;
  g.save();
  g.strokeStyle = BP.line; g.fillStyle = BP.line;
  g.lineWidth = 1.2; g.globalAlpha = 0.5;
  for (const r of [...plan.rooms, ...(plan.annexes || [])]) {
    const w = r.x1 - r.x0, h = r.y1 - r.y0;
    if (r.type === 'boss') { drawBossHall(g, r, rng); continue; }
    if(r.stair) {
      g.save();g.globalAlpha=.75;
      const x=r.x0+32,y=r.y0+64,w=r.x1-r.x0-64,h=r.y1-r.y0-96;
      g.strokeRect(x,y,w,h);g.strokeRect(x+70,y+55,w-140,h-95);
      g.beginPath();
      for(let yy=y+68;yy<y+h;yy+=16) {
        g.moveTo(x,yy);g.lineTo(x+70,yy);g.moveTo(x+w-70,yy);g.lineTo(x+w,yy);
      }
      g.stroke();g.font='14px Georgia';g.textAlign='center';g.fillText('UP',x+35,y+36);g.fillText('DN',x+w-35,y+36);
      g.restore();continue;
    }
    const name = String(r.name || '').toLowerCase();
    const along = rng.chance(0.5);                 // which wall gets it
    const wy = along ? r.y0 + 40 : r.y1 - 20;  // a 10px band at that wall
    if (r.tag === 'cn' || /stair|landing|shaft|ladder/.test(name)) {
      // a straight flight against the wall, treads and its arrow
      const sx = r.x0 + 18, sw = Math.min(w - 36, 110);
      const sy = r.y0 + 38, sh = Math.min(38, h * .15);
      g.strokeRect(sx, sy, sw, sh);
      g.beginPath();
      for (let x = sx + 10; x < sx + sw; x += 10) { g.moveTo(x, sy); g.lineTo(x, sy + sh); }
      g.moveTo(sx + 8, sy + sh / 2); g.lineTo(sx + sw - 8, sy + sh / 2);
      g.lineTo(sx + sw - 17, sy + sh / 2 - 5);
      g.stroke();
      continue;
    }
    if (style === 'garden') {
      // planting: a row of shrubs or stones along the bed's edge
      const n = Math.max(2, Math.floor((w - 20) / 22));
      for (let i = 0; i < n; i++) {
        const cx = r.x0 + 14 + i * ((w - 28) / Math.max(1, n - 1));
        g.beginPath();
        if (region === 'graveyard') g.rect(cx - 5, wy - 1, 10, 13);
        else g.arc(cx, wy + 5, 5.5, 0, 6.2832);
        g.stroke();
      }
      continue;
    }
    if (region === 'study-library' || /librar|archive|stacks|reading|index|scribe/.test(name)) {
      for (const yy of [r.y0 + 5, r.y1 - 13]) {
        g.strokeRect(r.x0 + 8, yy, w - 16, 8);
        g.beginPath();
        for (let x = r.x0 + 12; x < r.x1 - 8; x += 4) { g.moveTo(x, yy); g.lineTo(x, yy + 8); }
        g.stroke();
      }
      continue;
    }
    if (/dining|breakfast|supper|parlor|drawing|reception/.test(name) && h > 190) {
      const tw = Math.min(96, w - 60), tx = r.x0 + 28, ty = r.y0 + 45;
      g.strokeRect(tx, ty, tw, 26);
      for (let x = tx + 12; x < tx + tw; x += 26) {
        g.strokeRect(x, ty - 8, 12, 6); g.strokeRect(x, ty + 28, 12, 6);
      }
      continue;
    }
    if (/bed|nursery|dormitor|sleep|suite|cell|kennel|crib|cradle/.test(name) || region === 'sleeping-quarters') {
      const bx = r.x0 + 10 + rng.int(Math.max(1, w - 50));
      g.strokeRect(bx, wy - 4, 30, 16);
      g.beginPath(); g.moveTo(bx + 8, wy - 4); g.lineTo(bx + 8, wy + 12); g.stroke();
      continue;
    }
    if (/kitchen|pantry|larder|scullery|bake|pastry|flour|sugar|dish|bottle|cellar|store|shop|repair|room$/.test(name) && rng.chance(0.55)) {
      // a counter run along the wall
      g.strokeRect(r.x0 + 6, wy - 2, w - 12, 12);
      g.beginPath();
      for (let x = r.x0 + 6 + 22; x < r.x1 - 10; x += 22) { g.moveTo(x, wy - 2); g.lineTo(x, wy + 10); }
      g.stroke();
      continue;
    }
    if (style === 'interior' && rng.chance(0.4) && h > 112) {
      // a fireplace on the wall: breast and hearth
      const cx = r.x0 + w / 2 + (rng.next() - 0.5) * (w - 60);
      const y = along ? r.y0 : r.y1;
      const s = along ? 1 : -1;
      g.globalAlpha = 0.7;
      g.strokeRect(cx - 13, Math.min(y, y + s * 9), 26, 9);
      g.strokeRect(cx - 17, Math.min(y + s * 9, y + s * 15), 34, 6);
      g.globalAlpha = 0.5;
      continue;
    }
    if (h > 120 && w > 100 && rng.chance(0.45)) {
      // a rug laid square in the room: double rule, kept round the mark
      g.globalAlpha = 0.28;
      g.strokeRect(r.x0 + 12, r.y0 + 12, w - 24, h - 24);
      g.strokeRect(r.x0 + 16, r.y0 + 16, w - 32, h - 32);
      g.globalAlpha = 0.5;
    }
  }
  g.restore();
}

function drawBossHall(g, r, rng) {
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  g.save();
  g.globalAlpha = 0.55; g.lineWidth = 1.3;
  // two ranks of columns down the hall
  for (const cx of [r.x0 + 24, r.x1 - 24]) {
    for (let y = r.y0 + 34; y < r.y1 - 24; y += 62) {
      g.strokeRect(cx - 6, y - 6, 12, 12);
      g.beginPath(); g.arc(cx, y, 3, 0, 6.2832); g.fill();
    }
  }
  // the dais at the far wall, three steps up
  g.globalAlpha = 0.5;
  for (let i = 0; i < 3; i++) g.strokeRect(r.x1 - 18 - i * 7, r.y0 + h * 0.3 - i * 7, 18 + i * 7, h * 0.4 + i * 14);
  void w; void rng;
  g.restore();
}

/** Room names lettered in the plan's own hand, where a name fits. */
function drawRoomNames(g, plan) {
  g.save();
  g.fillStyle = BP.line; g.globalAlpha = 0.72;
  g.textBaseline = 'top'; g.textAlign = 'left';
  for (const r of [...plan.rooms, ...(plan.annexes || [])]) {
    if (r.type === 'boss' || !r.name) continue;
    const w = r.x1 - r.x0 - 28, h = r.y1 - r.y0;
    if (h < 150 && !r.architectural) continue;
    const txt = String(r.name).toUpperCase();
    const size = parseFloat(blueprintToken('--bp-room-type', '24px'));
    g.font = `600 ${size}px Cinzel, Georgia, serif`;
    const lines = []; let line = '';
    for (const word of txt.split(/\s+/)) {
      const next = line ? line + ' ' + word : word;
      if (line && g.measureText(next).width > w) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    lines.slice(0, 2).forEach((text, i) => g.fillText(text, r.x0 + 14, r.y0 + 12 + i * size * 1.1, w));
  }
  g.font = `italic ${blueprintToken('--bp-detail-type', '18px')} Georgia, serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const h of plan.halls || []) {
    g.save();
    if(h.vertical) {
      g.translate((h.x0+h.x1)/2-23,(h.y0+h.y1)/2);g.rotate(-Math.PI/2);
      g.fillText(h.name || 'PASSAGE',0,0,h.y1-h.y0-30);
    } else {
      const label=h.name || 'SERVICE PASSAGE';
      // Repeat along a long gallery so its name is visible while scrolling.
      const sections=Math.max(1,Math.floor((h.x1-h.x0)/900));
      for(let i=0;i<sections;i++) g.fillText(label,h.x0+(h.x1-h.x0)*(i+.5)/sections,h.labelY || h.y-28,(h.x1-h.x0)/sections-30);
    }
    g.restore();
  }
  g.restore();
}

/** A dimension chain over the building: the surveyor's column widths. */
function drawDimensions(g, plan) {
  const X = plan.cols;
  if (!X || X.length < 2) return;
  const y = plan.box.y0 - 26;
  if (y < 72) return;
  g.save();
  g.strokeStyle = BP.line; g.fillStyle = BP.line;
  g.globalAlpha = 0.55; g.lineWidth = 1;
  g.beginPath(); g.moveTo(X[0], y); g.lineTo(X[X.length - 1], y);
  for (const x of X) { g.moveTo(x, y - 6); g.lineTo(x, y + 6); g.moveTo(x - 4, y + 4); g.lineTo(x + 4, y - 4); }
  g.stroke();
  g.font = '600 12px Grenze, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
  for (let i = 0; i + 1 < X.length; i++) {
    const ft = Math.round((X[i + 1] - X[i]) / (plan.v >= 2 ? 16.8 : 8.4));
    g.fillText(`${ft}'-${(i * 7) % 12}"`, (X[i] + X[i + 1]) / 2, y - 3);
  }
  g.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// The Kids' crayon.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crayon lettering: each letter set down on its own, a little off the line and
 * a little turned, then gone over a second time — a child's hand, in the fonts
 * the game ships with.
 */
export function crayonText(g, text, x, y, { color = BP.crayon.yellow, size = 24, rot = 0, seed = 1, align = 'left' } = {}) {
  const w = new RNG(hashSeed('crayon|' + seed + '|' + text));
  g.save();
  g.translate(x, y); g.rotate(rot);
  g.font = `700 ${size}px "Comic Sans MS", "Segoe Print", cursive`;
  g.textBaseline = 'middle';
  const total = g.measureText(text).width * 1.04;
  let cx = align === 'center' ? -total / 2 : align === 'right' ? -total : 0;
  const glyphs = [];
  for (const ch of text) {
    const cw = g.measureText(ch).width * 1.04;
    glyphs.push({ ch, x: cx + cw / 2, dy: (w.next() - 0.5) * size * 0.16, r: (w.next() - 0.5) * 0.22, s: 0.92 + w.next() * 0.16 });
    cx += cw;
  }
  g.textAlign = 'center';
  // a dark shadow so the wax stands off the blue
  for (const pass of [0, 1, 2]) {
    g.fillStyle = pass === 0 ? 'rgba(6, 18, 40, 0.55)' : color;
    g.globalAlpha = pass === 2 ? 0.45 : 1;
    for (const q of glyphs) {
      g.save();
      g.translate(q.x + (pass === 0 ? 1.5 : pass === 2 ? 0.9 : 0), q.dy + (pass === 0 ? 2 : pass === 2 ? -0.7 : 0));
      g.rotate(q.r); g.scale(q.s, q.s);
      g.fillText(q.ch, 0, 0);
      g.restore();
    }
  }
  g.restore();
  return { w: total, h: size };
}

/** A crayon line through points, gone over twice. */
export function crayonLine(g, pts, { color = BP.crayon.yellow, width = 3.2, seed = 1, arrow = false, dash = null } = {}) {
  const w = new RNG(hashSeed('cline|' + seed));
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (dash) g.setLineDash(dash);
  for (const pass of [0, 1, 2]) {
    g.strokeStyle = pass === 0 ? 'rgba(6, 18, 40, 0.5)' : color;
    g.globalAlpha = pass === 2 ? 0.5 : 1;
    g.lineWidth = pass === 2 ? width * 0.6 : width;
    g.beginPath();
    pts.forEach(([px, py], i) => {
      const jx = (w.next() - 0.5) * 2.2 + (pass === 0 ? 1.4 : 0), jy = (w.next() - 0.5) * 2.2 + (pass === 0 ? 1.8 : 0);
      if (i === 0) g.moveTo(px + jx, py + jy); else g.lineTo(px + jx, py + jy);
    });
    g.stroke();
  }
  g.setLineDash([]);
  if (arrow && pts.length >= 2) {
    const [ax, ay] = pts[pts.length - 2], [bx, by] = pts[pts.length - 1];
    const t = Math.atan2(by - ay, bx - ax), L = 12;
    g.strokeStyle = color; g.globalAlpha = 1; g.lineWidth = width;
    g.beginPath();
    g.moveTo(bx - Math.cos(t - 0.5) * L, by - Math.sin(t - 0.5) * L); g.lineTo(bx, by);
    g.lineTo(bx - Math.cos(t + 0.5) * L, by - Math.sin(t + 0.5) * L);
    g.stroke();
  }
  g.restore();
}

/** What the Kids say about a secret way, for the scene's notes pass. */
export function secretNote(device) {
  return SECRET_DEVICES[device]?.note || 'secret way!';
}
