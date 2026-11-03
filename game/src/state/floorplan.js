/**
 * A wing as a FLOORPLAN.  OWNER: map agent.
 *
 * The classic map (`generateClassicMap` in mapgen.js) is a Slay-the-Spire
 * lattice laid OVER a traced section drawing, and the two never agreed: the
 * route ran straight through walls, and the drawing underneath could not be
 * read because nothing on it meant anything to the player.  This generator
 * builds the building and the route as ONE thing.
 *
 * The partition graph retains the original local splits and reconnections.
 * mansion-layout.js expands that same geometry and inserts cross passages
 * between columns, preserving the long section silhouette and nearby choices.
 * Only the recipe's rare secret edges bypass the ordinary room/hall network.
 *
 * Deterministic: same (regionId, seed, opts) -> byte-identical map.
 */
import { layOutMansion } from './mansion-layout.js';
import { RNG, hashSeed } from '../core/rng.js';
import { NodeType } from '../data/schema.js';
import { regionMeta, sceneForNode, HAZARDS, assignRoomNames } from './mapgen.js';

/** Drafting grid; the returned plan.sheet carries the expanded display size. */
export const PLAN_SHEET = Object.freeze({ w: 2030, h: 1010 });
/** Where the building may stand: inside map.js's plan window (74, 60, 1882 x
 *  776), clear of the way-in arrows on the west, the compass in the north-east
 *  and the scale bar under the foot. */
const AREA = { x0: 176, x1: 1890, y0: 100, y1: 800 };
const AREA_H = AREA.y1 - AREA.y0;
const BOSS_W = 190;
/** A room has to be tall enough to stand a mark in. */
const MINH = 104;
/** Two walls that meet the same wall are either the SAME wall or at least this
 *  far apart.  Because a door needs DOOR + 2 * DOOR_EDGE of shared wall, this
 *  is what guarantees every pair of touching rooms has room for a door. */
const SEP = 44;
const DOOR = 28;
const DOOR_EDGE = 8;
/** A hallway's clear width. */
const HALL = 34;
const GAP_MAX = 2;


/** How each wing is BUILT, which is how its plan is drawn (ui/blueprint.js). */
export const WING_STYLE = Object.freeze({
  'graveyard': 'garden', 'hedge-maze': 'garden', 'pumpkin-grounds': 'garden',
  'greenhouse': 'glass',
  'crypt': 'stone', 'secret-passages': 'stone', 'heart': 'stone',
});

/**
 * Each wing's FORM, from the design doc's one-line description of it
 * (mapgen.js REGIONS `form`).  Four levers, because a stack-of-rooms plan
 * has four things that can differ:
 *   sym     the plan is mirrored about its long axis -- the Foyer is "a formal
 *           entrance block, symmetrical about a central axis"; a symmetric
 *           wing alternates four and five rooms a column, the one brick bond
 *           that can be mirrored
 *   widest  how many rooms deep the wing gets -- a compact suite or a shaft
 *           is never five rooms across
 *   curve   where the wing's middle wanders as it runs east: a crescent bows,
 *           an attic climbs to its tower, glass and grounds meander
 *   halls   how much of it is corridor
 */
export const WING_FORM = Object.freeze({
  'foyer':             { sym: true, widest: 5 },
  'ballroom':          { sym: true, widest: 5 },
  'heart':             { sym: true, widest: 5 },
  'crypt':             { sym: true, widest: 5 },
  'nursery':           { widest: 4 },
  'sleeping-quarters': { widest: 4, halls: 6 },
  'kitchens-cellars':  { widest: 5, curve: 'wave' },
  'greenhouse':        { widest: 5, curve: 'wave' },
  'graveyard':         { widest: 5, curve: 'arc' },
  'study-library':     { widest: 5, curve: 'drift' },
  'attic-observatory': { widest: 4, curve: 'rise' },
  'lampworks':         { widest: 4, halls: 5 },
  'hedge-maze':        { widest: 5, curve: 'wave' },
  'secret-passages':   { widest: 4, halls: 7 },
  'bathhouse':         { widest: 4, curve: 'arc' },
  'kennels':           { widest: 5, curve: 'drift' },
  'pumpkin-grounds':   { widest: 5, curve: 'wave' },
});

/**
 * The secret ways each wing hides, and what the Kids scrawled beside them.
 * The device is the house's; the note is the Kids'.
 */
export const SECRET_DEVICES = Object.freeze({
  painting:   { name: 'Hinged Portrait', note: 'lift the portrait!' },
  statue:     { name: 'Turning Statue', note: 'turn her left paw' },
  bellpull:   { name: 'Bell-pull Service Stair', note: 'silent bell = hidden stair' },
  dollhouse:  { name: 'Dollhouse Door', note: 'bigger on the inside??' },
  underbed:   { name: 'Under-bed Crawl', note: 'crawl UNDER the bed' },
  toybox:     { name: 'Bottomless Toy Chest', note: 'false bottom in toy box' },
  linen:      { name: 'Linen-chute Passage', note: 'slide down the laundry!' },
  coalchute:  { name: 'Coal-chute Slide', note: 'coal slide — feet first!' },
  coldstore:  { name: 'Cold-store False Wall', note: 'back wall is a DOOR' },
  cistern:    { name: 'Dry Cistern Tunnel', note: 'empty tank has a tunnel' },
  trellis:    { name: 'Trellis Climb', note: 'climb the trellis' },
  rootdoor:   { name: 'Hollow-root Passage', note: 'inside the old root' },
  sarcophagus:{ name: 'Sliding Tomb Slab', note: 'the lid slides sideways' },
  globe:     { name: 'Rotating Globe Stair', note: 'spin the globe backwards' },
  ladder:    { name: 'Counterweight Ladder', note: 'pull rope, ladder drops' },
  roofwalk:  { name: 'Roof-gutter Walk', note: 'out the skylight!' },
  clock:     { name: 'Clock-case Stair', note: 'behind the pendulum' },
  lift:      { name: 'Maintenance Lift', note: 'ride the lamp lift' },
  gear:      { name: 'Stopped-gear Crawl', note: 'this gear is safe to crawl' },
  piano:     { name: 'Piano Pedal Hatch', note: 'middle pedal opens floor' },
  curtain:   { name: 'Behind the Stage Drapery', note: 'behind the velvet curtain' },
  kennel:    { name: 'False Kennel Back', note: 'dog door goes WAY farther' },
  feedhatch: { name: 'Feed-hatch Service Run', note: 'through the feed hatch' },
  fireplace:  { name: 'Fireplace Passage', note: 'thru the FIREPLACE!' },
  bookcase:   { name: 'Hidden Bookcase',   note: 'pull the red book' },
  panel:      { name: 'Loose Panel',       note: 'loose panel!!' },
  stair:      { name: 'Secret Stair',      note: 'secret stairs' },
  trapdoor:   { name: 'Trapdoor',          note: 'trapdoor!!' },
  dumbwaiter: { name: 'Dumbwaiter',        note: 'dumbwaiter (fits 1 kid)' },
  mirror:     { name: 'Mirror Door',       note: 'walk thru the mirror' },
  wardrobe:   { name: 'Back of the Wardrobe', note: 'thru the wardrobe' },
  drain:      { name: 'Drain Gallery',     note: 'crawl the drain. ew' },
  gap:        { name: 'Gap in the Hedge',  note: 'gap in hedge' },
  tunnel:     { name: 'Burrow',            note: 'rabbit tunnel?' },
  grate:      { name: 'Under the Grate',   note: 'under the grate' },
  vent:       { name: 'Vent Crawl',        note: 'vent crawl' },
});
const DEVICES_BY_WING = {
  'foyer': ['fireplace', 'panel', 'stair'],
  'nursery': ['wardrobe', 'panel', 'fireplace'],
  'sleeping-quarters': ['wardrobe', 'panel', 'stair'],
  'kitchens-cellars': ['dumbwaiter', 'trapdoor', 'fireplace'],
  'greenhouse': ['vent', 'trapdoor'],
  'graveyard': ['tunnel', 'gap', 'grate'],
  'study-library': ['bookcase', 'fireplace', 'stair'],
  'attic-observatory': ['trapdoor', 'stair', 'panel'],
  'lampworks': ['vent', 'stair', 'trapdoor'],
  'ballroom': ['mirror', 'panel', 'fireplace'],
  'crypt': ['grate', 'stair', 'panel'],
  'hedge-maze': ['gap', 'tunnel'],
  'secret-passages': ['panel', 'stair', 'trapdoor', 'bookcase'],
  'bathhouse': ['drain', 'panel', 'vent'],
  'kennels': ['tunnel', 'trapdoor', 'panel'],
  'pumpkin-grounds': ['gap', 'tunnel', 'grate'],
  'heart': ['stair', 'panel', 'mirror'],
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isFight = (t) => t === NodeType.SCUFFLE || t === NodeType.BIG_SCARE || t === NodeType.BOSS;

/**
 * @param {string} regionId
 * @param {number|string} seed
 * @param {{hauntLevel?:number, companion?:string, rescued?:string[]}} [opts]
 */
export function generatePlanMap(regionId, seed = 1, opts = {}) {
  const { hauntLevel = 0, companion = null, rescued = [] } = opts;
  const meta = regionMeta(regionId);
  regionId = meta.slug;
  const rng = new RNG(hashSeed(`mm-plan-v1|${regionId}|${seed}|${hauntLevel}`));
  const style = WING_STYLE[regionId] || 'interior';

  const rows = meta.rows;                  // includes the boss row
  const lanes = meta.lanes;
  const lastWalk = rows - 2;
  const bossRow = rows - 1;
  const nCols = rows - 1;                  // walk columns

  // ── 1. The columns ─────────────────────────────────────────────────────────
  // Widths wander a little so the plan does not read as graph paper.
  const X = [AREA.x0];
  {
    const ws = Array.from({ length: nCols }, () => 0.86 + rng.next() * 0.28);
    const sum = ws.reduce((a, b) => a + b, 0);
    const avail = AREA.x1 - AREA.x0 - BOSS_W;
    for (let r = 0; r < nCols; r++) X.push(X[r] + Math.round(avail * ws[r] / sum));
    X[nCols] = AREA.x1 - BOSS_W;
  }

  // How many rooms each column holds: narrow at the front door, widest through
  // the middle of the wing, closing again to the three rooms at the boss's door
  // (see the door-row note in mapgen.js: four ways was a fake choice, three is
  // a real one, and one of them is always the rest).
  //
  // The count only ever CHANGES at the two ends.  Between two columns of m and
  // n rooms there can be at most m + n - 1 doors that do not cross, so every
  // step DOWN in the count forces dead-ends (m - n + 1 rooms with one way on,
  // at least) and a count that wobbles 5, 4, 5, 4 pays that toll at every
  // other wall — measured at 53% single-exit end rooms.  So the wing grows to
  // its width, holds it, and closes once, at the boss.
  const form = WING_FORM[regionId] || {};
  const sym = !!form.sym;
  const widest = Math.min(lanes, form.widest || 5);
  const kOf = Array.from({ length: nCols }, (_, r) => {
    if (r >= lastWalk - 1) return 3;
    if (r === lastWalk - 2) return 4;
    return Math.min(widest, 3 + r);
  });
  if (sym) {
    // a mirrored plan can only step its count by one each column (a centred
    // block of walls needs an even number of rooms behind it left over), so
    // it alternates, built back from the boss's three doors
    kOf[lastWalk] = 3; kOf[lastWalk - 1] = 4;
    for (let r = lastWalk - 2; r >= 1; r--) kOf[r] = kOf[r + 1] === 5 ? 4 : 5;
    kOf[0] = kOf[1] === 4 ? 3 : 4;
  }
  const kAt = (r) => kOf[r];

  // ── 2. Each column's footprint and its rooms ──────────────────────────────
  //
  // BRICK BOND.  Every wall between two rooms of a column is laid a clear SEP
  // INSIDE a room of the column behind, so that room opens onto two rooms
  // ahead: the most doors two stacks of rooms can share without one door
  // crossing another.  Walls carried straight through (the same height in both
  // columns) make a grid, and a grid is a row of corridors with one way out of
  // every room — measured at 77% single-exit rooms when walls were sampled
  // freely and nudged apart afterwards.
  //
  // The bond steps up one column and down the next, so the wing zig-zags about
  // the middle of the sheet instead of marching off it.
  const cols = [];                          // [{ top, bot, cuts:[y...] }]
  // the walls a new wall may meet: ON a wall of the column behind, a clear SEP
  // inside one of its rooms, or a clear SEP beyond its ends
  const validBelow = (t, W) => {             // the highest valid height <= t
    let best = -Infinity;
    for (const w of W) if (w <= t && w > best) best = w;
    for (let i = 0; i + 1 < W.length; i++) {
      const a = W[i] + SEP, b = W[i + 1] - SEP;
      if (a <= b && a <= t) best = Math.max(best, Math.min(t, b));
    }
    best = Math.max(best, Math.min(t, W[0] - SEP));
    return best;
  };
  const validAbove = (t, W) => {             // the lowest valid height >= t
    let best = Infinity;
    for (const w of W) if (w >= t && w < best) best = w;
    for (let i = 0; i + 1 < W.length; i++) {
      const a = W[i] + SEP, b = W[i + 1] - SEP;
      if (a <= b && b >= t) best = Math.min(best, Math.max(t, a));
    }
    best = Math.min(best, Math.max(t, W[W.length - 1] + SEP));
    return best;
  };
  const bond = (prev, k, d) => {
    const W = [prev.top, ...prev.cuts, prev.bot];
    const m = W.length - 1;
    if (k < 2) return null;
    if (k - 1 > m) return null;
    // which of the rooms behind take a wall: all of them when the wing is
    // widening, all but one end when it holds, the middle when it closes
    const spare = m - (k - 1);
    if (sym && spare % 2) return null;
    const s = sym ? spare / 2
      : spare === 0 ? 0 : spare === 1 ? (d < 0 ? 0 : 1) : Math.floor(spare / 2) + (d < 0 ? 0 : spare % 2);
    const M = (prev.top + prev.bot) / 2;            // the axis, when there is one
    const cuts = [];
    for (let i = 0; i < k - 1; i++) {
      const j = s + i;
      const a = W[j] + SEP, b = W[j + 1] - SEP;
      if (a > b) return null;
      let c;
      if (sym && 2 * i > k - 2) c = 2 * M - cuts[k - 2 - i];                  // mirrored
      else if (sym && 2 * i === k - 2) c = M;                                 // on the axis
      else c = Math.round((a + b) / 2 + (rng.next() - 0.5) * (b - a) * 0.7);
      if (!sym && cuts.length) c = Math.max(c, cuts[cuts.length - 1] + MINH);
      if (c < a || c > b) return null;
      if (cuts.length && c - cuts[cuts.length - 1] < MINH) return null;
      cuts.push(c);
    }
    const c0 = cuts[0], c1 = cuts[cuts.length - 1];
    const top = validBelow(Math.min(c0 - MINH, Math.min(W[1], c0) - SEP) - rng.int(24), W);
    const bot = sym ? 2 * M - top
      : validAbove(Math.max(c1 + MINH, Math.max(W[m - 1], c1) + SEP) + rng.int(24), W);
    if (sym && (bot - c1 < MINH || validAbove(bot, W) !== bot)) return null;
    if (!(top >= AREA.y0) || !(bot <= AREA.y1)) return null;
    return { top: Math.round(top), bot: Math.round(bot), cuts };
  };
  // where the wing's middle is heading, as it runs east
  const MID = (AREA.y0 + AREA.y1) / 2;
  const phase = rng.next() * 6.2832;
  let wander = 0;
  const aim = (r) => {
    const t = r / Math.max(1, nCols - 1);
    switch (form.curve) {
      case 'arc':   return MID - 120 * Math.sin(Math.PI * t);
      case 'rise':  return MID + 130 * (1 - 2 * t);
      case 'wave':  return MID + 110 * Math.sin(2 * Math.PI * t + phase);
      case 'drift': wander = clamp(wander + (rng.next() - 0.5) * 120, -130, 130); return MID + wander;
      default:      return MID;
    }
  };
  {
    let dir = rng.chance(0.5) ? 1 : -1;
    for (let r = 0; r < nCols; r++) {
      const k = kAt(r);
      const prev = cols[r - 1] || null;
      let made = null;
      if (!prev) {
        const hs = Array.from({ length: k }, () => MINH + 6 + rng.int(22));
        if (sym) {
          // mirrored, and an even height so the axis falls on a whole pixel
          for (let i = 0; i < k / 2; i++) hs[k - 1 - i] = hs[i];
          if (hs.reduce((a, b) => a + b, 0) % 2) hs[Math.floor(k / 2)] += k % 2 ? 1 : 0;
          if (hs.reduce((a, b) => a + b, 0) % 2) { hs[0]++; hs[k - 1]++; }
        }
        const h = hs.reduce((a, b) => a + b, 0);
        let y = sym ? Math.round(MID - h / 2) : Math.round(aim(0) - h / 2 + (rng.next() - 0.5) * 80);
        const top = y, cuts = [];
        for (let i = 0; i < k - 1; i++) { y += hs[i]; cuts.push(y); }
        made = { top, bot: top + h, cuts };
      } else {
        // step the bond toward where this wing's middle is heading; a plain
        // wing aims at nothing and so zig-zags about the sheet's middle
        if (form.curve) dir = aim(r) < (prev.top + prev.bot) / 2 ? -1 : 1;
        // the walls' jitter is a die roll, so a bond that will not fit is
        // tried again before the column gives up a room
        for (let kk = k; !made && kk >= 2; kk--) {
          for (let t = 0; !made && t < 6; t++) made = bond(prev, kk, dir) || bond(prev, kk, -dir);
        }
        if (!form.curve) dir = -dir;
      }
      // One room the height of the column behind cannot fail, and is never
      // reached on any wing at any seed the checker sweeps.
      cols.push(made || { top: prev.top, bot: prev.bot, cuts: [] });
    }
  }

  // ── 3. Rooms, and the nodes that stand in them ─────────────────────────────
  const all = [];
  const colRooms = [];
  for (let r = 0; r < nCols; r++) {
    const c = cols[r], ys = [c.top, ...c.cuts, c.bot];
    const list = [];
    for (let i = 0; i < ys.length - 1; i++) {
      const n = {
        id: `${regionId}-${r}-${i}`, row: r, col: i, type: null, next: [], prev: [],
        rect: { x0: X[r], x1: X[r + 1], y0: ys[i], y1: ys[i + 1] },
      };
      list.push(n); all.push(n);
    }
    colRooms.push(list);
  }
  const lastCol = cols[nCols - 1];
  const boss = {
    id: `${regionId}-boss`, row: bossRow, col: (lanes - 1) / 2, type: NodeType.BOSS, next: [], prev: [],
    rect: { x0: X[nCols], x1: AREA.x1, y0: lastCol.top - 18, y1: lastCol.bot + 18 },
  };
  const byId = Object.fromEntries(all.map((n) => [n.id, n]));
  byId[boss.id] = boss;

  // ── 4. Doors in shared walls ───────────────────────────────────────────────
  const overlap = (a, b) => [Math.max(a.rect.y0, b.rect.y0), Math.min(a.rect.y1, b.rect.y1)];
  const doorsBetween = (r) => {
    const out = [];
    for (const a of colRooms[r]) for (const b of colRooms[r + 1]) {
      const [lo, hi] = overlap(a, b);
      if (hi - lo < DOOR + DOOR_EDGE * 2) continue;
      out.push({ a, b, lo, hi });
    }
    return out;
  };

  // 4a. Hallways first, because they carve rooms and move walls.  A hallway
  //     runs THROUGH column t, between two of its rooms, from a room in column
  //     t-1 to a room in column t+1 — the classic generator's row-skipping
  //     passage, which on a plan is simply a corridor.  Rooms whose only way on
  //     is a single door get first claim on one.
  const halls = [];
  {
    const outDeg = new Map();
    for (let r = 0; r + 1 < nCols; r++) for (const d of doorsBetween(r)) outDeg.set(d.a.id, (outDeg.get(d.a.id) || 0) + 1);
    const want = form.halls ? form.halls - rng.int(2) : 3 + rng.int(3);
    const usedT = new Set();
    const cands = [];
    for (let t = 1; t + 1 <= lastWalk - 1; t++) {
      const rs = colRooms[t];
      for (let i = 1; i < rs.length; i++) {
        const up = rs[i - 1], dn = rs[i];
        const y = up.rect.y1;
        if (y - up.rect.y0 < 72 + HALL / 2 || dn.rect.y1 - y < 72 + HALL / 2) continue;
        const inside = (n) => n.rect.y0 + HALL / 2 + 12 <= y && y <= n.rect.y1 - HALL / 2 - 12;
        const A = colRooms[t - 1].find(inside), C = colRooms[t + 1].find(inside);
        if (!A || !C) continue;
        const starved = (outDeg.get(A.id) || 0) <= 1;
        cands.push({ t, i, y, A, C, up, dn, score: (starved ? 0 : 1) + rng.next() * 0.9 });
      }
    }
    cands.sort((p, q) => p.score - q.score);
    for (const c of cands) {
      if (halls.length >= want) break;
      if ([...usedT].some((t) => Math.abs(t - c.t) < 2)) continue;
      const keep = { up: c.up.rect.y1, dn: c.dn.rect.y0 };
      c.up.rect.y1 = c.y - HALL / 2;
      c.dn.rect.y0 = c.y + HALL / 2;
      // never at the price of a room's last way in or out
      let fine = true;
      for (const r of [c.t - 1, c.t]) {
        const ds = doorsBetween(r);
        for (const n of colRooms[r]) if (!ds.some((d) => d.a === n)) fine = false;
        for (const n of colRooms[r + 1]) if (!ds.some((d) => d.b === n)) fine = false;
      }
      if (!fine) { c.up.rect.y1 = keep.up; c.dn.rect.y0 = keep.dn; continue; }
      usedT.add(c.t);
      halls.push({
        from: c.A.id, to: c.C.id, t: c.t,
        x0: X[c.t], x1: X[c.t + 1], y0: c.y - HALL / 2, y1: c.y + HALL / 2, y: c.y,
      });
    }
  }

  // 4b. The doors.  Every shared wall that can take one is a candidate; the
  //     house then keeps most of them.  A wall left without its door is just a
  //     wall, and the plan draws it as one.
  const link = (a, b) => {
    if (!a.next.includes(b.id)) a.next.push(b.id);
    if (!b.prev.includes(a.id)) b.prev.push(a.id);
  };
  const doors = [];
  const edgeVia = new Map();                       // "a>b" -> { kind, via }
  for (let r = 0; r + 1 < nCols; r++) {
    let ds = doorsBetween(r);
    const out = new Map(), inn = new Map();
    for (const d of ds) {
      out.set(d.a.id, (out.get(d.a.id) || 0) + 1);
      inn.set(d.b.id, (inn.get(d.b.id) || 0) + 1);
    }
    for (const d of rng.shuffle(ds.slice())) {
      if (out.get(d.a.id) <= 1 || inn.get(d.b.id) <= 1) continue;
      if (!rng.chance(0.03)) continue;
      out.set(d.a.id, out.get(d.a.id) - 1); inn.set(d.b.id, inn.get(d.b.id) - 1);
      ds = ds.filter((q) => q !== d);
    }
    for (const d of ds) {
      const room = d.hi - d.lo - DOOR - DOOR_EDGE * 2;
      const y = Math.round(d.lo + DOOR_EDGE + DOOR / 2 + room * (0.5 + (rng.next() - 0.5) * 0.6));
      doors.push({ x: X[r + 1], y, from: d.a.id, to: d.b.id, kind: 'door' });
      link(d.a, d.b);
      edgeVia.set(d.a.id + '>' + d.b.id, { kind: 'door', via: [[X[r + 1], y]] });
    }
  }
  for (const h of halls) {
    const a = byId[h.from], c = byId[h.to];
    doors.push({ x: h.x0, y: h.y, from: h.from, to: h.to, kind: 'hall', w: HALL });
    doors.push({ x: h.x1, y: h.y, from: h.from, to: h.to, kind: 'hall', w: HALL });
    link(a, c);
    a.passage = true;
    edgeVia.set(a.id + '>' + c.id, { kind: 'hall', via: [[h.x0, h.y], [h.x1, h.y]] });
  }
  // the boss's hall: a door from every room at its threshold
  for (const n of colRooms[nCols - 1]) {
    const y = Math.round((n.rect.y0 + n.rect.y1) / 2);
    doors.push({ x: X[nCols], y, from: n.id, to: boss.id, kind: 'boss' });
    n.next = [boss.id]; boss.prev.push(n.id);
    edgeVia.set(n.id + '>' + boss.id, { kind: 'door', via: [[X[nCols], y]] });
  }
  // the front doors, one into each room on the threshold
  const entries = {};
  for (const n of colRooms[0]) {
    const y = Math.round((n.rect.y0 + n.rect.y1) / 2);
    doors.push({ x: X[0], y, from: null, to: n.id, kind: 'front' });
    entries[n.id] = [X[0], y];
  }

  // ── 5. Secret ways ─────────────────────────────────────────────────────────
  //     Any two rooms two to four columns apart, in any lane.  Rare on purpose.
  const secrets = [];
  {
    const count = rng.weighted([{ n: 0, w: 2 }, { n: 1, w: 5 }, { n: 2, w: 3 }]).n;
    const kit = DEVICES_BY_WING[regionId] || ['panel', 'fireplace', 'stair'];
    const used = new Set();
    for (let s = 0, tries = 0; s < count && tries < 40; tries++) {
      const r0 = rng.range(1, Math.max(1, lastWalk - 4));
      const S = rng.pick(colRooms[r0]);
      const span = rng.range(2, 4);
      const r1 = Math.min(r0 + span, lastWalk - 1);
      if (r1 - r0 < 2 || !S || used.has(S.id)) continue;
      // reach ACROSS the wing — a secret that lands next door is just a door
      const T = rng.shuffle(colRooms[r1].slice())
        .sort((p, q) => Math.abs(centreY(q) - centreY(S)) - Math.abs(centreY(p) - centreY(S)))
        .find((n) => !used.has(n.id) && !S.next.includes(n.id));
      if (!T) continue;
      if (secrets.some((o) => o.r0 <= r1 && r0 <= o.r1 && Math.abs(o.r0 - r0) < 2)) continue;
      used.add(S.id); used.add(T.id);
      const device = kit[(s + rng.int(kit.length)) % kit.length];
      // the device sits on the wall facing the way it goes, clear of the mark
      const up = centreY(T) < centreY(S);
      const at = (n, top) => [
        Math.round((n.rect.x0 + n.rect.x1) / 2 + (rng.next() - 0.5) * (n.rect.x1 - n.rect.x0) * 0.3),
        top ? n.rect.y0 + 12 : n.rect.y1 - 12,
      ];
      const a = at(S, up), b = at(T, !up);
      secrets.push({ from: S.id, to: T.id, device, a, b, r0, r1 });
      link(S, T);
      edgeVia.set(S.id + '>' + T.id, { kind: 'secret', device, via: [a, b] });
      s++;
    }
  }

  const ordered = [...all, boss].sort((a, b) => a.row - b.row || a.col - b.col);
  const rowsOf = Array.from({ length: rows }, (_, r) => ordered.filter((n) => n.row === r));
  const startIds = rowsOf[0].map((n) => n.id);

  // ── 6. What is in each room ────────────────────────────────────────────────
  assignTypes({ rng, ordered, rowsOf, byId, boss, meta, rows, lastWalk, hauntLevel, companion, rescued, startIds });

  // ── 7. Positions: each mark stands in the middle of its own room ───────────
  for (const n of ordered) {
    n.x = +(((n.rect.x0 + n.rect.x1) / 2) / PLAN_SHEET.w).toFixed(5);
    n.y = +(centreY(n) / PLAN_SHEET.h).toFixed(5);
  }

  // ── 8. Names ───────────────────────────────────────────────────────────────
  assignRoomNames(regionId, ordered, boss, rng, lanes, rows);

  // ── 9. Wing conditions ─────────────────────────────────────────────────────
  const hazards = placeHazards(rng, ordered, byId, boss, startIds, lastWalk, rows, hauntLevel);

  // ── 10. Payloads, the edge list, and the drawing ───────────────────────────
  const edges = [];
  for (const n of ordered) {
    n.visited = false;
    n.payload = {
      region: regionId,
      depth: n.row,
      tier: n.row < 4 ? 'early' : n.row < rows - 5 ? 'mid' : 'late',
      roomTag: n.roomTag,
      hazard: n.hazard || null,
      scene: sceneForNode(n),
    };
    if (n.type === NodeType.RESCUE) n.payload.companion = meta.companion;
    if (n.type === NodeType.BOSS) n.payload.boss = meta.boss;
    delete n.prev;
    for (const id of n.next) {
      const e = edgeVia.get(n.id + '>' + id) || { kind: 'door', via: [] };
      edges.push({ from: n.id, to: id, kind: e.kind, via: e.via, ...(e.device ? { device: e.device } : {}) });
    }
  }

  // Keep the original neighboring-room geometry. The display layout inserts
  // real hallway space between these columns without scattering route branches.
  const draft={rooms:ordered.map(n=>({id:n.id,...n.rect})),halls,doors,cols:X};
  for (const n of ordered) delete n.rect;
  const plan = { style, draft };

  return layOutMansion({
    regionId, seed, rows, lanes, character: 'plan',
    nodes: ordered, edges, bossId: boss.id, startIds, hazards, meta, plan,
  });
}

function centreY(n) { return (n.rect.y0 + n.rect.y1) / 2; }

// ─────────────────────────────────────────────────────────────────────────────
// Room types.  The classic recipe (mapgen.js) — base shares, a wing character,
// the guaranteed rest at the boss's door, every Big Scare avoidable — with two
// changes: the event shares are a little smaller, and a SPACING pass at the end
// keeps a fight within reach every other room (designer, 2026-10-27: "a fight,
// on average, every other room").  The classic sheet averaged 47% fights per
// walked room but let 82% of routes go three or more rooms without one.
// ─────────────────────────────────────────────────────────────────────────────
function assignTypes({ rng, ordered, rowsOf, byId, boss, meta, rows, lastWalk, hauntLevel, companion, rescued, startIds }) {
  for (const n of rowsOf[0]) n.type = NodeType.SCUFFLE;
  const open = ordered.filter((n) => !n.type);
  const n0 = open.length;
  const wantRescue = false; // Pets are freed by their zone boss, never a side room.

  const CHARACTERS = [
    { id: 'plain',    w: 3, lean: {} },
    { id: 'market',   w: 2, lean: { [NodeType.SHOP]: +1, [NodeType.TREASURE]: +1, [NodeType.BIG_SCARE]: -1 } },
    { id: 'haunted',  w: 2, lean: { [NodeType.BIG_SCARE]: +2, [NodeType.SAFE]: -1, [NodeType.CURIOSITY]: -1 } },
    { id: 'hoard',    w: 2, lean: { [NodeType.TREASURE]: +2, [NodeType.UNKNOWN]: -1 } },
    { id: 'quiet',    w: 2, lean: { [NodeType.SAFE]: +2, [NodeType.CURIOSITY]: +1, [NodeType.BIG_SCARE]: -1 } },
    { id: 'strange',  w: 2, lean: { [NodeType.UNKNOWN]: +2, [NodeType.CURIOSITY]: +2, [NodeType.TREASURE]: -1 } },
    { id: 'derelict', w: 1, lean: { [NodeType.UNKNOWN]: +3, [NodeType.SHOP]: -1, [NodeType.SAFE]: -1 } },
  ];
  const character = rng.weighted(CHARACTERS);
  const share = (frac, lo, hi, jitter = 1) => clamp(Math.round(n0 * frac) + rng.range(-jitter, jitter), lo, hi);
  const quota = {
    [NodeType.BIG_SCARE]: share(0.065, 2, 5) + (hauntLevel >= 3 ? 1 : 0),
    [NodeType.SAFE]:      share(0.10, 2, 6),
    [NodeType.SHOP]:      clamp(Math.round(n0 / 26) + (rng.chance(0.35) ? 1 : 0), 1, 3),
    [NodeType.TREASURE]:  share(0.07, 1, 5),
    [NodeType.RESCUE]:    wantRescue ? 1 : 0,
    [NodeType.UNKNOWN]:   share(0.11, 2, 7),
    [NodeType.CURIOSITY]: share(0.20, 3, 12, 2),
  };
  for (const t in character.lean) quota[t] = Math.max(0, (quota[t] || 0) + character.lean[t]);
  if (wantRescue) quota[NodeType.RESCUE] = 1;

  const adjacentTypes = (n) => {
    const out = new Set();
    for (const id of n.next) if (byId[id]?.type) out.add(byId[id].type);
    for (const id of n.prev) if (byId[id]?.type) out.add(byId[id].type);
    return out;
  };
  const sameRowNeighbourTypes = (n) => {
    const set = new Set();
    for (const o of rowsOf[n.row]) if (o !== n && Math.abs(o.col - n.col) <= 1 && o.type) set.add(o.type);
    return set;
  };
  const rules = {
    [NodeType.BIG_SCARE]: (n) => n.row >= 4
      && !adjacentTypes(n).has(NodeType.BIG_SCARE) && !sameRowNeighbourTypes(n).has(NodeType.BIG_SCARE),
    [NodeType.SAFE]: (n) => n.row >= 4 && n.row !== lastWalk && n.row !== 13
      && !adjacentTypes(n).has(NodeType.SAFE) && !sameRowNeighbourTypes(n).has(NodeType.SAFE),
    [NodeType.SHOP]: (n) => n.row >= 3 && n.row !== lastWalk
      && !adjacentTypes(n).has(NodeType.SHOP) && !sameRowNeighbourTypes(n).has(NodeType.SHOP),
    [NodeType.TREASURE]: (n) => n.row >= 3
      && !adjacentTypes(n).has(NodeType.TREASURE) && !sameRowNeighbourTypes(n).has(NodeType.TREASURE),
    [NodeType.RESCUE]: (n) => n.row >= 4 && n.row <= rows - 4 && rowsOf[n.row].length >= 2,
    [NodeType.UNKNOWN]: (n) => n.row >= 2 && n.row !== lastWalk,
    [NodeType.CURIOSITY]: (n) => n.row >= 2,
  };

  // The boss's door row: one guaranteed rest, the other doors something worth
  // walking past a rest for (mapgen.js has the history).
  const doorRow = rowsOf[lastWalk] || [];
  const scares = new Set();
  if (doorRow.length) {
    const restIdx = rng.int(doorRow.length);
    const others = rng.shuffle([
      NodeType.TREASURE, NodeType.SHOP, NodeType.BIG_SCARE, NodeType.SCUFFLE, NodeType.SCUFFLE,
    ]).slice(0, Math.max(0, doorRow.length - 1));
    let k = 0;
    doorRow.forEach((n, i) => {
      if (i === restIdx) { n.type = NodeType.SAFE; return; }
      n.type = others[k++] || NodeType.SCUFFLE;
      if (n.type === NodeType.BIG_SCARE) scares.add(n.id);
    });
  }
  const forcesAScare = (n) => {
    for (const pid of n.prev || []) {
      const p = byId[pid];
      if (!p || !p.next.length) continue;
      if (p.next.every((id) => id === n.id || scares.has(id) || byId[id]?.type === NodeType.BIG_SCARE)) return true;
    }
    return false;
  };
  for (const n of doorRow) {
    if (n.type === NodeType.BIG_SCARE && forcesAScare(n)) { n.type = NodeType.SCUFFLE; scares.delete(n.id); }
  }
  const bossReachableAvoiding = (blocked) => {
    const seen = new Set();
    const q = startIds.filter((id) => !blocked.has(id));
    for (const id of q) seen.add(id);
    while (q.length) {
      const cur = byId[q.shift()];
      if (!cur) continue;
      for (const id of cur.next) {
        if (id === boss.id) return true;
        if (blocked.has(id) || seen.has(id)) continue;
        seen.add(id); q.push(id);
      }
    }
    return false;
  };

  const order = [NodeType.RESCUE, NodeType.BIG_SCARE, NodeType.SAFE, NodeType.TREASURE,
                 NodeType.SHOP, NodeType.UNKNOWN, NodeType.CURIOSITY];
  for (const type of order) {
    let need = quota[type] || 0;
    if (!need) continue;
    const pool = rng.shuffle(open.filter((n) => !n.type));
    if (type === NodeType.BIG_SCARE) pool.sort((a, b) => b.row - a.row);
    if (type === NodeType.TREASURE) pool.sort((a, b) => Math.abs(a.row - rows * 0.55) - Math.abs(b.row - rows * 0.55));
    for (const n of pool) {
      if (need <= 0) break;
      if (!rules[type](n)) continue;
      if (type === NodeType.BIG_SCARE) {
        if (forcesAScare(n)) continue;
        scares.add(n.id);
        if (!bossReachableAvoiding(scares)) { scares.delete(n.id); continue; }
      }
      n.type = type; need--;
    }
  }
  for (const n of open) if (!n.type) n.type = NodeType.SCUFFLE;

  // ── the spacing pass ──────────────────────────────────────────────────────
  // `run(n)` is the longest stretch of rooms without a fight that any route can
  // arrive at `n` carrying.  Three in a row is one too many: the room itself
  // becomes a Scuffle if it is only an event, otherwise the room behind it that
  // fed it the longest stretch does.  Rests, rescues and the boss's door row
  // are never spent on this.
  const spendable = (n) => n.row !== lastWalk && n.row > 0
    && (n.type === NodeType.CURIOSITY || n.type === NodeType.UNKNOWN);
  const spendable2 = (n) => n.row !== lastWalk && n.row > 0
    && (n.type === NodeType.TREASURE || n.type === NodeType.SHOP)
    && ordered.filter((o) => o.type === n.type).length > 1;
  for (let guard = 0; guard < ordered.length; guard++) {
    const run = new Map();
    let fix = null;
    for (const n of ordered) {
      if (isFight(n.type)) { run.set(n.id, 0); continue; }
      let m = 0, worst = null;
      for (const pid of n.prev) {
        const v = run.get(pid) ?? 0;
        if (v > m) { m = v; worst = byId[pid]; }
      }
      run.set(n.id, m + 1);
      if (m + 1 >= GAP_MAX + 1) {
        const chain = [n];
        for (let p = worst, d = 0; p && d < 2; d++) {
          chain.push(p);
          let w = null, best = -1;
          for (const pid of p.prev || []) { const v = run.get(pid) ?? 0; if (v > best) { best = v; w = byId[pid]; } }
          p = best > 0 ? w : null;
        }
        fix = chain.find(spendable) || chain.find(spendable2) || null;
        if (fix) break;
      }
    }
    if (!fix) break;
    fix.type = NodeType.SCUFFLE;
  }

  // ── and back down to every other room ─────────────────────────────────────
  // The spacing pass only ever ADDS fights, and on its own it lands near 57%.
  // So hand Scuffles back to the house's oddities wherever that cannot open a
  // gap of three — a Scuffle whose longest quiet stretch in, plus itself, plus
  // the longest quiet stretch out, still fits — until half the rooms are fights.
  const walk = ordered.filter((n) => n.type !== NodeType.BOSS);
  const runsIn = () => {
    const m = new Map();
    for (const n of ordered) {
      if (isFight(n.type)) { m.set(n.id, 0); continue; }
      let v = 0; for (const pid of n.prev) v = Math.max(v, m.get(pid) ?? 0);
      m.set(n.id, v + 1);
    }
    return m;
  };
  const runsOut = () => {
    const m = new Map();
    for (let i = ordered.length - 1; i >= 0; i--) {
      const n = ordered[i];
      if (isFight(n.type)) { m.set(n.id, 0); continue; }
      let v = 0; for (const id of n.next) v = Math.max(v, m.get(id) ?? 0);
      m.set(n.id, v + 1);
    }
    return m;
  };
  const target = Math.round(walk.length * 0.40);
  for (let guard = 0; guard < walk.length; guard++) {
    const fights = walk.filter((n) => isFight(n.type)).length;
    if (fights <= target) break;
    const ri = runsIn(), ro = runsOut();
    const quietIn = (n) => n.prev.reduce((v, pid) => Math.max(v, ri.get(pid) ?? 0), 0);
    const quietOut = (n) => n.next.reduce((v, id) => Math.max(v, ro.get(id) ?? 0), 0);
    const ok = walk.filter((n) => n.type === NodeType.SCUFFLE && n.row >= 2 && n.row !== lastWalk
      && quietIn(n) + 1 + quietOut(n) <= GAP_MAX);
    if (!ok.length) break;
    const n = rng.pick(ok);
    n.type = rng.chance(0.3) ? NodeType.UNKNOWN : NodeType.CURIOSITY;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wing conditions, placed as bands across two or three columns of the plan.
// Same contract as the classic placer: at most one boon, and every condition is
// avoidable — you can always reach the boss without entering it.
// ─────────────────────────────────────────────────────────────────────────────
function placeHazards(rng, ordered, byId, boss, startIds, lastWalk, rows, hauntLevel) {
  const count = clamp(2 + (rows >= 14 ? 1 : 0) + (hauntLevel >= 2 ? 1 : 0), 2, 4);
  const bag = rng.shuffle(HAZARDS.filter((h) => h.kind === 'hazard'));
  const boons = rng.shuffle(HAZARDS.filter((h) => h.kind === 'boon'));
  const chosen = [];
  for (let i = 0; i < count; i++) {
    if (i === 1 && boons.length) chosen.push(boons.pop());
    else if (bag.length) chosen.push(bag.pop());
  }
  const reachable = (blocked) => {
    const seen = new Set();
    const q = startIds.filter((id) => !blocked.has(id));
    q.forEach((id) => seen.add(id));
    while (q.length) {
      const cur = byId[q.shift()];
      if (!cur) continue;
      for (const id of cur.next || []) {
        if (id === boss.id) return true;
        if (blocked.has(id) || seen.has(id)) continue;
        seen.add(id); q.push(id);
      }
    }
    return false;
  };
  const usedRows = new Set();
  const out = [];
  for (const h of chosen) {
    let placed = null;
    for (let attempt = 0; attempt < 30 && !placed; attempt++) {
      const span = rng.range(2, 3);
      const r0 = rng.range(2, Math.max(2, lastWalk - span));
      const r1 = Math.min(r0 + span - 1, lastWalk);
      let clash = false;
      for (let r = r0; r <= r1; r++) if (usedRows.has(r)) clash = true;
      if (clash) continue;
      const band = AREA_H * (0.28 + rng.next() * 0.24);
      const ya = AREA.y0 + rng.next() * (AREA_H - band);
      const members = ordered.filter((n) => n.type !== NodeType.BOSS && n.row >= r0 && n.row <= r1
        && n.y * PLAN_SHEET.h >= ya && n.y * PLAN_SHEET.h <= ya + band);
      if (members.length < 2) continue;
      if (!reachable(new Set(members.map((n) => n.id)))) continue;
      for (let r = r0; r <= r1; r++) usedRows.add(r);
      for (const n of members) n.hazard = h.id;
      const xs = members.map((n) => n.x), ys = members.map((n) => n.y);
      placed = {
        ...h,
        rows: [r0, r1], cols: [Math.min(...members.map((n) => n.col)), Math.max(...members.map((n) => n.col))],
        nodeIds: members.map((n) => n.id),
        rect: {
          x0: clamp(Math.min(...xs) - 0.045, 0.012, 0.98),
          x1: clamp(Math.max(...xs) + 0.045, 0.02, 0.988),
          y0: clamp(Math.min(...ys) - 0.06, 0.050, 0.98),
          y1: clamp(Math.max(...ys) + 0.06, 0.02, 0.845),
        },
      };
    }
    if (placed) out.push(placed);
  }
  return out.sort((a, b) => a.rows[0] - b.rows[0]);
}
