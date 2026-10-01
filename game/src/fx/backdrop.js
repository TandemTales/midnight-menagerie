/**
 * Backdrop — the reusable, data-driven 3D environment behind every scene.
 * OWNER: atmosphere agent.
 *
 * Composition, camera-out:
 *   near frame (drapes / lintel / clutter)  z = +7.2
 *   light shafts                            origin near the ceiling, landing on the floor
 *   silhouette props, laid out per region   z = -1 .. -room.d
 *   contact shadows                         y = 0.015, under every standing prop
 *   floor                                   y = 0
 *   ceiling                                 y = room.h  (omitted for open-air regions)
 *   far wall                                z = -room.d
 *   side walls                              x = ±room.w/2
 *
 * Round 2 (2026-08-20). Two things changed structurally:
 *
 *  1. THE ROOM IS NO LONGER ONE FIXED BOX. `pal.room` gives every region its own
 *     width, depth, ceiling height, side-wall toe-in and ceiling treatment, and
 *     `pal.props.layout` gives it its own prop arrangement. Seventeen recolours
 *     of one room measured 0.63 mean structural cross-correlation; the geometry
 *     has to differ, not just the hue.
 *  2. SHAFTS LAND. Each shaft computes its own floor intersection, is extended to
 *     reach it, and publishes an elliptical pool that the floor shader paints.
 *
 * Everything is procedural and driven by a region palette object. World units are
 * metres; eye height is ~2.2 m.
 */
import * as THREE from 'three';
import {
  WALL_VERT, WALL_FRAG, FLOOR_VERT, FLOOR_FRAG,
  PROP_VERT, PROP_FRAG, SHAFT_VERT, SHAFT_FRAG, FRAME_VERT, FRAME_FRAG,
  SHADOW_VERT, SHADOW_FRAG, FLAME_VERT, FLAME_FRAG,
} from './shaders/backdrop.js';

/* 52 WAS BEING SPENT BEFORE THE ROOM WAS FURNISHED. The terrace layout pushes
 * a run of masonry planting beds per tier AS WELL AS its props, and the whole
 * lot is then sliced to MAX_PROPS -- so the Greenhouse was pushing 36 beds and
 * 30 plants, 66 entries, and losing the last 14, which are the BACK TIER's
 * plants. That is a large part of why the room that is meant to be the most
 * crowded in the house photographed as an empty hall with two columns in it. */
/* MAX_SHAFTS: a room's own shafts stop at ROOM_SHAFTS, as they always did;
   the last two slots are the raking pair a fight's room may add (round 21
   graft, Backdrop.build). */
const MAX_PROPS = 72, MAX_SHAFTS = 8, ROOM_SHAFTS = 6, MAX_POOLS = 4, MAX_FLAMES = 10;
/* The night every region's sky is carried toward. It is the Graveyard's own
   `deep`, which is the one open-air region whose sky was tuned against
   mainMenu.png: measured, it comes out at hue 216 and a sky level of 7.8-16.9
   across the four ceiling-less regions, against the samples' 8.5-16.5. */
const NIGHT_DEEP = new THREE.Color(0x141725);
const FLOOR_FRONT = 15;      // how far the floor reaches toward/behind the camera

/** Default room if a region does not author one. */
export const DEFAULT_ROOM = {
  w: 24, d: 19, h: 6.6, side: 0.0, ceilPattern: 3, wallPad: 7.0,
};

/* THE REAL HEIGHT OF EACH PROP, IN METRES.
 *
 * This used to be `SHAPE_H`, a unitless multiplier on the region's authored
 * `props.height`, and the result was that a prop's size depended on which room
 * it was standing in. In the Foyer (height 2.5) shape 0 came out at
 * 2.5 * 0.85 * (0.80..1.24) = 1.70-2.65 m of quad for an ARMCHAIR, whose SDF
 * fills 0.74 of its quad -- so the game was drawing chairs 1.3 to 2.0 m tall.
 * BRIEF-r9's item-1 table says a chair is 0.85-1.00 m overall, and its rubric
 * question 3 says a room where one object is at the wrong size makes every
 * other object in it suspect. Both judges called the Foyer's props "pale grey
 * slabs"; part of why is that they are the size of slabs.
 *
 * So these are METRES OF QUAD, chosen as (the real object's height) / (the
 * fraction of the quad that shape's SDF actually fills in shapeField), which
 * is why some of them look tall: an armchair's SDF tops out at uv.y 0.74, so
 * 0.88 m of chair needs 1.20 m of quad.
 *
 *   #   object          real height            table row
 *   0   armchair        0.88 m overall         chair back 0.85-1.00
 *   1   candelabrum     1.55 m floor stand     --
 *   2   potted palm     1.30 m                 --
 *   3   headstone       0.78 m                 headstone 0.60-0.90
 *   4   chandelier      1.10 m of drop         --
 *   5   cabinet         1.95 m                 --
 *   6   column          3.30 m, dia h/8.9      column dia = h/8 to h/10
 *   7   drape           set from the ceiling   --
 *   8   crate stack     0.95 m                 --
 *   9   shrub           1.20 m                 --
 *  10   cot             0.95 m to the rail     --
 *  11   rocking horse   1.05 m                 --
 *  12   four-poster     2.30 m to the tester   --
 *  13   range           1.70 m with its flue   --
 *  14   longcase clock  2.10 m                 --
 *  15   statue          2.15 m, figure 1.69    --
 *  16   chest tomb      0.80 m                 headstone family
 *  17   clawfoot bath   0.78 m                 --
 *  18   lamp standard   3.40 m                 --
 *  19   birdcage stand  1.60 m                 --
 *  20   pier glass      2.80 m                 --
 *  21   grand piano     2.05 m of quad         --  (round 18 graft, ORCHIL's: its quad is a
 *                       quarter wider, SHAPE_W 1.62 -> 2.025, and the left fifth holds the pianist)
 *  22   pendant fitting SIZED BY ITS DROP      -- see _fixtures
 *  23   light standard  SIZED BY ITS LAMP      -- see _fixtures
 *  24   planting bed    0.43 m of brick, 2.9 m long, fans to 1.45   brick course 0.075
 *  25   fountain        3.1 m to its figure, basin 3.4 m across  (round 14; the
 *                       figure on the top is round 17's, and the quad grew with
 *                       it -- SHAPE_W shrank to keep the quad the same WIDTH)
 *  26   bust on a term  1.85 m, the bust 0.8 of it          (round 14)
 *  27   pumpkin         0.62 m of body in a 1.0 m quad, with its stem and
 *                       leaves; +-46%, most small and a few prize ones (round 22)
 *  28   clipped yew     2.9 m to its sheared top, a 4.8 m length of maze wall,
 *                       usually placed as architecture at its own size (round 22)
 *  29   kitchen table   0.86 m to its top, 2.7 m long, and what is on it (round 22)
 *
 * 22 and 23 are FITTINGS and are never dealt from a region's prop pack:
 * `_fixtures` places one at each practical light and sizes it from the room,
 * because a chandelier's chain is as long as the ceiling is high. Their two
 * entries below are placeholders the fixture sizing never reads.
 *
 * 24 is round 10's Greenhouse planting bed (SORREL2, ui/r10-bg3-b), which was
 * shape 22 on that branch. It was renumbered when it was grafted onto a build
 * that had already given 22 and 23 to the fittings; the shader's branches, the
 * fittings' `vShape > 21.5` tests and the Greenhouse's props.shapes all moved
 * with it.
 */
const SHAPE_M = [1.20, 2.00, 1.30, 1.00, 2.00, 2.00, 3.32, 2.60, 1.17, 1.33,
                 1.56, 1.30, 2.16, 1.50, 2.00, 2.44, 1.27, 0.97, 3.09, 1.56,
                 2.80, 2.05, 2.60, 1.70, 1.55, 3.20, 1.92,
                 1.20, 3.10, 1.30,
                 /* graft: 30 a clipped topiary -- a spiral, a tiered stand, a
                    cone, or a ball-tree in its box on a plinth (VANDYKE's) */
                 2.30,
                 /* graft: 31 the statue on its plinth drawn clean -- shape 15's
                    figure with a smooth, resolvable surface (the Heart, the maze) */
                 2.44,
                 /* round 23: 32 a roll-top bath on claw feet, full, its taps
                    at one end (graft: ULTRAMARINE's drawing, authored at
                    1.45 m with the steam off it) */
                 1.45,
                 /* 33 a hanging lantern, sized by its chain in push;
                    34 a lamp-maker's bench, its rack of glass over it */
                 3.00, 1.60,
                 /* 35 a telescope on its tripod (graft: ULTRAMARINE's, big
                    enough to read across the room); 36 a steamer trunk, a
                    case on half of them; 37 furniture under a dust sheet */
                 3.10, 1.05, 1.45,
                 /* 38 a roof truss, sized to the room it stands in */
                 5.00,
                 /* 39 a kennel, 40 a dog's basket and its bowl, 41 a
                    grooming table with its arm, 42 a zinc wash tub on its
                    trestle with the tap over it (graft: ULTRAMARINE's) */
                 1.70, 0.70, 1.72, 1.55,
                 /* 43 a candle-dipping rack hung with its tapers (graft,
                    MADDERLAKE's, for the wax room's floor) */
                 1.92,
                 /* 44 an orrery on its table (graft, MADDERLAKE's, the
                    attic observatory) */
                 1.60
];
/* ...and a width ratio, so a column is a column and not a capital-T. Four of
 * these were wrong by enough to change what the object was: a longcase clock
 * 0.23 m wide (a stick), a bath 0.99 m long (a basin), a four-poster 2.76 m
 * wide, and a column at h/12.3 when the table says h/8 to h/10. */
const SHAPE_W = [1.15, 0.55, 1.00, 0.95, 0.72, 0.80, 0.47, 0.85, 0.90, 1.35,
                 1.30, 1.20, 0.87, 1.14, 0.77, 0.78, 1.80, 2.24, 0.50, 0.62,
                 0.72, 2.025, 0.62, 0.34, 1.80, 1.476, 0.34,
                 1.62, 1.55, 2.10, 0.62, 0.78,
                 1.31,
                 0.26, 1.66,
                 1.06, 1.12, 0.85,
                 2.6,
                 1.34, 2.30, 0.80, 1.09,
                 0.76, 0.70
];
/* HOW MUCH ONE OF THESE VARIES FROM THE NEXT, as a +-fraction of SHAPE_M.
 *
 * Pinning every prop to its real height in metres is right -- BRIEF-r9's
 * rubric question 3 -- but it was applied with a flat +-5% to all twenty
 * shapes, and the first capture of the Greenhouse after it showed what that
 * costs: thirty plants at 1.43 m +-5% standing in a 30 x 26 x 10.5 m glasshouse
 * read as an EMPTY room, where the same room with the old (wrong) 3 m plants at
 * least read as planted. Both captures are wrong, and for opposite reasons.
 *
 * A MANUFACTURED OBJECT COMES IN STANDARD SIZES AND A LIVING ONE DOES NOT. A
 * dining chair is 0.88 m in every house on the street; the palms in a
 * conservatory run from a 0.4 m pot on the staging to a 4 m specimen with its
 * head in the glass, and a hedge is whatever it has grown to since it was last
 * cut. So the organic shapes -- plant, shrub -- get a real spread and the
 * joinery does not. This is also what stops a terrace of identical plants
 * reading as a stamped tile, which is fix 5's complaint about the Crypt's
 * loculi in a different room. */
const SHAPE_VAR = [0.06, 0.08, 0.62, 0.20, 0.10, 0.08, 0.10, 0.10, 0.16, 0.48,
                   0.06, 0.06, 0.06, 0.06, 0.06, 0.14, 0.14, 0.06, 0.08, 0.08,
                 0.06, 0.04, 0.00, 0.00, 0.22, 0.00, 0.04,
                 0.34, 0.06, 0.05, 0.16, 0.14,
                 0.05,
                 0.00, 0.05,
                 0.04, 0.10, 0.16,
                 0.0,
                 0.08, 0.08, 0.04, 0.06,
                 0.04, 0.03
];
/* ROUND 23 (graft): ULTRAMARINE's drawings are in metres at their own
   proportions, so their quads take no width jitter -- a telescope 22%
   narrower than its drawing is a telescope with its objective cut off.
   (rand() is still drawn for them, so no other room's stream moves.) */
const FIXW = { 32: 1, 33: 1, 34: 1, 35: 1, 39: 1, 40: 1, 41: 1, 42: 1, 43: 1, 44: 1 };
// Which shapes hang from the ceiling rather than stand on the floor.
export const HANGING = { 4: 1, 7: 1, 22: 1, 33: 1 };
/* ...and which stand AGAINST A WALL rather than out on the floor. A tall
   mirror marooned in the middle of a dance floor reads as a slab; against a
   wall it reads as the thing a ballroom is lined with. */
export const WALLSIDE = { 20: 1 };

/* ══════════════ A LIGHT YOU CAN SEE NEEDS A FITTING ═══════════════════════
   BRIEF-r10 fix 1, and it is one root cause behind complaints from both judges
   in two rooms each: "the white ovals hovering at head height have no chain,
   no ceiling rose and no fitting, so they are unnameable objects in otherwise
   built rooms", and "three pale ovals float in front of the wall attached to
   nothing".

   `Backdrop.syncFlames` draws a visible flame at every practical light, which
   is right -- the flicker that drives the illumination has to drive the source
   you can see, or the room reads as lit by nothing. What was missing is the
   LAMP. These two shapes are the body: a chandelier whose chain runs up to a
   ceiling rose, and a standard whose stem runs down to the floor. Both are
   authored in METRES off vSize rather than in fractions of their quad, because
   the drop and the stem are as long as the room needs them to be and a body
   authored as a fraction would stretch with them.

   THE OTHER HALF IS THAT SOME OF THOSE LIGHTS SHOULD NOT BE DRAWING A SOURCE
   AT ALL, and the Graveyard's "two moons" is the proof. Measured: a 3424 px
   disc and a 323 px one, both deterministic, both untouched by motes=0 and
   shafts=0. The small one is the flame sprite of the region's one cold
   practical, which sits at y 8.00 in open air over a churchyard -- i.e. it is
   the moon, already drawn as the moon by the sky, and a second mottled disc
   with a halo is drawn on top of it. Confirmed before it was fixed, with
   flames=0 on the backdrop-room hash: the small disc's box goes from 255 to
   18 and the real moon does not move. */
export const FIT = { NONE: 'none', CHANDELIER: 'chandelier', LAMP: 'lamp' };
/** Shape ids for the two fittings. */
const SHAPE_PENDANT = 22, SHAPE_STANDARD = 23;
/** How far a chandelier's bowl and finial hang BELOW its candle cups, and how
 *  far a lantern's cap stands above its flame. Both fix where the flame sprite
 *  lands inside the body, so they are shared with the shader. */
const PEND_BELOW = 0.62, LAMP_ABOVE = 0.46;

/**
 * WHICH FITTING A PRACTICAL LIGHT HANGS IN, or 'none' if it should not be
 * drawing a visible source at all.
 *
 * One classifier used twice -- `Backdrop._fixtures` builds the body from it and
 * `Atmosphere._buildLights` suppresses the flame of anything that comes back
 * 'none' -- so a light can never end up with a flame and no fitting, which is
 * the whole defect. A region may name `fit` on a light and that always wins.
 */
export function fittingFor(L, room) {
  if (!L) return FIT.NONE;
  if (L.fit) return L.fit;
  if (L.glow !== undefined && L.glow <= 0.001) return FIT.NONE;
  const ceil = room && room.h > 0 ? room.h : 0;
  /* OPEN AIR -- the Graveyard, the Hedge Maze, the Pumpkin Grounds, the Title.
     There is no ceiling to hang anything from, so a light up in the sky is the
     moon or nothing; down at head height it is a lamp somebody set on a path. */
  if (ceil <= 0.01) return L.y > 3.2 ? FIT.NONE : FIT.LAMP;
  /* A COLD LIGHT INDOORS IS MOONLIGHT THROUGH A GLAZED WALL, not a lamp. There
     is no object in the room holding it and there should be no disc where it
     is: the pale blue oval in the Foyer's top right and the two on the
     Greenhouse's glass are this light and nothing else. A region whose cold
     lamps ARE lamps -- the Lampworks -- says so with `fit`. */
  if (L.kind === 'cold') return FIT.NONE;
  return L.y >= Math.max(2.6, ceil * 0.34) ? FIT.CHANDELIER : FIT.LAMP;
}

/**
 * THE SUBJECT of a room, by name. A region's `subject` picks one; `subjectH` in
 * shaders/backdrop.js draws it into the wall's relief.
 *
 * An architecture MODE says what a wall is made of. Seventeen regions share six
 * of them, so the Crypt and the Secret Passages were one coursed wall
 * recoloured and the Kitchens, the Attic and the Lampworks were one set of
 * rails. A subject is the thing the region is NAMED after, and every one of
 * these was already written down in `docs/art/background-prompts.md` — the list
 * nobody was ever going to paint.
 */
export const SUBJECT = {
  none: 0, stair: 1, bookcase: 2, niches: 3, terrace: 4, bench: 5,
  wardrobe: 6, pens: 7, topiary: 8, timber: 9, mirrors: 10, dado: 11,
  rafters: 12, fence: 13, coping: 14, toyshelf: 15, range: 16, hearth: 17,
  /* Round 11: the OTHER rooms of a wing -- see ROOM_KINDS in atmosphere.js.
     The Foyer's hall with a fire and its arcaded gallery, the Ballroom's
     musicians' gallery and its curtained dais, the Greenhouse's palm house
     and its vinery, and the Graveyard's chapel yard and its mausolea. */
  chimney: 18, arcade: 19, music: 20, dais: 21, palm: 22, vine: 23,
  chapel: 24, mausolea: 25, tomb: 26, ossuary: 27,
  /* Round 14: the Lampworks' chandlery, reflector gallery and boiler walk,
     and the Bathhouse's steam room, pool and pipe gallery. */
  wax: 28, reflector: 29, boiler: 30, steam: 31, pool: 32, pipes: 33,
  /* Round 22: the Kitchens' scullery, the Secret Passages' run behind the
     library and its false closet -- drawn by program 8 with their wings. */
  scullery: 34, backcase: 35, closet: 36,
  /* (graft: the maze's fountain court, its hedge clipped into piers with
     statues in niches between them -- CAPUT's) */
  court: 37,
  /* Round 23: the Bathhouse's bath hall, the Lampworks' workshop, the Attic's
     observatory and its archive under the eaves, the Kennels' range and
     their wash room -- each drawn by its wing's own program (12-15) */
  baths: 38, lampshop: 39, observatory: 40, eaves: 41, kennel: 42, washroom: 43,
};
/* WHICH WALL PROGRAM A SUBJECT IS DRAWN BY (MM_ROOMS in shaders/backdrop.js).
   Round 11's rooms first went into the one wall program with everything else,
   and linking it cost the page 25 s of warm-up against BASE on this machine
   (50.9 -> 75.5 s, two runs each, same window). So each wing's rooms are a
   variant of their own: every other subject is program 0, which is the wall as
   it was plus a few lines, and a variant is linked in the background after the
   stage has warmed (precompileRooms), so the first room of a wing finds its
   program ready. The mirror hall is the Ballroom's because its glints are.
   AND A VARIANT CARRIES ONLY ITS OWN WING: its architecture mode and the
   subjects its rooms can reach (the `#if MM_ROOMS` guards in the shader), not
   the other sixteen subjects and five modes it can never draw. Measured with
   each program linked alone on an idle GPU (Intel UHD, ANGLE D3D11): BASE's
   wall 6.3 s, program 0 6.6 s, a full-size variant 7.4-9.0 s -- and a guarded
   one 0.6-1.5 s, all five in 4.6 s. Warm-up 34.7 s, BASE 34.7 s. */
export const ROOMS_PROGRAM = {
  chimney: 1, arcade: 1,
  mirrors: 2, music: 2, dais: 2,
  palm: 3, vine: 3,
  chapel: 4, mausolea: 4,
  tomb: 5, ossuary: 5,
  boiler: 6,
  pipes: 7,
  /* round 22: the Hedge Maze (8), the Kitchens (9), the Secret Passages
     (10) and the Pumpkin Grounds (11) -- four wings whose walls are drawn
     whole (see hedgeWallH and its neighbours in shaders/backdrop.js), a
     program each: carried in one program, the other three wings' walls
     cost the Pumpkin Grounds' fight a register budget it did not have */
  topiary: 8, court: 8, range: 9, scullery: 9, timber: 10, backcase: 10, closet: 10, coping: 11,
  /* round 23: the Bathhouse (12) -- its hall, its hot room and its swimming
     bath; the pipe gallery stays in 7 as it was -- the Lampworks (13, its
     workshop, wax room and reflector gallery; the boiler walk stays in 6),
     the Attic (14) and the Kennels (15) */
  baths: 12, steam: 12, pool: 12,
  lampshop: 13, wax: 13, reflector: 13,
  observatory: 14, eaves: 14,
  /* (graft: and its wash room in a program of its own, 16) */
  kennel: 15, washroom: 16,
};

/**
 * THE LENS, FOR ANY VANTAGE (MADDER, round 11; grafted into the room kinds in
 * round 14).
 *
 * Until then every camera in the house stood on the room's centre line and
 * looked straight down it, so "half the visible width at this depth" was one
 * symmetric number and the layout clamp could say x = +-lim. A vantage that
 * stands down one side of the room and turns across it has a frame whose
 * middle is NOT x = 0 at any depth, so the clamp needs the real interval. This
 * is the camera's own basis -- eye, forward, right, up -- built from the same
 * rig `setCameraRig` is given, with no roll, which is all a layout needs to
 * ask "which x at this height and depth is in shot".
 */
export function lensOf(cam = {}, aspect = 16 / 9) {
  const ex = cam.x ?? 0, ey = cam.y ?? 2.3, ez = cam.z ?? 9.6;
  const tx = cam.lookX ?? 0, ty = cam.look ?? 2.4, tz = cam.lookZ ?? 0;
  let fx = tx - ex, fy = ty - ey, fz = tz - ez;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  // right = forward x worldUp, horizontal by construction
  let rx = -fz, rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl; rz /= rl;
  // the camera's own up = right x forward
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  const tanV = Math.tan(((cam.fov ?? 42) * Math.PI) / 360);
  return { ex, ey, ez, fx, fy, fz, rx, rz, ux, uy, uz, tanV, tanH: tanV * aspect };
}

const NLIGHT = 5;
/** How much of a cinematic (key/fill) light reaches a PROP. See syncLights. */
const CINE_PROP = 0.26;
/** ...and how much of the cinematic FILL, when it opposes the key in colour
 *  temperature, reaches one. That opposition is what makes a prop grey by
 *  construction: see syncLights. */
const CINE_FILL_PROP = 0.38;
function v4arr(n = NLIGHT) { return Array.from({ length: n }, () => new THREE.Vector4()); }
/* An unwritten Vector4 is (0, 0, 0, 1), and w is the slot's strength: an
   actor slot must start EMPTY, not as a shadow at the origin. */
const MAX_ACTORS = 6;
const STAGE_LIGHT = 0.9;
/* ...and how much of the room's warm light the fight's own pool lays on the
   floor round it, as a multiple of albedo (round 21 graft). Set by eye. */
const STAGE_WASH = 1.10;
function zeroV4(n) { return Array.from({ length: n }, () => new THREE.Vector4(0, 0, 0, 0)); }
function colArr(n = NLIGHT) { return Array.from({ length: n }, () => new THREE.Color()); }
/**
 * THREE.UniformsUtils.clone() only does `array.slice()`, so cloned materials end
 * up SHARING the Vector4/Color objects inside uniform arrays. Every clone needs
 * its own light slots or they all write over each other.
 */
function freshLightSlots(uniforms) {
  if (uniforms.uLights) uniforms.uLights.value = v4arr();
  if (uniforms.uLightCol) uniforms.uLightCol.value = colArr();
  if (uniforms.uLightInt) uniforms.uLightInt.value = new Array(NLIGHT).fill(0);
  if (uniforms.uPool) uniforms.uPool.value = v4arr(MAX_POOLS);
  if (uniforms.uPoolAxis) uniforms.uPoolAxis.value = v4arr(MAX_POOLS);
  if (uniforms.uPoolCol) uniforms.uPoolCol.value = colArr(MAX_POOLS);
  if (uniforms.uActor) uniforms.uActor.value = zeroV4(MAX_ACTORS);
  if (uniforms.uActorK) uniforms.uActorK.value = zeroV4(MAX_ACTORS);
  if (uniforms.uKeyF) uniforms.uKeyF.value = uniforms.uKeyF.value.clone();
  if (uniforms.uKeyCol) uniforms.uKeyCol.value = uniforms.uKeyCol.value.clone();
  if (uniforms.uActorBox) uniforms.uActorBox.value = uniforms.uActorBox.value.clone();
  if (uniforms.uStage) uniforms.uStage.value = uniforms.uStage.value.clone();
  if (uniforms.uStageCol) uniforms.uStageCol.value = uniforms.uStageCol.value.clone();
  if (uniforms.uSize) uniforms.uSize.value = uniforms.uSize.value.clone();
  if (uniforms.uSpan) uniforms.uSpan.value = uniforms.uSpan.value.clone();
  if (uniforms.uCamera) uniforms.uCamera.value = uniforms.uCamera.value.clone();
  if (uniforms.uAmbient) uniforms.uAmbient.value = uniforms.uAmbient.value.clone();
  return uniforms;
}

export class Backdrop {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'backdrop';
    scene.add(this.group);

    this.room = Object.assign({}, DEFAULT_ROOM);
    this.pools = [];   // [{x, z, r, i, ax, ay, stretch}]

    /* ---------------------------------------------------------------- wall */
    this.wallMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSeed: { value: 1.7 }, uDread: { value: 0 },
        uFogAmt: { value: 0.18 }, uArch: { value: 0 }, uCool: { value: 1 },
        uGrime: { value: 0.7 }, uOpen: { value: 0.5 }, uCeil: { value: 6.4 },
        /* the RISE, in metres, where the room's roof is PITCHED glass
           (ceilPattern 9, 12), else 0: its end walls then run on up into a
           glazed gable, and the gable's own feature is sized to it (round 18) */
        uGable: { value: 0 },
        uGain: { value: 3.4 }, uGloss: { value: 0.3 }, uAlbLift: { value: 0.012 },
        /* The drawn line — see mmDrawn in shaders/backdrop.js. Ink is how dark
           a relief hollow goes, lip how hard its crest catches the light.
           0.80 by eye on the Foyer's panelling against the samples: at 0.55 the
           mouldings read but the wall is still softer than theirs, and at 1.00
           the lines go to black wire. The measured ink DEPTH is 0.01-0.08
           against mainMenu.png's 0.248, so the metric wants more than the eye
           does -- and the eye is the one that gets to choose. */
        uInk: { value: 0.80 }, uLip: { value: 0.45 },
        /* The wallpaper. uDamHue tints the motif away from the wall it is on
           (the samples' walls are near-black plum with PURPLE scrollwork over
           them); uDamCell is the repeat, in metres; uDamKind picks the paper —
           0 a fleur on an ogee, 1 a quatrefoil on a trellis, 2 a sprig on
           stripes. applyPalette sets the kind off the region's label. */
        uDamask: { value: 0.55 }, uDamCell: { value: 0.92 },
        uDamKind: { value: 0 },
        /* THE SUBJECT — what this room IS, as opposed to what its wall is made
           of. See subjectH in shaders/backdrop.js and SUBJECT below. uFar is 1
           on the back wall and 0 on the two side walls. */
        uSubject: { value: 0 }, uFar: { value: 1 },
        /* the passages' one open door on this wall (round 22 graft) */
        uAjar: { value: new THREE.Vector2(-99, 0) },
        /* the Heart's wall under its portraits, carved as wainscot (graft) */
        uWains: { value: 0 },
        /* Where the doorway is (0 on the axis, >0 a pair that far out, <0
           none) and where the exterior's house and moon stand -- both chosen
           per room with its subject. See WALL_FRAG. */
        uDoorX: { value: 0 }, uHouse: { value: new THREE.Vector2(0, 0) },
        /* Where the subject stands on its wall and which kind of stair it is,
           and how big the exterior's house is (round 14). See WALL_FRAG. */
        uSubjX: { value: 0 }, uSubjMode: { value: 0 }, uSubjDir: { value: 1 },
        uHouseS: { value: 1 }, uQuiet: { value: 0 }, uBoardBand: { value: 0 },
        uSkyGlow: { value: 1.0 }, uOpenSky: { value: 0 },
        uSkyDeep: { value: new THREE.Color(0x141725) },
        uDamHue: { value: new THREE.Color(0.46, 0.24, 0.66) },
        uSize: { value: new THREE.Vector2(30, 14) },
        uDeep: { value: new THREE.Color(0x0d0b16) },
        uMid: { value: new THREE.Color(0x241a2c) },
        uHi: { value: new THREE.Color(0x3a2a3a) },
        uAccent: { value: new THREE.Color(0x3fb4d0) },
        uFog: { value: new THREE.Color(0x0a0813) },
        uOpenGlow: { value: new THREE.Color(0x2a7f99) },
        uAmbient: { value: new THREE.Color(0x0e0c16) },
        uCamera: { value: new THREE.Vector3(0, 2.2, 12) },
        uLights: { value: v4arr() }, uLightCol: { value: colArr() },
      },
      vertexShader: WALL_VERT, fragmentShader: WALL_FRAG,
      defines: { MM_ROOMS: 0 },
      /* LESS, not LEQUAL: this wall now draws AFTER the ceiling and the side
         walls, and must lose a depth tie to them exactly as it did when it
         drew first. See OPAQUE DRAW ORDER at the ceiling below. */
      depthWrite: true, depthFunc: THREE.LessDepth, fog: false,
    });
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.wallMat);
    this.wall.renderOrder = 0;
    this.group.add(this.wall);

    /* ----------------------------------------------------------- side walls */
    // Two converging walls. Without them a single flat backdrop reads as a
    // painted flat; with them the room has real perspective.
    this.sides = [];
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: freshLightSlots(THREE.UniformsUtils.clone(this.wallMat.uniforms)),
        vertexShader: WALL_VERT, fragmentShader: WALL_FRAG,
        defines: { MM_ROOMS: 0 },
        // LESS for the same reason as the far wall's: it now follows the ceiling
        depthWrite: true, depthFunc: THREE.LessDepth, fog: false,
      });
      mat.uniforms.uSeed.value = 4.3 + i * 2.1;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      /* After the ceiling and before the far wall: see OPAQUE DRAW ORDER at
         the ceiling below. */
      m.renderOrder = -1;
      this.sides.push(m);
      this.group.add(m);
    }

    /* --------------------------------------------------------------- floor */
    const surfaceUniforms = () => ({
      uTime: { value: 0 }, uSeed: { value: 3.1 }, uDread: { value: 0 },
      uFogNear: { value: 16 }, uFogFar: { value: 34 }, uGloss: { value: 0.5 },
      uPattern: { value: 0 }, uGain: { value: 3.4 }, uAlbLift: { value: 0.010 },
      uIsCeiling: { value: 0 },
      /* The drawn line, and how wet the floor is. uWet scales the vertical
         mirror smear a lamp leaves: it used to be uGloss*3.4 unconditionally,
         which is the loudest thing on a Foyer floor and nothing any sample
         does. */
      uInk: { value: 0.80 }, uLip: { value: 0.45 }, uWet: { value: 0.26 },
      /* A hall runner's HALF-WIDTH in metres, 0 for none. Authored per region
         (`runner`), and only the floor ever gets a non-zero one. */
      uRunner: { value: 0 }, uRunX: { value: 0 },
      uWater: { value: new THREE.Vector4(0, 0, 0, 0) },
      /* the swimming bath's end wall, for its reflection (round 23, FLOOR_FRAG
         variant 2): the wall's z, the glazed screen's foot, head, half-width */
      uMirror: { value: new THREE.Vector4(0, 0, 0, 0) },
      uSpan: { value: new THREE.Vector2(30, 34) },
      uDeep: { value: new THREE.Color(0x090711) },
      uMid: { value: new THREE.Color(0x1c1622) },
      uFog: { value: new THREE.Color(0x0a0813) },
      uAccent: { value: new THREE.Color(0x3fb4d0) },
      uAmbient: { value: new THREE.Color(0x0e0c16) },
      uCamera: { value: new THREE.Vector3(0, 2.2, 12) },
      uLights: { value: v4arr() }, uLightCol: { value: colArr() },
      uPool: { value: v4arr(MAX_POOLS) }, uPoolAxis: { value: v4arr(MAX_POOLS) },
      uPoolCol: { value: colArr(MAX_POOLS) },
      uActor: { value: zeroV4(MAX_ACTORS) },
      uActorK: { value: zeroV4(MAX_ACTORS) },
      uKeyF: { value: new THREE.Vector3(-4, 2, 3) },
      uKeyCol: { value: new THREE.Color(0, 0, 0) },
      /* empty (min > max) until setActors writes it */
      uActorBox: { value: new THREE.Vector4(1, 1, -1, -1) },
      /* THE FIGHT'S OWN POOL OF WARM LIGHT (round 21 graft): its centre and
         radii on the floor (floor-local metres), and the room's warm lamp's
         colour at the strength it lays there. Zero until setActors writes it. */
      uStage: { value: new THREE.Vector4(0, 0, 1, 1) },
      uStageCol: { value: new THREE.Color(0, 0, 0) },
      uNearDark: { value: 0 },
      /* THE PASSAGES' OPEN DOORS (round 22 graft): the wedge of lamplight
         each one's slit throws across the floor -- the slit's world x and z,
         and the unit direction into the room, and in uWedgeK how strong
         (0 = none). uCrisp: the passages' boards, crisp through their pools. */
      uWedge: { value: zeroV4(3) }, uWedgeK: { value: new THREE.Vector3(0, 0, 0) },
      uCrisp: { value: 0 },
      /* the moon on the Pumpkin Grounds' flags and in its pond (graft) */
      uMoonF: { value: new THREE.Color(0, 0, 0) },
      uMoonW: { value: new THREE.Vector4(0, 0, 0, 0) },
    });

    this.floorMat = new THREE.ShaderMaterial({
      uniforms: surfaceUniforms(),
      /* the room-kind floors are a variant of their own: _setSurfaceProgram */
      defines: { MM_FLOORX: 0 },
      vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG,
      depthWrite: true, fog: false,
    });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.renderOrder = 1;
    this.group.add(this.floor);

    /* ------------------------------------------------------------- ceiling */
    // Same shader as the floor with a beam/vault/glazing pattern. It closes the
    // room, which is what stops the top of the frame reading as an empty void.
    this.ceilMat = new THREE.ShaderMaterial({
      uniforms: surfaceUniforms(),
      defines: { MM_FLOORX: 0 },
      vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG,
      depthWrite: true, fog: false,
    });
    this.ceilMat.uniforms.uPattern.value = 3;
    this.ceilMat.uniforms.uGloss.value = 0;
    this.ceilMat.uniforms.uIsCeiling.value = 1;
    this.ceilMat.uniforms.uFogNear.value = 12;
    this.ceilMat.uniforms.uFogFar.value = 30;
    this.ceiling = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.ceilMat);
    this.ceiling.rotation.x = Math.PI / 2;
    /* OPAQUE DRAW ORDER: ceiling, side walls, far wall, floor -- the order
       in which they hide one another, so the depth test can throw away what
       is hidden BEFORE it is shaded.

       Every wall plane runs `room.wallPad` (5-7 m) up past the ceiling, and
       the walls used to be drawn FIRST. So every pixel of ceiling on screen
       had already been shaded once as the wall behind it -- WALL_FRAG, the
       most expensive program in the frame -- and was then painted over. With
       the ceiling in the depth buffer first, early-Z rejects those fragments
       before WALL_FRAG runs. Measured in one page on the Foyer's combat frame
       at tier medium: 15.05 -> 13.16 ms.

       THE PICTURE CANNOT CHANGE, and that has to include the seams. These are
       opaque depth-tested planes, so the nearest one wins in any order --
       except on a pixel where two of them quantise to EXACTLY the same depth,
       which happens every few dozen rows along a ceiling-to-wall or a
       wall-to-wall seam, and there LEQUAL hands the pixel to whichever drew
       LAST. The first cut of this reversed the old winners and changed a
       handful of seam pixels per room by up to 80 levels. So the two walls
       that now draw later test LESS: a tie leaves the ceiling (or the side
       wall) in the pixel, which is exactly who won it when the walls drew
       first. The floor still draws after every wall, as it always did. */
    this.ceiling.renderOrder = -2;
    this.group.add(this.ceiling);

    /* --------------------------------------------------------------- props */
    const propGeo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    propGeo.index = base.index;
    propGeo.setAttribute('position', base.getAttribute('position'));
    propGeo.setAttribute('uv', base.getAttribute('uv'));
    this._propOffset = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROPS * 3), 3);
    this._propScale = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROPS * 2), 2);
    this._propShape = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROPS), 1);
    this._propSeed = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROPS), 1);
    this._propTone = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROPS), 1);
    propGeo.setAttribute('aOffset', this._propOffset);
    propGeo.setAttribute('aScale', this._propScale);
    propGeo.setAttribute('aShape', this._propShape);
    propGeo.setAttribute('aSeed', this._propSeed);
    propGeo.setAttribute('aTone', this._propTone);
    propGeo.instanceCount = 0;
    propGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, -9), 80);
    this.propGeo = propGeo;

    this.propMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSway: { value: 1 }, uRimAmt: { value: 1 }, uDread: { value: 0 },
        uInk: { value: 0.80 },     // the outline; see mmDrawn in shaders/backdrop.js
        uGain: { value: 3.4 }, uGloss: { value: 0.55 },
        uFogNear: { value: 12 }, uFogFar: { value: 30 },
        uKeyDir: { value: new THREE.Vector2(-0.7, 0.7) },
        uAlbedo: { value: new THREE.Color(0x3a2c30) },
        uAlbedoHi: { value: new THREE.Color(0x5c4a48) },
        uFog: { value: new THREE.Color(0x0a0813) },
        uRim: { value: new THREE.Color(0xffb64a) },
        uAccent: { value: new THREE.Color(0x3fb4d0) },
        uAmbient: { value: new THREE.Color(0x14111f) },
        uCamera: { value: new THREE.Vector3(0, 2.2, 12) },
        uLights: { value: v4arr() }, uLightCol: { value: colArr() },
        uLightInt: { value: new Array(NLIGHT).fill(0) },
        uMatMix: { value: new THREE.Vector4(0.30, 0.10, 0.24, 0.05) },
        uMatFreq: { value: new THREE.Vector2(0.55, 1.30) },
        uAO: { value: 1.0 },
        uPropKnee: { value: 0.30 }, uPropMax: { value: 0.55 },
        /* The chroma ceiling, the twin of the luminance one above. The samples'
           own props measure 0.19-0.43 mean saturation; ours measured 0.75, and
           applyPropMaterial overrides this per material (PROP_MATERIAL.sat).

           0.14 is set BY EYE against the Ballroom's colonnade: at 0.36 the
           statues are magenta blobs, at 0.22 pinkish, at 0.14 pale stone in a
           warm room, at 0.08 grey and the room's warmth goes with them. The
           number has to be this low because most of a prop's final chroma is
           added AFTER this shader -- the grade's per-channel contrast power,
           the split tone, bloom and halation all put colour back, and the
           measured chain turns a linear cap of 0.04 into 0.22 on screen. */
        uPropSat: { value: 0.14 }, uPropSatMax: { value: 0.20 },
        /* WHICH WAY THE LENS FACES, as its right vector in XZ (MADDER, round
           11). A prop is a drawn flat and it is drawn FRONT-ON, so when a
           vantage turns the camera the flats turn with it -- a cabinet drawn
           square and then seen 25 degrees off its face is only a narrower
           cabinet, not a cabinet seen from the side. (1, 0) is the square rig
           every region was authored against, and there it is the old quad. */
        uYaw: { value: new THREE.Vector2(1, 0) },
      },
      /* the grounds' carved stone, and the gallery's bust: _setPropProgram */
      defines: { MM_STONES: 0, MM_BUST: 0, MM_WINGS: 0 },
      vertexShader: PROP_VERT, fragmentShader: PROP_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.props = new THREE.Mesh(propGeo, this.propMat);
    this.props.frustumCulled = false;
    this.props.renderOrder = 3;
    this.group.add(this.props);

    /* ----------------------------------------------------- contact shadows */
    const shGeo = new THREE.InstancedBufferGeometry();
    const shBase = new THREE.PlaneGeometry(1, 1);
    shGeo.index = shBase.index;
    shGeo.setAttribute('position', shBase.getAttribute('position'));
    shGeo.setAttribute('uv', shBase.getAttribute('uv'));
    this._shdOffset = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROPS * 3), 3);
    this._shdScale = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROPS * 2), 2);
    this._shdStr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROPS), 1);
    /* setActorShadows() is a per-frame call for any scene that moves an actor, and
       a STATIC_DRAW respecification there stalls the pipeline the same way the
       flame buffers did. Declare the intent up front. */
    for (const a of [this._shdOffset, this._shdScale, this._shdStr]) {
      a.setUsage(THREE.DynamicDrawUsage);
    }
    shGeo.setAttribute('aOffset', this._shdOffset);
    shGeo.setAttribute('aScale', this._shdScale);
    shGeo.setAttribute('aStrength', this._shdStr);
    shGeo.instanceCount = 0;
    shGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -9), 80);
    this.shadowGeo = shGeo;
    this.shadowMat = new THREE.ShaderMaterial({
      uniforms: { uFogNear: { value: 14 }, uFogFar: { value: 30 } },
      vertexShader: SHADOW_VERT, fragmentShader: SHADOW_FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.MultiplyBlending, fog: false,
    });
    this.shadows = new THREE.Mesh(shGeo, this.shadowMat);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 2;
    this.group.add(this.shadows);

    /* -------------------------------------------------------------- shafts */
    const shaftGeo = new THREE.InstancedBufferGeometry();
    const sBase = new THREE.PlaneGeometry(1, 1);
    shaftGeo.index = sBase.index;
    shaftGeo.setAttribute('position', sBase.getAttribute('position'));
    shaftGeo.setAttribute('uv', sBase.getAttribute('uv'));
    this._shOrigin = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHAFTS * 3), 3);
    this._shParam = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHAFTS * 3), 3);
    this._shSeed = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHAFTS), 1);
    this._shInt = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHAFTS), 1);
    shaftGeo.setAttribute('aOrigin', this._shOrigin);
    shaftGeo.setAttribute('aParam', this._shParam);
    shaftGeo.setAttribute('aSeed', this._shSeed);
    shaftGeo.setAttribute('aInt', this._shInt);
    shaftGeo.instanceCount = 0;
    shaftGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, -10), 80);
    this.shaftGeo = shaftGeo;

    this.shaftMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uDread: { value: 0 },
        uColor: { value: new THREE.Color(0xffd08a) },
      },
      vertexShader: SHAFT_VERT, fragmentShader: SHAFT_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, fog: false,
    });
    this.shafts = new THREE.Mesh(shaftGeo, this.shaftMat);
    this.shafts.frustumCulled = false;
    this.shafts.renderOrder = 4;
    this.group.add(this.shafts);

    /* -------------------------------------------------------------- flames */
    const flGeo = new THREE.InstancedBufferGeometry();
    const flBase = new THREE.PlaneGeometry(1, 1);
    flGeo.index = flBase.index;
    flGeo.setAttribute('position', flBase.getAttribute('position'));
    flGeo.setAttribute('uv', flBase.getAttribute('uv'));
    this._flPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLAMES * 3), 3);
    this._flCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLAMES * 3), 3);
    /* x halo size in metres, y intensity, z 1 for a real flame and 0 for a
       wisp or a cold spill. FLAME_FRAG draws the flame itself at a fixed NINE
       CENTIMETRES and uses x only for its halo, because the two are not the
       same size and were sharing one number — which is why every candle in the
       house arrived as a 73 cm white disc. */
    this._flParam = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLAMES * 3), 3);
    this._flSeed = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLAMES), 1);
    /* PERF: these are rewritten every frame by syncFlames(). three defaults
       BufferAttributes to STATIC_DRAW, which ANGLE backs with a D3D11 DEFAULT
       buffer — and bufferSubData on one of those is an UpdateSubresource that
       must wait for every queued draw still reading it. Four of them per frame
       measured as 8.5 ms of pure pipeline stall on Intel UHD (25.0 -> 16.5 ms
       median frame with syncFlames stubbed out) on 90 floats of actual data.
       DynamicDrawUsage lets the driver rename the buffer instead of syncing. */
    for (const a of [this._flPos, this._flCol, this._flParam, this._flSeed]) {
      a.setUsage(THREE.DynamicDrawUsage);
    }
    flGeo.setAttribute('aPos', this._flPos);
    flGeo.setAttribute('aCol', this._flCol);
    flGeo.setAttribute('aParam', this._flParam);
    flGeo.setAttribute('aSeed', this._flSeed);
    flGeo.instanceCount = 0;
    flGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, -8), 80);
    this.flameGeo = flGeo;
    this.flameMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDread: { value: 0 } },
      vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, fog: false,
    });
    this.flames = new THREE.Mesh(flGeo, this.flameMat);
    this.flames.frustumCulled = false;
    this.flames.renderOrder = 5;
    this.group.add(this.flames);

    /* --------------------------------------------------------- near frame
       PERF (2026-08-20): these four quads were 7.4 x 4.2 m planes sitting 2.2 m
       from the eye with `depthTest: false` and `frustumCulled = false`. Each one
       therefore rasterised the ENTIRE viewport and ran FRAME_FRAG — which opens
       with an mmFbm3 before it can reach its `discard` — on every pixel of it.
       Measured on Intel UHD at 1600x900 that was 4.2-4.7 ms per frame, the single
       most expensive item in the whole scene, and a screenshot bisection showed
       three of the four quads contributing ZERO visible pixels (the side drapes
       fall outside the horizontal frustum, the clutter band below it).

       Each mode only ever marks a narrow band of its own quad, so the geometry is
       now cropped to that band and the uv attribute is remapped to carry the
       original 0..1 range across it. FRAME_FRAG is untouched and every pixel it
       used to write it still writes — the crop only removes fragments where the
       mask was provably zero. Bounds below are the analytic maxima of each mask
       (mmFbm3 <= 0.9625, mmRidge <= 0.9375) plus margin. */
    this.frames = [];
    /* THE NEAR FRAME TRAVELS WITH THE EYE (MADDER, round 11). It was authored
       at a fixed spot in each room, which was the same thing as "just in
       front of the lens" while every camera stood on the centre line. A
       vantage moves the eye, so the frame rides in this group, which
       _setVantage places at the eye; on the square rig the group sits at the
       origin and every quad is exactly where it always was. */
    this.frameRig = new THREE.Group();
    this.frameRig.name = 'near-frame';
    this.group.add(this.frameRig);
    this._frameShow = [true, true, true, true];
    //          mode, uMin, uMax, vMin, vMax
    const FRAME_CROP = [
      [0, 0.00, 0.24, 0.00, 1.00],   // left drape:  mask needs p.x < 0.218
      [0, 0.00, 0.24, 0.00, 1.00],   // right drape: same, mirrored by scale.x
      [1, 0.00, 1.00, 0.59, 1.00],   // top lintel:  mask needs p.y > 0.607
      /* clutter band: mask needs p.y < 0.206 -- and it runs on DOWN, 2.5 m
         below the quad's old foot (round 22, the Heart's floor seam: "a hard,
         straight lighting seam cuts across the whole floor at y~620"). The
         band is solid below its ragged top, so its foot was never meant to
         be seen; but a room framed from far back -- the Heart's lens stands
         13 m out, where the band is 5.8 m from the eye instead of 2.2 --
         brings that foot up into the picture, and the floor under it was
         darkened by the band above the line and not below it. Measured with
         frames=0: the step goes. Extended, the foot is off the bottom of the
         frame in every rig; where it already was, not a pixel moves. */
      [2, 0.00, 1.00, -0.60, 0.23],
    ];
    const FW = 7.4, FH = 4.2;
    for (let i = 0; i < 4; i++) {
      const [mode, u0, u1, v0, v1] = FRAME_CROP[i];
      const g = new THREE.PlaneGeometry(FW * (u1 - u0), FH * (v1 - v0));
      // keep the crop where the full quad had it
      g.translate(FW * ((u0 + u1) * 0.5 - 0.5), FH * ((v0 + v1) * 0.5 - 0.5), 0);
      const uvAttr = g.attributes.uv;
      for (let k = 0; k < uvAttr.count; k++) {
        uvAttr.setXY(k, u0 + (u1 - u0) * uvAttr.getX(k), v0 + (v1 - v0) * uvAttr.getY(k));
      }
      uvAttr.needsUpdate = true;

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uSeed: { value: i * 3.7 + 1 },
          uMode: { value: mode },
          uAmount: { value: 0.9 }, uDread: { value: 0 },
          uColor: { value: new THREE.Color(0x06050c) },
          uRim: { value: new THREE.Color(0xffb64a) },
        },
        /* modes 0-2 only: the portals are a program of their own */
        defines: { MM_PORTAL: 0 },
        vertexShader: FRAME_VERT, fragmentShader: FRAME_FRAG,
        transparent: true, depthWrite: false, depthTest: false,
        side: THREE.DoubleSide, fog: false,
      });
      const m = new THREE.Mesh(g, mat);
      m.position.set(0, 2.08, 7.2 + i * 0.01);
      if (i === 1) m.scale.x = -1;                // mirrored right-hand drape
      m.renderOrder = 8;
      /* Now that each quad is only as big as its band, frustum culling is worth
         having: in most camera rigs the two drapes and the clutter band fall
         outside the frustum entirely and cost nothing at all. */
      m.frustumCulled = true;
      this.frames.push(m);
      this.frameRig.add(m);
    }
    /* THE DOORWAY, THE GALLERY RAIL AND THE CHURCHYARD GATE (MADDER, round
       11): FRAME_FRAG modes 3, 4 and 5. Three vantages put a piece of the
       house between you and the room -- the door you are standing back in,
       the rail you lean on, the gate you have just come through -- and each is
       drawn on one quad the size of the view, a metre in front of the lens.
       They ride in their own group, which follows the LIVE camera every frame
       (syncCamera): the stage breathes the eye by up to a quarter of a metre,
       and a quad a metre from the lens that did not follow it slid a quarter
       of the frame. Hidden everywhere else, which costs nothing. */
    this.portalRig = new THREE.Group();
    this.portalRig.name = 'portal';
    this.group.add(this.portalRig);
    /* ...and mode 6, the STEAM of a steam room, on the same lens (round 14) */
    this.portals = [3, 4, 5, 6].map((mode, k) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uSeed: { value: 5.1 + k * 2.3 },
          uMode: { value: mode }, uAmount: { value: 1.0 }, uDread: { value: 0 },
          uAspect: { value: 16 / 9 }, uDoorKind: { value: 0 },
          uColor: { value: new THREE.Color(0x06050c) },
          uRim: { value: new THREE.Color(0xffb64a) },
        },
        defines: { MM_PORTAL: 1 },
        vertexShader: FRAME_VERT, fragmentShader: FRAME_FRAG,
        transparent: true, depthWrite: false, depthTest: false,
        side: THREE.DoubleSide, fog: false,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      m.renderOrder = 8;
      m.visible = false;
      m.frustumCulled = false;
      this.portalRig.add(m);
      return m;
    });

    this._tmpV2 = new THREE.Vector2();
    this._applyRoom(this.room);
  }

  /* -------------------------------------------------------------- geometry */

  /** Resize the shell for a region's room proportions. */
  _applyRoom(room) {
    this.room = room;
    const open = room.h <= 0.01;
    /* An open-air region's "wall" is its SKY, and at 17 m it stopped 78 px from
       the top of the Graveyard's frame: above that line the renderer's clear
       colour showed through as a violet band brighter than the sky beneath it.
       30 m clears the top of every authored camera. The plane costs the same
       pixels either way, and skyColor no longer scales its gradient or hangs
       its moon off uSize.y, so a taller plane cannot change the look. */
    const wallH = open ? 30 : room.h + room.wallPad;
    /* ...and WIDE enough, for the same reason. The Hedge Maze authors a 38 m
       yard and its camera sees 57 m of it at the far wall, so the left third of
       every capture of it was the clear colour: a flat dark plane with a
       straight diagonal edge, which is the most CG thing an open-air region
       could possibly show. 76 m covers the widest authored camera.

       `room.w` itself is NOT changed — prop placement reads it, and widening
       the yard would scatter the props into the sky. Only the SHELL grows. */
    /* (round 22 graft: a room may ask for more -- the maze's walk, seen
       along its hedge from one side, saw past the end of 76 m) */
    const wallW = open ? Math.max(room.w, room.openW ?? 76) : room.w + 1.2;
    const groundW = open ? Math.max(room.w, room.openW ?? 76) : room.w;

    this.wall.geometry.dispose();
    this.wall.geometry = new THREE.PlaneGeometry(wallW, wallH);
    this.wall.position.set(0, wallH / 2, -room.d);
    this.wallMat.uniforms.uSize.value.set(wallW, wallH);

    const sideLen = room.d + FLOOR_FRONT;
    const sideCz = (FLOOR_FRONT - room.d) / 2;
    for (let i = 0; i < 2; i++) {
      const m = this.sides[i];
      m.geometry.dispose();
      m.geometry = new THREE.PlaneGeometry(sideLen, wallH);
      const s = i === 0 ? -1 : 1;
      m.position.set(s * room.w / 2, wallH / 2, sideCz);
      m.rotation.set(0, s * (-Math.PI / 2) + s * room.side, 0);
      m.material.uniforms.uSize.value.set(sideLen, wallH);
    }

    const spanZ = room.d + FLOOR_FRONT;
    const cz = (FLOOR_FRONT - room.d) / 2;
    this.floor.geometry.dispose();
    this.floor.geometry = new THREE.PlaneGeometry(groundW, spanZ);
    this.floor.position.set(0, 0, cz);
    this.floorMat.uniforms.uSpan.value.set(groundW, spanZ);

    this.ceiling.visible = !open;
    if (!open) {
      this.ceiling.geometry.dispose();
      /* A GLASSHOUSE ROOF IS PITCHED (round 18 item 1, FOLIUM's graft). The
         bars, the purlins and the ridge were all drawn on a FLAT plane
         overhead, where a ridge is a painted stripe and every bar runs
         parallel to the picture's top edge. So the glass roofs (patterns 9
         and 12) are built as what they are: two slopes rising from the eaves
         on the side walls to a ridge down the middle of the house, so the
         purlins and the ridge run away to the vanishing point. The rise stays
         inside the walls' own pad above the eaves, so the gable ends are
         closed by the end walls' glazing and never by sky. The plane's uv is
         still its plan position, so every bar lands where it did in plan. */
      const cp = room.ceilPattern ?? 3;
      /* (round 23: and an ATTIC's roof (15) is pitched timber, and steep) */
      const rise = (cp === 9 || cp === 12)
        ? Math.max(0, Math.min(room.w * 0.16, (room.wallPad ?? 5) - 0.4))
        : cp === 15 ? Math.max(0, Math.min(room.w * 0.42, (room.wallPad ?? 5) - 0.4)) : 0;
      const cg = new THREE.PlaneGeometry(room.w, spanZ, rise > 0 ? 2 : 1, 1);
      if (rise > 0) {
        const pos = cg.attributes.position;
        for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getX(i)) < 1e-4) pos.setZ(i, -rise);
        pos.needsUpdate = true;
        cg.computeVertexNormals();
      }
      this.ceiling.geometry = cg;
      this.ceiling.position.set(0, room.h, cz);
      this.ceilMat.uniforms.uSpan.value.set(room.w, spanZ);
      this.ceilMat.uniforms.uPattern.value = room.ceilPattern ?? 3;
      /* a vinery's roof (12) is drawn by the room-kind variant */
      this._setSurfaceProgram(this.ceilMat, (room.ceilPattern ?? 3) === 15 ? 2 : (room.ceilPattern ?? 3) > 11.5);
    }
    this._floorCz = cz;
    this._wallZ = -room.d;
    this._wallW = wallW;
    this._sideX = room.w / 2;
    this._sideLen = sideLen;
    this._sideCz = sideCz;
  }

  /* ------------------------------------------------------------- structure */

  /**
   * Prop placement. Each layout is a genuinely different room arrangement, not a
   * reseed of the same one — that is the whole point of the round-2 rework.
   * Returns an array of {x, y, z, w, h, shape, seed, tone}.
   *
   * `fixtures` is what `_fixtures` already stood at this room's lamps; only
   * the hand-placed `props.near` list reads it (see there).
   */
  _layoutProps(pal, room, rand, fixtures = []) {
    const P = pal.props || {};
    const shapes = P.shapes || [0, 1, 5, 6];
    const n = Math.min(P.count ?? 22, MAX_PROPS);
    const H = P.height ?? 2.2;
    const ceil = room.h > 0 ? room.h : 7.0;
    const out = [];
    /* SOME THINGS A ROOM HAS EXACTLY ONE OF, and pick() is UNIFORM over the
       region's shape list -- so a grand piano in the list meant three or four
       grand pianos in the ballroom, which is the same content failure as
       thirty statues arrived at by another route. A shape named in
       props.solo is dealt once and then withdrawn from the pack. */
    const solo = new Set(P.solo || []);
    /* ...and it is never DEALT at all now, in any layout. Only `colonnade`
       used to place it; every other layout dealt it like a chair, so a
       Ballroom that drew `perimeter` put its one piano against the far wall
       thirty metres from the lens, where it is not in the room as far as the
       picture is concerned (BRIEF-r11). It is placed after the layout, below,
       whichever layout this room drew. */
    const dealt = new Set(solo);
    const pick = () => {
      for (let tries = 0; tries < 8; tries++) {
        const s = shapes[(rand() * shapes.length) | 0];
        if (!solo.has(s) || !dealt.has(s)) { if (solo.has(s)) dealt.add(s); return s; }
      }
      return shapes.find((s) => !solo.has(s)) ?? shapes[0];
    };
    /* A CHAIR IS 0.9 m IN EVERY ROOM IN THE HOUSE. The size now comes from
       SHAPE_M, the object's own height in metres, and the two things that used
       to set it outright are demoted to variation:
       - the region's authored `props.height` becomes a nudge inside +-6%, so a
         room can still feel slightly grander without a 2.5 m armchair in it;
       - the LAYOUT's per-instance `scale` is compressed toward 1. It ran
         0.25-1.35 and was mostly being used to make far props smaller and near
         props bigger, which is perspective's job and not the object's -- a
         colonnade whose columns were authored at 1.24 down to 1.08 was a file
         of columns of five different heights standing on one floor. */
    const nudge = Math.min(Math.max(H / 2.4, 0.94), 1.06);
    const sized = (shape, scale) => {
      const sc = 1 + (Math.min(Math.max(scale ?? 1, 0.55), 1.30) - 1) * 0.26;
      /* Skewed toward the small end and with a long tail up, which is how a
         planting actually reads: many small pots, a few big specimens. A
         symmetric spread gives every plant the average size, which is the same
         even-rhythm failure in another guise. */
      const v = SHAPE_VAR[shape] ?? 0.06;
      const r = rand();
      const spread = 1 + v * (r * r * 2.6 - 0.9);
      const h = (SHAPE_M[shape] ?? 1.2) * nudge * sc * spread;
      const jit = 0.78 + rand() * 0.24;
      return { h, w: h * (SHAPE_W[shape] ?? 1) * (FIXW[shape] ? 1 : jit) };
    };
    /* Keep props inside the lens. A prop at x = +-halfW in a 34 m ballroom is
       simply off-screen, which is how round 1 ended up with a props crop that
       contained almost no prop: the layout spread across the ROOM, not across
       the FRAME. Clamp to the visible half-width at that depth.
       `aspect` is the live viewport aspect, floored at 16:9. Round 2 hard-coded
       16/9 here, so the clamp was a lie on any other window shape — and it is
       floored rather than used raw because a WIDER window must not be allowed to
       push a prop outward: the placement is computed once at setMood() and a
       later resize never re-runs it. */
    const cam = pal.cam || {};
    const camZ = cam.z ?? 9.6, camY = cam.y ?? 2.3, look = cam.look ?? 2.4;
    const aspect = Math.min(pal.aspect || (16 / 9), 16 / 9);
    const tanH = Math.tan(((cam.fov ?? 42) * Math.PI) / 360) * aspect;
    /* Half the visible width at a point, in metres.
       The camera is PITCHED (it looks at `cam.look`, not at its own eye height),
       so the perspective divide uses view-space depth, not the z-distance. Round
       2 used `camZ - z`, which over-estimates the frame for anything high up and
       under-estimates it for anything low — and a prop clamped against a frame
       width that is not the frame's is how a curtain ends up cut by the viewport
       edge. No roll and no yaw, so the horizontal axis is still world X. */
    const fy = look - camY, fl = Math.hypot(fy, camZ) || 1;
    const tanV = Math.tan(((cam.fov ?? 42) * Math.PI) / 360);
    const depth = (y, z) => Math.max(((y - camY) * fy + (camZ - z) * camZ) / fl, 0.6);
    const frameX = (z, y = camY) => Math.max(depth(y, z) * tanH * 0.94, 1.2);
    // signed height above the frame centre line, same view basis (no roll)
    const vert = (y, z) => ((y - camY) * camZ - (camZ - z) * fy) / fl;
    let inFrameY = (y, z) => Math.abs(vert(y, z)) < depth(y, z) * tanV * 0.93;
    /* THE FRAME AS AN INTERVAL, [lo, hi] in world x at a height and depth
       (MADDER, round 11). On the square rig it is +-frameX, exactly as before.
       A vantage that stands off the centre line or turns has a frame whose
       middle is not x = 0 at any depth, so the interval comes from the lens's
       own basis: solve u = +-k*d along the line of constant y and z, where u
       is the lens's right coordinate and d its depth, both linear in x. */
    let spanAt = (z, y) => { const f = frameX(z, y); return [-f, f]; };
    const offAxis = !!(cam.x || cam.lookX || cam.lookZ);
    if (offAxis) {
      const L = lensOf(cam, aspect);
      const k = L.tanH * 0.94;
      spanAt = (z, y = L.ey) => {
        const a = Math.max((y - L.ey) * L.fy + (z - L.ez) * L.fz, 0.6);
        const b = (z - L.ez) * L.rz;
        const xl = L.ex + (-k * a - b) / (L.rx + k * L.fx);
        const xr = L.ex + (k * a - b) / (L.rx - k * L.fx);
        let lo = Math.min(xl, xr), hi = Math.max(xl, xr);
        if (hi - lo < 2.4) { const c = (lo + hi) / 2; lo = c - 1.2; hi = c + 1.2; }
        return [lo, hi];
      };
      inFrameY = (y, z, x = L.ex) => {
        const dx = x - L.ex, dy = y - L.ey, dz = z - L.ez;
        const d = Math.max(dx * L.fx + dy * L.fy + dz * L.fz, 0.6);
        return Math.abs(dx * L.ux + dy * L.uy + dz * L.uz) < d * L.tanV * 0.93;
      };
    }
    const halfW = room.w / 2;
    /* WHERE THE FIGHT STANDS, on the screen: the Kid's column down the left,
       whose boots are at 0.575 of the height, and the creature row across the
       middle, whose feet are at ~0.50. A floor piece whose foot projects below
       STAGE_FEET in either column is standing in front of them. */
    const LS = lensOf(cam, aspect);
    const onStage = (px, pz, pw) => {
      const dx = -LS.ex, dy = 0.02 - LS.ey, dz = pz - LS.ez;
      let hit = false;
      for (const ox of [px - pw * 0.5, px, px + pw * 0.5]) {
        const qx = dx + ox;
        const d = qx * LS.fx + dy * LS.fy + dz * LS.fz;
        if (d < 0.3) return true;                   // at or behind the lens: in the way
        const sx = 0.5 + 0.5 * (qx * LS.rx + dz * LS.rz) / (d * LS.tanH);
        const sy = 0.5 - 0.5 * (qx * LS.ux + dy * LS.uy + dz * LS.uz) / (d * LS.tanV);
        if (sx > -0.02 && sx < 0.29 && sy > 0.50) hit = true;
        if (sx >= 0.29 && sx < 0.84 && sy > 0.525) hit = true;
      }
      return hit;
    };
    /* THE FURNISHED DEPTH. A layout that spreads its props evenly to the back
       wall spends half of them past the props' own fog (12-30 m from the
       lens) in a room as deep as the Greenhouse: its Palm House, laid out as
       an `aisle`, placed all fifty-one of them in frame and showed six. A
       region may say how deep its furnishing legibly goes; the layouts that
       spread through the depth -- wings, aisle, rows, clutter, nook, hang --
       stop there. perimeter keeps the back wall: lining it is what it is. */
    const RD = Math.min(room.d, P.depth ?? room.d);
    const openSky = room.h <= 0.01;
    const floorFallback = shapes.find((s) => HANGING[s] !== 1) ?? 5;

    /* A STAIR HUNG ON A SIDE WALL TAKES THAT WALL (MADDER, round 11): +1 the
       right wall, -1 the left, 0 when the room's one-off is on the back wall. */
    const stairWall = pal.subjWall === 'right' ? 1 : pal.subjWall === 'left' ? -1 : 0;
    const push = (shape, x, z, scale, tone, atY, how) => {
      /* Nothing stands in the pool (round 14): a piece dealt into the water
         stands on the far side of its coping instead. */
      if (pal.pool && HANGING[shape] !== 1) {
        const pl = pal.pool;
        if (Math.abs(x) < pl.hw + 0.8 && z < pl.z0 + 0.8 && z > pl.z1 - 0.8) {
          x = (Math.sign(x) || 1) * (pl.hw + 1.0 + Math.abs(x) * 0.25);
        }
      }
      /* Nothing stands in front of a flight, and a stair runs the depth of the
         wall it climbs. So a piece the layout put against that wall goes to
         the BACK wall instead, mostly on the side away from the stair. */
      if (stairWall && Math.sign(x) === stairWall && Math.abs(x) > halfW * 0.40) {
        x = (rand() < 0.7 ? -stairWall : stairWall) * halfW * (0.14 + 0.62 * rand());
        z = -room.d + 0.9 + rand() * 1.6;
      }
      /* Nothing hangs from an open sky. The Graveyard, the Hedge Maze and the
         Pumpkin Grounds have no ceiling at all; a drape or a chandelier placed
         there is a rectangle floating against the stars. */
      let s = (HANGING[shape] === 1 && openSky) ? floorFallback : shape;
      const hang = HANGING[s] === 1;
      let { h, w } = sized(s, scale);
      /* A curtain is as long as the wall it is on. Sized by the region's generic
         prop height a Nursery drape came out 1.3 m in a 4.8 m room — a small
         pale rectangle stuck to the wall, which is a large part of why they read
         as debris rather than as soft furnishing. */
      if (s === 7) {
        h = Math.min(Math.max(h, ceil * 0.58), ceil * 0.86);
        w = h * (SHAPE_W[7] ?? 0.85) * (0.62 + rand() * 0.30);
      }
      /* A COLUMN REACHES THE CEILING, because that is what a column is FOR.
         SHAPE_M pins it at 3.32 m, which is right in a 4.9 m crypt and plainly
         wrong in a 10.5 m ballroom: the capture showed eight stumps standing
         in the middle of the floor, holding nothing up, topping out at 55% of
         the frame -- and BRIEF-r9's rubric question 3 says a room where one
         object is at the wrong size makes every other object in it suspect.
         The order's PROPORTION is preserved for free, because the width is a
         ratio of the height and the table asks for diameter = h/8 to h/10. */
      if (s === 6) {
        h = Math.min(Math.max(h, ceil * 0.60), ceil * 0.86);
        w = h * (SHAPE_W[6] ?? 0.47) * (0.90 + rand() * 0.14);
      }
      /* A LANTERN HANGS AT ITS OWN HEIGHT (round 23 graft, ULTRAMARINE's):
         the lampworks' lamps are hung for the work under them and for show,
         so each one's chain leaves it somewhere between head height and
         two-thirds of the way up the room -- a dozen at a dozen heights. The
         quad is the chain and the lantern; its width is the lantern's. A
         lantern hung by hand (props.near) names its own height. */
      if (s === 33) {
        const yb0 = 2.05 + rand() * Math.max(ceil * 0.60 - 2.05, 0.6);
        h = Math.max(ceil - (atY ?? yb0), 0.9);
        w = 0.78;
      }
      let y = atY ?? 0.02;
      /* AT THE FRAME'S EDGE (round 23 graft, ULTRAMARINE's): a wing's
         signature object set by hand where the fight leaves room for it --
         its near end at screen fraction `edge` (> 0.5: its LEFT end, on the
         right of the frame; < 0.5: its RIGHT end, on the left), at its own
         depth. Solved from the lens itself, so it is there from any vantage. */
      if (how && typeof how === 'object' && how.edge !== undefined) {
        const e = how.edge, k = (2 * e - 1) * LS.tanH;
        const dy = y - LS.ey, dz = z - LS.ez;
        const qx = (k * (dy * LS.fy + dz * LS.fz) - dz * LS.rz) / (LS.rx - k * LS.fx);
        x = LS.ex + qx + (e > 0.5 ? w * 0.5 : -w * 0.5);
        x = Math.max(-halfW * 0.96 + w * 0.5, Math.min(halfW * 0.96 - w * 0.5, x));
        how = 'free';
      }
      /* Half the frame at this prop's own depth, measured at BOTH ends of it —
         a tall prop's head and its foot are at different view depths under a
         pitched camera, and the narrower of the two is the one that cuts. */
      /* ...as an INTERVAL since round 14 (MADDER): [lo, hi] for the prop's
         centre, inside the room's walls and both ends of the frame, less half
         the prop. On the square rig lo = -hi and this is the old +-lim. */
      const bandAt = (zz) => {
        const [a0, a1] = spanAt(zz, y), [b0, b1] = spanAt(zz, y + h);
        let lo = Math.max(-halfW * 0.98, a0, b0) + w * 0.5;
        let hi = Math.min(halfW * 0.98, a1, b1) - w * 0.5;
        if (hi - lo < 0.8) { const c = (lo + hi) / 2; lo = c - 0.4; hi = c + 0.4; }
        return [lo, hi];
      };
      if (hang) {
        /* A DRAPE HANGS ON A WALL. Meeting the ceiling plane exactly is not
           enough: a curtain panel in the middle of an open floor reads as a
           floating slab, and a reviewer counted two of them in the Nursery. Rail
           shapes go to the back wall or a side wall; a chandelier may hang
           anywhere, because it now draws its own ceiling rose. Either way the
           top overlaps the ceiling by 4 cm so perspective can never open a
           sliver of gap. */
        y = Math.max(ceil - h + 0.04, 0.35);
        if (s === 7) {
          /* ...on the NEAREST wall. Sending every curtain to the back wall
             anchored them and also deleted the near-frame verticals that told
             four of these rooms apart — structural cross-correlation went 0.30
             to 0.37 the moment they all moved to the same place. A side wall is
             still a wall, and it keeps the silhouette in the mid-frame.
             `limAt` and not a separate calculation, so the general clamp below
             cannot then pull the curtain back off its wall and into mid-air —
             which is exactly what three of them did. */
          const [slo, shi] = bandAt(z);
          const side = x >= 0 ? shi : -slo;
          if (Math.abs(x) > room.w * 0.30 && side > room.w * 0.34) {
            x = x >= 0 ? shi : slo;
          } else {
            z = -room.d + 0.35 + rand() * 0.8;
          }
        }
        /* THE ANCHOR HAS TO BE IN SHOT. A chandelier hanging 3.7 m from a
           ballroom camera has its ceiling rose above the top of the frame, and
           an anchor you cannot see is not an anchor — it reads exactly like the
           floating panels this round is fixing. Walk it back until the fixing
           is inside the frame. */
        let guard = 0;
        /* (round 23: a lantern on its chain needs no rose in shot -- the
           chain running up out of the picture is how a hung lamp reads, and
           walked back to where the roof is in frame every one of them hung
           against the end wall) */
        while (s !== 33 && guard++ < 30 && !inFrameY(y + h, z, x) && z > -room.d + 0.5) {
          z = Math.max(z - 0.55, -room.d + 0.4);
        }
      }
      /* Clamp on the prop's OWN EXTENT, not on its centre. Round 2 clamped the
         centre, so anything wider than nothing could still hang half of itself
         past the edge of frame — which is exactly how the Nursery shipped a
         curtain cut in two by the viewport edge. */
      /* A PIECE STAGED AGAINST A WALL STAYS AGAINST IT (MADDER, round 11):
         it walks BACK along its wall until the wall is in shot at that depth,
         and stands at the frame's edge -- pulled in to a random 62-96% it
         stood in the middle of the floor, which is the knot of free-standing
         cases the first side vantage showed. Only pieces a vantage restaged
         (`how` 'wall'), so no room seen square moves. */
      if (how === 'wall' && !hang) {
        let [wlo, whi] = bandAt(z);
        let g2 = 0;
        while (g2++ < 40 && (x > whi || x < wlo) && z > -room.d + 1.4) {
          z = Math.max(z - 0.6, -room.d + 1.2);
          [wlo, whi] = bandAt(z);
        }
        if (x > whi) x = whi; else if (x < wlo) x = wlo;
      }
      const [lo, hi] = bandAt(z);
      if ((x > hi || x < lo) && how !== 'free') {
        if (how === 'file' && offAxis) {
          /* A COLONNADE'S FILE STAYS A FILE. From a vantage off the centre
             line the near file broke up when every column was pulled in to a
             random fraction of the frame; one the lens cannot hold stands at
             its edge, in line with the next. */
          x = x > hi ? hi : lo;
        } else {
          const c = (lo + hi) / 2;
          x = c + (x > hi ? hi - c : lo - c) * (0.62 + 0.34 * rand());
        }
      }
      /* THE STAGE IS KEPT CLEAR (round 21). Now the rig is pitched to put the
         floor under the fight (stageRig in fx/atmosphere.js), the band of
         floor the Kid, the Companion and the creatures stand on is IN SHOT --
         and the wings layout was dealing hall benches and column plinths into
         it, so the Kid stood on a bench. A floor piece whose foot would land
         in front of the combatants' own feet walks back along its line until
         it stands behind them. */
      /* (round 23 graft: a signature object placed by hand -- `free` --
         stands where it was put, beside the creature row) */
      if (!hang && !pal.noStage && how !== 'free') {
        let g3 = 0;
        while (g3++ < 40 && onStage(x, z, w) && z > -room.d + 1.2) z -= 0.5;
      }
      /* (round 23 graft, the Bathhouse's fight -- judges 1 and 3: "move the
         dark green tub and the palm out from behind the Kid at left") a
         room that asks for it keeps the Kid's column clear: a floor piece
         whose body would stand in it, behind the Kid, is not set. */
      if (P.kidClear && !hang && how !== 'free') {
        const dx = x - LS.ex, dy = Math.min(y + h * 0.5, 1.4) - LS.ey, dz = z - LS.ez;
        const d = dx * LS.fx + dy * LS.fy + dz * LS.fz;
        if (d > 0.3) {
          const sx = 0.5 + 0.5 * (dx * LS.rx + dz * LS.rz) / (d * LS.tanH);
          const hw = 0.5 * (w * 0.5 * LS.rx) / (d * LS.tanH);
          if (sx - hw < 0.235 && sx + hw > -0.02) { rand(); return; }
        }
      }
      out.push({ x, z, w, h, shape: s, seed: rand() * 10, tone, y, hang });
    };
    /** Architecture: sized directly, allowed to run off the frame edges.
     *  Does not count against the region's authored prop budget. */
    let archN = 0;
    const pushArch = (shape, x, z, w, h, tone) => {
      archN++;
      out.push({ x, z, w, h, shape, seed: rand() * 10, tone, y: 0.02,
                 hang: false, arch: true });
    };
    const layout = P.layout || 'wings';
    /* A ROOM'S CENTREPIECE GOES IN FIRST (round 14): the Greenhouse fills its
       whole prop budget with planting and kerbs, and the conservatory's
       fountain, dealt last with the near set, was sliced off at MAX_PROPS. */
    for (const it of (P.near || [])) {
      if (it.centre) push(it.shape, it.x ?? 0, it.z, it.scale ?? 1.0, it.tone ?? 0.9, it.y,
                          it.edge !== undefined ? { edge: it.edge } : (it.free ? 'free' : undefined));
    }

    if (layout === 'colonnade') {
      // Two receding files of heavy verticals. Reads as depth, not as clutter.
      /* OF WHAT, and HOW FAR APART, are the room's to say. `file` is the shape
         the files are made of -- shapes[0] unless a region names one, because
         the Foyer's shapes[0] is its longcase clock and two files of clocks
         down a hall is not a colonnade. `fileX` is where they stand across the
         room, which _vary() moves per room: a colonnade close in, or out by
         the walls, is a different room from the same one at 0.58. */
      const rows = Math.max(3, Math.round(n / 4));
      const x0 = halfW * (P.fileX ?? 0.58);
      const file = P.file ?? shapes[0];
      /* WHERE THE FIRST PAIR STANDS (round 14). A room may start its files a
         bay or two further in (`fileZ0`, metres, default -1.6): the Ballroom's
         musicians' gallery was cropped to its middle third by the two nearest
         columns, and both round-11 judges asked for them pulled back a bay so
         the gallery is the feature. The far pair stands where it always did. */
      const z0 = P.fileZ0 ?? -1.6, zFar = -room.d + 1.8;
      for (let r = 0; r < rows && out.length < n; r++) {
        const t = r / Math.max(rows - 1, 1);
        const z = z0 + t * (zFar - z0);
        push(file, -x0 * (1 - t * 0.14), z, 1.24 - t * 0.16, 0.30 + t * 0.55, undefined, 'file');
        if (out.length < n) push(file, x0 * (1 - t * 0.14), z + (rand() - 0.5) * 0.5, 1.24 - t * 0.16, 0.30 + t * 0.55, undefined, 'file');
      }
      /* ...AND THE FURNITURE BETWEEN THE COLUMNS, with two corrections.
         This dealt from the whole pack INCLUDING shapes[0], which is the shape
         the colonnade is already made of, so a share of the remainder came back
         as more columns. And it spread them uniformly to the back wall, where a
         0.95 m gilt chair 22 m down a 34 m room under a 47 degree lens is
         fifteen pixels -- the Ballroom's whole contents were a few dark specks
         along the far wall while the colonnade carried the frame.
         So: the rest of the pack, biased hard toward the front, and pushed OUT
         toward the side walls, which is not a composition trick -- it is where
         a ballroom's seating goes. The middle of the floor is what the room is
         FOR, and it stays clear. */
      const rest0 = shapes.length > 2 ? shapes.filter((s) => s !== file) : shapes;
      const rest = rest0.filter((s) => !solo.has(s));
      if (!rest.length) rest.push(file);
      while (out.length < n) {
        const s = rest[(rand() * rest.length) | 0];
        const t2 = rand() * rand();
        push(s, (rand() < 0.5 ? -1 : 1) * halfW * (0.32 + 0.60 * rand()),
             -2.2 - t2 * (room.d - 4.0), 1.0, 0.42 + t2 * 0.48);
      }

    } else if (layout === 'rows') {
      // A field: staggered ranks across the FULL width, low, marching back.
      const ranks = 5;
      const per = Math.ceil(n / ranks);
      /* ...across the width the LENS sees at that rank, out of doors (MADDER,
         round 11). A churchyard is 52 m wide and the lens holds a third of it
         at the front rank, so a rank spread over the whole yard put two stones
         in shot and clamped the rest into a huddle at each edge of the frame
         -- the "headstones as bollards" yard, empty in the middle. Indoors a
         rank still reaches its walls. And the stones keep off the gravel walk
         to the gate, where there is one (round 14). */
      const openYard = room.h <= 0.01;
      const walkHW = (openYard && pal.floorPattern === 11 && (pal.runner ?? 0) > 0) ? pal.runner + 0.55 : 0;
      const walkX = pal.runX ?? 0;
      for (let r = 0; r < ranks && out.length < n; r++) {
        const t = r / (ranks - 1);
        const z = -2.2 - t * (RD - 3.0);
        let x0 = -halfW * 0.94, x1 = halfW * 0.94;
        if (openYard) {
          const [f0, f1] = spanAt(z, 0.4);
          x0 = Math.max(x0, f0 * 1.04); x1 = Math.min(x1, f1 * 1.04);
        }
        for (let i = 0; i < per && out.length < n; i++) {
          const jitter = (r % 2) * 0.5;
          let x = openYard
            ? x0 + ((i + jitter) / per) * (x1 - x0) + (rand() - 0.5) * 0.8
            : ((i + jitter) / per - 0.5) * 2 * halfW * 0.94 + (rand() - 0.5) * 0.8;
          if (walkHW && Math.abs(x - walkX) < walkHW) {
            x = walkX + (Math.sign(x - walkX) || 1) * (walkHW + Math.abs(x - walkX) * 0.6);
          }
          push(pick(), x, z + (rand() - 0.5) * 1.1, 1.06 - t * 0.22, 0.16 + t * 0.7);
        }
      }

    } else if (layout === 'aisle') {
      // Massive props hugging the frame edges up close, thinning fast with depth.
      /* ...or, where a room says so (`aisle: [inner, outer]` as fractions of
         the half-width), two files lining a walk down its middle: a palm house
         is walked through between its palms, not past them at the walls. */
      const [a0, a1] = P.aisle || [0.52, 0.96];
      for (let i = 0; i < n; i++) {
        const t = Math.pow(i / Math.max(n - 1, 1), 0.72);
        const s = Math.sign(rand() - 0.5) || 1;
        const x = s * (halfW * (a0 + (a1 - a0) * rand())) * (1 - t * 0.18);
        const z = -1.0 - t * (RD - 2.0);
        push(pick(), x, z, 1.55 - t * 0.72, 0.10 + t * 0.78);
      }

    } else if (layout === 'clutter') {
      // Dense, small, everywhere including the centre — but short enough to see over.
      for (let i = 0; i < n; i++) {
        const z = -1.2 - rand() * (RD - 1.8);
        const depth = (-z) / room.d;
        const x = (rand() * 2 - 1) * halfW * 0.95;
        push(pick(), x, z, 0.62 + rand() * 0.42, 0.14 + depth * 0.72);
      }

    } else if (layout === 'nook') {
      // Strongly asymmetric: a heavy mass on one side, near-empty on the other.
      const s = pal.nookSide ?? -1;
      for (let i = 0; i < n; i++) {
        const heavy = rand() < 0.78;
        const t = rand();
        const x = heavy
          ? s * halfW * (0.26 + 0.68 * t)
          : -s * halfW * (0.72 + 0.22 * t);
        const z = -1.4 - rand() * (RD - 2.2);
        push(pick(), x, z, heavy ? 1.1 + rand() * 0.5 : 0.85, 0.14 + (-z / room.d) * 0.72);
      }

    } else if (layout === 'terrace') {
      /* Three stepped PLANTING BEDS rising toward the back wall. Round 2 lifted
         the plants by `f * room.h * 0.20` with nothing whatsoever beneath them:
         20 of the Greenhouse's 30 props were measurably airborne. Each tier now
         stands on a real masonry bed that runs the full width of the frame —
         architecture, so it is allowed to reach the edges — and the lift is
         capped at 1.25 m, because a 2.1 m "step" is a wall. */
      /* FOUR TIERS ACROSS THE FRONT HALF OF THE ROOM, not three across all of
         it. Prop sizes are true metres now (SHAPE_M), so a 1.5 m plant on a
         tier 24 m back is twenty-five pixels tall: the two far tiers were
         drawing plants nobody could see and leaving the middle distance of a
         crowded glasshouse as bare floor. A conservatory's staging is banked up
         toward the back wall over a few metres and then you are AT the wall. */
      const tiers = 4;
      const per = Math.ceil(n / tiers);
      /* the chest SDF: a masonry planting bed. 16.25 since round 14, when shape
         16 became a carved table tomb: the kerb keeps its own old drawing. */
      const bedShape = 16.25;
      for (let t = 0; t < tiers && out.length - archN < n; t++) {
        const f = t / (tiers - 1);
        const z = -2.6 - f * (room.d * 0.56);
        const lift = f * Math.min((room.h > 0 ? room.h : 8) * 0.16, 1.25);
        if (lift > 0.22) {
          /* The frame's own interval at the bed's depth (MADDER): +-frameX on
             the square rig, so a vantage off the centre line still gets beds
             that run the width of the FRAME, not of the room. */
          const [s0, s1] = spanAt(z + 0.6, lift);
          const bLo = Math.max(-halfW * 0.98, s0), bHi = Math.min(halfW * 0.98, s1);
          const span = (bHi - bLo) / 2, bMid = (bLo + bHi) / 2;
          /* Enough beds that each one keeps roughly its own shape's proportions.
             Three beds across a 30 m greenhouse meant one 9 m x 1.2 m quad, and
             a chest SDF stretched 7:1 reads as a green blob, not as masonry. */
          /* ...and FEWER, WIDER beds. At lift*2.0 floored at 1.2 m a tier came
             out as 24 blocks of 1.2 m across a 30 m glasshouse, which is 24 of
             the 52 prop slots spent on a kerb. 2.26 m blocks read as ashlar
             (the relief in reliefH courses them at 0.30 m) and leave the slots
             for the planting. */
          const beds = Math.max(3, Math.round((span * 2) / Math.max(lift * 2.6, 2.2)));
          for (let i = 0; i < beds; i++) {
            pushArch(bedShape, bMid + ((i + 0.5) / beds - 0.5) * 2 * span,
                     z + 0.6, (span * 2) / beds + 0.25, lift, 0.30 + f * 0.42);
          }
        }
        for (let i = 0; i < per && out.length - archN < n; i++) {
          let x = ((i + 0.5) / per - 0.5) * 2 * halfW * 0.88 + (rand() - 0.5) * 0.9;
          /* the floor round a centrepiece is kept clear (round 14: the
             conservatory's fountain), on the tiers in front of it */
          if (P.clearX && f < 0.5 && Math.abs(x) < P.clearX) {
            x = (Math.sign(x) || 1) * (P.clearX + Math.abs(x) * 0.45);
          }
          /* `props.backOnly` (MADDER): shapes that stand on the back tiers
             only -- the conservatory's columns, which from its end gallery
             stood between the lens and the planting it looks down on */
          let sh = pick();
          for (let tries = 0; tries < 4 && f < 0.5 && (P.backOnly || []).includes(sh); tries++) sh = pick();
          push(sh, x, z + (rand() - 0.5) * 0.8, 1.15 - f * 0.18, 0.20 + f * 0.66,
               0.02 + lift);
        }
      }

    } else if (layout === 'maze') {
      /* THE HEDGE MAZE IS A MAZE (round 22). Both survey judges: "there is no
         maze; a flat paved plaza with knee-high noise-speckled shrub lumps
         along the horizon". A maze seen from inside one is WALLS: clipped yew
         taller than a man across the way ahead, each run broken by ONE way
         through, the ways through alternating side to side so the eye goes
         in by a zigzag -- and the room's side walls are the same yew (the
         wall program draws them), running away with their own turnings. The
         walls are architecture, sized directly (shape 28, the yew); the
         region's own pieces -- its statues -- stand where a maze keeps them,
         at the end of a run, in front of the hedge.
         `court` holds the first run back that many metres (the fountain
         court), `ways` says how many runs deep the maze is seen, and `gate`
         cuts an arch through the first run's middle section (a seed of 20 or
         more, which is what shapeField reads). */
      const court = P.court ?? 0;
      const ways = P.ways ?? 3;
      /* (graft: 3.2 m, the wall program's HH -- taller than a man by half
         again, so a run across the way is a wall and not a slab) */
      const HH = 3.2;
      let zr = -(P.first ?? 5.4) - court;
      let side = rand() < 0.5 ? -1 : 1;
      const statues = shapes.filter((s) => s !== 28 && s !== 30);
      const tops = shapes.filter((s) => s === 30);
      /* THE LANDMARKS (graft, VANDYKE's, all three judges): clipped topiary
         -- spirals, tiered stands, cones, ball-trees in their boxes on
         plinths -- stood along both hedges down the alley, a pace off the
         yew, leaving the walk (and the fight) the middle. Staggered, so the
         two files are not a mirror of each other. */
      if (tops.length) {
        const zEnd = -(P.first ?? 5.4) - court + 0.9;
        for (const sx of [-1, 1]) {
          let zt = -0.8 - rand() * 1.6 - (sx > 0 ? 1.4 : 0);
          while (zt > zEnd && zt > -RD + 1.5) {
            push(tops[(rand() * tops.length) | 0], sx * (halfW - 1.05 - rand() * 0.25), zt,
                 0.90 + rand() * 0.25, 0.55, undefined, 'wall');
            zt -= 3.0 + rand() * 1.4;
          }
        }
      }
      let placedStat = 0;
      for (let r = 0; r < ways && zr > -RD + 1.2; r++) {
        const [f0, f1] = spanAt(zr, 1.5);
        const x0 = Math.max(-halfW, f0 - 1.5), x1 = Math.min(halfW, f1 + 1.5);
        /* the way through this run: 2.2-3.0 m, off to one side of the axis */
        const gw = 2.2 + rand() * 0.8;
        const reach = Math.max(1.2, Math.min(x1, -x0) * 0.55);
        let gc = side * (1.3 + rand() * (reach - 1.0));
        /* (graft: the FIRST run's way through keeps to the side, so the
           fight's creatures stand against a face of yew and not against a
           hedge top crossing behind them at the height of their Guard) */
        if (r === 0) gc = side * Math.max(Math.abs(gc), Math.min(halfW - 1.4, 2.3 + gw / 2));
        /* the FIRST run is cut back on its way-through side all the way to
           the side hedge: the walk turns there, and the side wall running on
           past it is the corridor the eye follows into the maze */
        const runs = r === 0
          ? (side > 0 ? [[x0, gc - gw / 2]] : [[gc + gw / 2, x1]])
          : [[x0, gc - gw / 2], [gc + gw / 2, x1]];
        for (const [a, b] of runs) {
          const len = b - a;
          if (len < 0.8) continue;
          /* one length of yew per run: sections butted end to end showed
             their clipped ends as seams down the hedge */
          const nSec = 1;
          const sl = len / nSec;
          for (let i = 0; i < nSec; i++) {
            const cx = a + (i + 0.5) * sl;
            const hh = HH * (0.97 + rand() * 0.06);
            pushArch(28, cx, zr + (rand() - 0.5) * 0.12, sl + 0.34, hh / 0.93, 0.34 + r * 0.16);
            /* a gate section: the run with an arch cut through it */
            if (P.gate && r === 0 && Math.abs(cx) < sl * 0.5 + 0.2) out[out.length - 1].seed = 20 + rand() * 10;
          }
        }
        /* a statue at the end of the run, in front of the hedge beside the
           way through, on the first two runs */
        if (statues.length && r < 2 && placedStat < 2) {
          const sx = gc + side * (gw / 2 + 0.9 + rand() * 1.4);
          push(statues[(rand() * statues.length) | 0], sx, zr + 0.9, 1.0, 0.5);
          placedStat++;
        }
        zr -= 4.4 + rand() * 1.8;
        side = -side;
      }

    } else if (layout === 'patch') {
      /* THE PUMPKIN PATCH (round 22 graft, VANDYKE's density, two judges:
         "many ribbed pumpkins and jack-o'-lanterns through several rows so
         the patch fills the mid-ground; larger, brought forward"). Ranks
         across the whole width the lens holds at each depth, closer together
         near the lens, the near ones big. And in the FIGHT's own court (the
         wing's main room) the Kid's side of the frame and the creature's
         column are kept to dark flagstone -- all three judges on
         fight-pumpkin: "clear pumpkins from the Kid's standing zone at left
         and from directly behind the enemy; push them to the mid-ground
         flanks" -- so a pumpkin dealt there goes to the right-hand flank. */
      const main = !!pal.isMainRoom;
      const ranks = P.ranks ?? 6;
      const z0 = P.z0 ?? -1.8, z1 = -Math.min(RD, room.d - 1.2) + 0.6;
      const per = Math.max(3, Math.ceil(n / ranks));
      for (let r = 0; r < ranks && out.length - archN < n; r++) {
        const t = r / (ranks - 1);
        const z = z0 + (z1 - z0) * Math.pow(t, 1.3);
        const [f0, f1] = spanAt(z, 0.3);
        const x0 = Math.max(-halfW * 0.96, f0), x1 = Math.min(halfW * 0.96, f1);
        const m = Math.max(2, Math.round(per * (0.75 + 0.5 * t)));
        for (let i = 0; i < m && out.length - archN < n; i++) {
          let sx = (i + (r % 2) * 0.5 + (rand() - 0.5) * 0.8) / m;
          const zz = z + (rand() - 0.5) * 1.1;
          if (main && (sx < 0.31 || (sx > 0.40 && sx < 0.70))) {
            /* (half of them go to the flank, the rest are not dealt: the
               flank piled with all of them was the fight's heaviest frame) */
            if (rand() < 0.5) continue;
            sx = 0.70 + rand() * 0.27;
          }
          const x = x0 + sx * (x1 - x0);
          push(pick(), x, zz, (1.30 - t * 0.30) * (0.78 + rand() * 0.45), 0.18 + t * 0.62);
        }
      }

    } else if (layout === 'hang') {
      // Ceiling-dominant: the mass is overhead, the floor is nearly clear.
      const hangShapes = shapes.filter((s) => HANGING[s] === 1);
      const floorShapes = shapes.filter((s) => HANGING[s] !== 1);
      for (let i = 0; i < n; i++) {
        const overhead = hangShapes.length && rand() < 0.62;
        const pool = overhead ? hangShapes : (floorShapes.length ? floorShapes : shapes);
        const s = pool[(rand() * pool.length) | 0];
        const z = -2.0 - rand() * (RD - 3.0);
        const x = (rand() * 2 - 1) * halfW * (overhead ? 0.90 : 0.82);
        push(s, x, z, overhead ? 1.15 : 1.0, 0.16 + (-z / room.d) * 0.7);
      }

    } else if (layout === 'perimeter') {
      // Everything lines the back wall and the two side walls. Empty middle.
      for (let i = 0; i < n; i++) {
        const onBack = rand() < 0.55;
        let x, z;
        if (onBack) {
          x = (rand() * 2 - 1) * halfW * 0.92;
          z = -room.d + 0.9 + rand() * 1.6;
        } else {
          x = (Math.sign(rand() - 0.5) || 1) * halfW * (0.80 + rand() * 0.14);
          z = -2.0 - rand() * (room.d - 3.0);
        }
        push(pick(), x, z, onBack ? 1.0 : 1.22, onBack ? 0.74 : 0.24 + rand() * 0.4);
      }

    } else {
      // 'wings' — the original: three depth bands biased to the sides.
      const bands = [
        { z: -RD * 0.84, spread: 0.94, scale: 0.95, tone: 0.85, gap: 0.14 },
        { z: -RD * 0.56, spread: 0.82, scale: 1.10, tone: 0.50, gap: 0.26 },
        { z: -RD * 0.28, spread: 0.70, scale: 1.28, tone: 0.22, gap: 0.38 },
      ];
      let k = 0;
      for (let b = 0; b < bands.length && k < n; b++) {
        const band = bands[b];
        const per = Math.ceil(n / bands.length);
        for (let i = 0; i < per && k < n; i++, k++) {
          const s = pick();
          let x = rand() * 2 - 1;
          x = Math.sign(x) * Math.pow(Math.abs(x), 0.62) * halfW * band.spread;
          const gap = halfW * band.gap;
          if (Math.abs(x) < gap) x = Math.sign(x || 1) * (gap + rand() * 1.6);
          push(s, x, band.z + (rand() - 0.5) * 1.8, band.scale, band.tone * (0.7 + rand() * 0.6));
        }
      }
    }
    /* THE ROOF'S TRUSSES (round 23, the Attic): an A-frame of oak every few
       metres down the room, standing from the knee walls up under the
       pitched roof to its ridge -- its principal rafters, the collar, the
       king post and the arched braces. Architecture, so they are sized to
       the room and do not count against its budget; hung (no shadow on the
       floor), because they stand on the walls. */
    if (P.trusses && room.h > 0.01 && room.ceilPattern === 15) {
      const rise = Math.max(0, Math.min(room.w * 0.42, (room.wallPad ?? 5) - 0.4));
      const every = P.trusses.every ?? 3.2;
      for (let z = -(P.trusses.first ?? 2.6); z > -room.d + 1.4 && out.length < MAX_PROPS; z -= every) {
        archN++;
        /* (graft: ULTRAMARINE's arch-braced collar truss, and only from
           0.75 m under the eaves -- the wall post on its corbel, the brace
           and the roof. A quad from the floor put most of the frame's top
           half through the prop shader: 15.6 ms in its attic. The seed
           carries the eaves' height in the quad, where the brace springs.) */
        const T0 = 0.75;
        rand();
        out.push({ x: 0, z, w: room.w + 0.30, h: rise + T0 - 0.02, shape: P.trusses.shape ?? 38,
                   seed: T0, tone: 0.80, y: room.h - T0, hang: true, arch: true });
      }
    }
    /* A SOLO PROP IS THE ROOM'S ONE OF SOMETHING, so it is PLACED and not
       dealt, in every layout (it used to be colonnade's alone): a piano 24 m
       back behind a column is not in the room as far as the picture is
       concerned. A few metres in and off the axis, where a piano stands in a
       room used for dancing -- on the side, and at the distance, _vary()
       chose for this room (`soloAt`: side, fraction of the half-width, depth),
       so the one piano is not in the same place in every room of the wing. */
    for (const sp of (P.solo || [])) {
      if (!shapes.includes(sp) || out.length >= MAX_PROPS) continue;
      const at = P.soloAt || { side: -1, x: 0.145, z: 3.3 };
      push(sp, at.side * halfW * at.x, -at.z - rand() * 1.2, 1.0, 0.58);
    }
    /* NEAR-FIELD FURNITURE, PLACED BY HAND. Round 10 fix 6, both judges: "the
       lower 40% of the frame is unlit floor carrying one small bench, with no
       console table, rug, hall chair or vitrine anywhere in the entrance
       hall." No layout change fixes that. Every layout here spreads a region's
       budget over the whole ROOM, and the near corners -- which are most of
       the lower half of the FRAME -- are exactly where a hall's furniture
       actually stands. So `props.near` is an authored list of {shape, x, z},
       dealt after the layout and clamped to the frame like everything else but
       never re-randomised, because the whole point is that these pieces are
       where somebody put them. It does not count against `pick()`, so the
       region's own mix is untouched. */
    /* ONE LIGHT, ONE FITTING (graft, round 11). This list was authored on a
       branch with no `_fixtures`, and its Foyer stood a torchere exactly under
       the warm practical as that lamp's fitting. On this build every practical
       already has a fitting from `_fixtures`, placed from the lamp itself --
       after `_vary()` has mirrored and moved it -- so it is under the flame in
       every room. A fixed-coordinate piece cannot be: in the unseeded Foyer it
       stood IN the lantern (a lantern with a candelabrum's arms sticking out
       behind it), and in a seeded one it stood a metre or two off the lamp as
       a second, dark lamp stand. So a near piece yields its place when
         - it names the light it was placed for (`under`: an index into
           pal.lights) and that light has its own fitting, or
         - a STANDING fitting occupies its floor (the two overlap across --
           on 70% of their quads, because a silhouette does not fill its quad
           and a console 0.3 m clear of a lantern is not in its way -- and
           stand within a metre in depth), or
         - it is itself a candelabrum (shape 1) within 1.6 m of one, because
           a torchere just beside a lamp's lantern reads as that lamp's
           second fitting.
       A yielded piece is still DEALT -- push() runs and is then undone -- so
       the build's rand() stream, which the shafts and the wall, floor and
       ceiling seeds draw from next, is exactly what it would have been. */
    const standing = fixtures.filter((f) => !f.hang);
    const yields = (it, p) => {
      if (it.centre) return false;         // a room's centrepiece keeps its place
      if (it.under !== undefined && fixtures.some((f) => f.light === it.under)) return true;
      return standing.some((f) => {
        const dx = Math.abs(f.x - p.x), dz = Math.abs(f.z - p.z);
        if (dx < (f.w + p.w) * 0.35 && dz < 1.0) return true;
        return p.shape === 1 && Math.hypot(dx, dz) < 1.6;
      });
    };
    for (const it of (P.near || [])) {
      if (out.length >= MAX_PROPS) break;
      if (it.skip || it.centre) continue;
      push(it.shape, it.x ?? 0, it.z, it.scale ?? 1.0, it.tone ?? 0.16, it.y,
           it.wall ? 'wall' : (it.edge !== undefined ? { edge: it.edge } : (it.free ? 'free' : undefined)));
      if (yields(it, out[out.length - 1])) out.pop();
    }
    return out.slice(0, MAX_PROPS);
  }

  /**
   * A BODY FOR EVERY LIGHT THE ROOM DRAWS A FLAME AT.
   *
   * Placed from `pal.lights`, which is the very array `Atmosphere._buildLights`
   * turns into the rig a few lines later -- and after `_vary` has moved them,
   * because that runs on the palette before `build()` is called. So the fitting
   * cannot drift away from its flame: it is the same number.
   *
   * These are NOT clamped into the frame the way `push` clamps a prop. A prop
   * pushed back inside the lens is still that prop; a chandelier moved half a
   * metre off its own candles is the defect again with an extra step.
   */
  _fixtures(pal, room) {
    const out = [];
    const lights = pal.lights || [];
    const ceil = room.h > 0 ? room.h : 0;
    const depth = Math.max(room.d, 1);
    for (let i = 0; i < lights.length; i++) {
      const L = lights[i];
      const fit = fittingFor(L, room);
      if (fit === FIT.NONE) continue;
      /* Nothing in front of the action plane. Every practical in the house is
         authored deep in the room; a fitting at z > 0 would be between the
         camera and the actors and fill the screen. */
      if (L.z > -0.5) continue;
      /* A FITTING IS NOT FURNITURE IN A DARK CORNER. `tone` is the region's
         depth ramp on a prop's albedo, and a fitting is the object the room's
         own lamp is INSIDE: it takes the top of the range wherever it stands. */
      const tone = 0.86 + 0.12 * Math.min(-L.z / depth, 1);
      const seed = (i * 2.731 + 0.37) % 10;
      if (fit === FIT.CHANDELIER && ceil > 0.01) {
        /* The cups sit exactly at the light. The bowl hangs PEND_BELOW under
           them and the chain runs from the corona up to a rose on the ceiling,
           so the drop is whatever this room's ceiling leaves. */
        const h = Math.max(ceil - (L.y - PEND_BELOW), 1.30);
        /* A ballroom's chandelier is wider than a corridor's. Tied to the
           lamp's reach, which is the only measure of "how big a light this is"
           the data carries, and clamped to the sizes a real one comes in. */
        const w = Math.min(Math.max(0.55 + 0.115 * (L.radius || 6), 1.05), 2.30);
        out.push({ x: L.x, z: L.z, w, h, shape: SHAPE_PENDANT, seed,
                   tone, y: L.y - PEND_BELOW, hang: true, fixture: true, light: i });
      } else {
        /* A standard stands ON THE FLOOR and its head is at the light, so the
           stem is as long as the lamp is high. */
        const h = Math.max(L.y - 0.02 + LAMP_ABOVE, 0.95);
        const w = Math.min(Math.max(0.34 + 0.055 * h, 0.44), 0.78);
        out.push({ x: L.x, z: L.z, w, h, shape: SHAPE_STANDARD, seed,
                   tone, y: 0.02, hang: false, fixture: true, light: i });
      }
    }
    return out;
  }

  /**
   * WHERE YOU ARE STANDING (MADDER, round 11; driven by the room kind since
   * round 14). Two things follow the vantage `_vary()` chose for this room,
   * and neither costs a pixel of new geometry:
   *
   *  - the drawn flats turn to face the lens (`uYaw`), because every prop in
   *    the house is drawn front-on and a flat seen 25 degrees off its face is
   *    only a narrower flat;
   *  - the near frame rides with the eye: `pal.cam0` is the wing's authored
   *    rig and `pal.cam` this room's, and the frame keeps the offset from the
   *    eye it was authored with, turned with the camera.
   *
   * A vantage that stands IN something -- a doorway, at a gallery rail, in a
   * churchyard gate -- shows that instead of the near frame (`pal.frame`).
   * On the square rig every quad is exactly where it always was.
   */
  _setVantage(pal) {
    const cam = pal.cam || {};
    const cam0 = pal.cam0 || cam;
    const aspect = Math.min(pal.aspect || (16 / 9), 16 / 9);
    const lens = lensOf(cam, aspect);
    this.lens = lens;
    this.propMat.uniforms.uYaw.value.set(lens.rx, lens.rz);
    const rig = this.frameRig;
    const FRAME_Y = 2.08, FRAME_Z = 7.2;
    const mode = pal.frame || 'room';
    /* a door, a rail and a gate REPLACE the near frame; steam hangs in the
       air of a room that keeps its own (round 14) */
    const joinery = mode === 'door' || mode === 'rail' || mode === 'gate';
    const own = joinery || mode === 'steam';
    this._frameShow = (joinery || mode === 'none') ? [false, false, false, false]
                                                   : [true, true, true, true];
    this.portals[0].visible = mode === 'door';
    this.portals[1].visible = mode === 'rail';
    this.portals[2].visible = mode === 'gate';
    this.portals[3].visible = mode === 'steam';
    this._portalOn = own;
    this._portalLens = null;
    this.frames.forEach((m, i) => {
      m.position.set(0, FRAME_Y, FRAME_Z + i * 0.01);
      m.scale.set(i === 1 ? -1 : 1, 1, 1);
    });
    /* A room with no vantage of its own keeps the frame where its wing
       authored it -- including the rooms whose kind only nudges the tripod
       (ROOM_KINDS' `cam`), which is where round 11 left them. */
    const square = (!pal.vantageKind || pal.vantageKind === 'square') && !(cam.x || cam.lookX || cam.lookZ) && !own;
    if (square) {
      rig.position.set(0, 0, 0);
      rig.rotation.set(0, 0, 0);
      return;
    }
    if (own) {
      /* THE CAMERA'S OWN SPACE: the portal is a quad the size of the view a
         metre in front of the eye, turned with the whole camera, so a door's
         jambs are at the edges of the picture whatever the lens. Sized from
         the LIVE aspect: this is drawn ON the screen, not fitted into it. */
      const live = pal.aspect || (16 / 9);
      const eye = new THREE.Vector3(lens.ex, lens.ey, lens.ez);
      const at = new THREE.Vector3(cam.lookX ?? 0, cam.look ?? 2.4, cam.lookZ ?? 0);
      this.portalRig.position.copy(eye);
      this.portalRig.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().lookAt(eye, at, new THREE.Vector3(0, 1, 0)));
      rig.position.set(0, 0, 0);
      rig.rotation.set(0, 0, 0);
      this._portalLens = { fov: cam.fov ?? 42, aspect: live, fovNow: NaN, aspNow: NaN };
      this._sizePortals(this._portalLens.fov, live);
      if (joinery) return;
    }
    /* The eye moved and may have turned: carry the frame by the same move,
       about the eye, and turn it by the camera's yaw (not its pitch -- a lintel
       is level whichever way you tilt your head). */
    rig.position.set(lens.ex, lens.ey, lens.ez);
    rig.rotation.set(0, Math.atan2(-lens.rz, lens.rx), 0);
    const e0y = cam0.y ?? 2.3, e0z = cam0.z ?? 9.6;
    this.frames.forEach((m, i) => {
      m.position.set(0, FRAME_Y - e0y, FRAME_Z + i * 0.01 - e0z);
    });
  }

  /** The portal quads, sized to the whole view one metre in front of the eye:
   *  half the view's height at 1 m is tan(fov / 2), as lensOf computes it. */
  _sizePortals(fov, aspect) {
    const hh = Math.tan((fov * Math.PI) / 360);
    for (const m of this.portals) {
      m.position.set(0, 0, -1.0);
      m.scale.set(2 * hh * aspect * 1.002, 2 * hh * 1.002, 1);
      m.material.uniforms.uAspect.value = aspect;
    }
    if (this._portalLens) { this._portalLens.fovNow = fov; this._portalLens.aspNow = aspect; }
  }

  /** Rebuild props, contact shadows and shafts for a region. */
  build(pal, rand = Math.random) {
    const room = Object.assign({}, DEFAULT_ROOM, pal.room);
    this._applyRoom(room);
    this._setVantage(pal);

    /* The fittings go in FIRST so the MAX_PROPS slice can never drop one: a
       room with a flame and no lamp in it is the thing this round is fixing,
       and the Greenhouse deals 44 loose props plus its planting beds. */
    const fixtures = this._fixtures(pal, room);
    const placed = fixtures
      .concat(this._layoutProps(pal, room, rand, fixtures)).slice(0, MAX_PROPS);
    this._setPropProgram(placed);
    const off = this._propOffset.array, sc = this._propScale.array,
      sh = this._propShape.array, sd = this._propSeed.array, tn = this._propTone.array;
    const so2 = this._shdOffset.array, ss2 = this._shdScale.array, st2 = this._shdStr.array;

    // back-to-front so alpha-blended silhouettes stack correctly
    placed.sort((a, b) => a.z - b.z);

    let shadowN = 0;
    for (let k = 0; k < placed.length; k++) {
      const p = placed[k];
      off[k * 3 + 0] = p.x; off[k * 3 + 1] = p.y; off[k * 3 + 2] = p.z;
      sc[k * 2 + 0] = p.w; sc[k * 2 + 1] = p.h;
      sh[k] = p.shape; sd[k] = p.seed; tn[k] = p.tone;
      /* Contact shadow for anything that STANDS on something. `p.y < 1.2` was a
         proxy for that and it was wrong at both ends: it gave a terrace plant
         lifted 1.1 m a shadow on the floor 1.1 m below it, and it silently
         dropped the shadow of anything standing higher. The shadow now sits at
         the prop's own base, and hanging props do not get one. */
      if (!p.hang) {
        const i = shadowN++;
        /* A CHAIR SITS IN ITS OWN SHADOW (round 21 graft; the judges on the
           Ballroom: "give each armchair a floor shadow"). Centred on the
           quad's own plane, half of every contact shadow lay behind the
           chair that cast it and the rest was a hairline at its feet. A
           chair's -- shape 0, the house's seating -- comes a quarter of its
           width forward onto the floor in front of its legs, and denser: it
           stands on four feet with its seat over them, not on a plinth. */
        const chair = p.shape === 0;
        so2[i * 3 + 0] = p.x; so2[i * 3 + 1] = p.y + 0.015; so2[i * 3 + 2] = p.z + (chair ? p.w * 0.24 : 0);
        ss2[i * 2 + 0] = p.w * (chair ? 1.7 : 2.0); ss2[i * 2 + 1] = p.w * (chair ? 1.05 : 1.15);
        st2[i] = chair ? 1.10 + 0.14 * (1 - p.tone) : 0.52 + 0.26 * (1 - p.tone);
        /* A LENGTH OF HEDGE (28, round 22) is a wall, not a pot: its shadow
           is a band along its foot, not an ellipse twice its length across
           the path. A pumpkin (27) sits in a dense little pool of its own. */
        if (p.shape === 28) {
          ss2[i * 2 + 0] = p.w * 1.08; ss2[i * 2 + 1] = 1.5; st2[i] = 0.95;
        } else if (p.shape === 27) {
          ss2[i * 2 + 0] = p.w * 1.35; ss2[i * 2 + 1] = p.w * 0.62; st2[i] = 1.05;
        }
      }
    }
    this._propOffset.needsUpdate = this._propScale.needsUpdate = true;
    this._propShape.needsUpdate = this._propSeed.needsUpdate = this._propTone.needsUpdate = true;
    this.propGeo.instanceCount = placed.length;
    /* Kept for the placement audit (tools/lookmetrics.py --audit). Round 3 shipped
       two curtain panels hanging in the ceiling void of the Nursery and one cut by
       the viewport edge; nothing in the build could see that, because the placement
       existed only inside this function. It is a reference to plain objects that
       are already alive — no copy, no per-frame cost. */
    this.placed = placed;
    this._shdOffset.needsUpdate = this._shdScale.needsUpdate = this._shdStr.needsUpdate = true;
    this._propShadowN = shadowN;
    this.shadowGeo.instanceCount = shadowN;
    if (this._actors?.length) this.setActorShadows(this._actors);

    /* ---- shafts: extend each beam until it reaches the floor, and record the
       elliptical pool where it lands so the floor shader can paint it. ------- */
    const S = pal.shafts || {};
    const sn = Math.min(S.count ?? 3, ROOM_SHAFTS);
    const so = this._shOrigin.array, sp = this._shParam.array,
      ss = this._shSeed.array, si = this._shInt.array;
    this.pools.length = 0;
    /* WHERE EACH SHAFT COMES THROUGH THE ROOF. Round 10 fix 9 asks that the
       shafts in the Greenhouse have a SOURCE, and a source is the pane the
       beam came through -- which is the shaft's ORIGIN, not the pool it lands
       in: at 11.4 m of drop and 0.30 of rake those are 3.5 m apart. */
    this.roofLights = [];
    const ceilY = room.h > 0 ? room.h : 12.0;
    for (let i = 0; i < sn; i++) {
      const t = sn === 1 ? 0.5 : i / (sn - 1);
      const ox = (t - 0.5) * (S.spread ?? room.w * 0.72) + (rand() - 0.5) * 1.6;
      const oy = Math.min(S.y ?? ceilY + 1.4, ceilY + 2.2);
      const oz = (S.z ?? -room.d * 0.62) + (rand() - 0.5) * 2.4;
      const angle = (S.angle ?? 0.28) * (t < 0.5 ? 1 : -1) + (rand() - 0.5) * 0.10;
      const width = S.width ?? 3.2;
      // distance along the beam from origin to y = 0, plus a little overshoot so
      // the quad definitely crosses the floor plane
      const toFloor = oy / Math.max(Math.cos(angle), 0.15);
      const len = toFloor * 1.06;
      so[i * 3 + 0] = ox; so[i * 3 + 1] = oy; so[i * 3 + 2] = oz;
      sp[i * 3 + 0] = angle; sp[i * 3 + 1] = len; sp[i * 3 + 2] = width;
      ss[i] = rand() * 10;
      const inten = (S.intensity ?? 0.5) * (0.78 + rand() * 0.44);
      si[i] = inten;
      this.pools.push({
        x: ox + Math.tan(angle) * oy,
        z: oz,
        r: width * (0.62 + Math.abs(angle) * 0.4),
        i: inten * (S.pool ?? 1.35),
        ax: 1, ay: 0,
        stretch: 1.0 / Math.max(Math.cos(angle), 0.4),
      });
      this.roofLights.push({ x: ox, z: oz, r: width * 0.72, i: inten });
    }
    /* RAKING SHAFTS INTO THE FIGHT (round 21 graft, CHINTZ's Greenhouse and
       Ballroom). The room's own shafts come through the roof 13-14 m back and
       land at the foot of the far wall; with the rig pitched to put the floor
       under the fight (stageRig) the top of every one is above the frame, so
       a room that used to be crossed by moonlight showed a stub of it. A room
       that asks (`shafts.rake`) lays one or two more, NEARER: each lands on
       the floor at a point picked ON THE SCREEN -- `at` across, `y` down,
       behind the creature row and clear of it -- and rakes in from its own
       side of the frame, narrower and fainter than the room's own, so it is
       light crossing the room and never a searchlight on the fight. Their
       landing pools compete for the floor's four slots by strength like any
       other, so they never take the room's own pools off its floor. */
    const RK = S.rake;
    let rn = 0;
    if (RK && this.lens) {
      const L = this.lens;
      const oy = Math.min(S.y ?? ceilY + 1.4, ceilY + 2.2);
      for (let j = 0; j < (RK.at || []).length; j++) {
        const at = RK.at[j];
        const k = sn + rn;
        if (k >= MAX_SHAFTS) break;
        const px = (2 * at - 1) * L.tanH, py = (1 - 2 * (RK.y ?? 0.46)) * L.tanV;
        const dx = L.fx + px * L.rx + py * L.ux, dy = L.fy + py * L.uy, dz = L.fz + px * L.rz + py * L.uz;
        if (dy > -1e-3) continue;
        const tt = -L.ey / dy;
        const lx = L.ex + dx * tt, lz = L.ez + dz * tt;
        /* rakes in from its own side of the frame, unless the room says
           which way (`side`, +1 up to the left): a pair from one window is
           parallel, and a right-hand beam leaning right went in behind the
           Greenhouse's near columns and was never seen */
        const angle = (RK.side?.[j] ?? (at < 0.5 ? 1 : -1)) * (RK.angle ?? 0.42);
        const width = RK.width ?? 1.6;
        so[k * 3 + 0] = lx - Math.tan(angle) * oy; so[k * 3 + 1] = oy; so[k * 3 + 2] = lz;
        sp[k * 3 + 0] = angle; sp[k * 3 + 1] = (oy / Math.max(Math.cos(angle), 0.15)) * 1.06; sp[k * 3 + 2] = width;
        ss[k] = rand() * 10;
        const inten = (S.intensity ?? 0.5) * (RK.intensity ?? 0.55);
        si[k] = inten;
        this.pools.push({
          x: lx, z: lz, r: width * (0.62 + Math.abs(angle) * 0.4),
          i: inten * (S.pool ?? 1.35), ax: 1, ay: 0,
          stretch: 1.0 / Math.max(Math.cos(angle), 0.4),
        });
        rn++;
      }
    }
    this._shOrigin.needsUpdate = this._shParam.needsUpdate = true;
    this._shSeed.needsUpdate = this._shInt.needsUpdate = true;
    this.shaftGeo.instanceCount = sn + rn;
    this.pools.sort((a, b) => b.i - a.i);
    this._writePools();

    this.wallMat.uniforms.uSeed.value = 1 + rand() * 9;
    this.floorMat.uniforms.uSeed.value = 1 + rand() * 9;
    this.ceilMat.uniforms.uSeed.value = 1 + rand() * 9;
    this._placeAjar(pal, room, rand);
  }

  /** THE PASSAGES' OPEN DOORS (round 22 graft). All three judges: "every
   *  hidden door must be a panel leaf swung a few degrees open IN RELIEF ...
   *  and a wedge of light spilling onto the floor". One hidden door on each
   *  side wall stands open, at a depth in shot; the wall program draws it
   *  (uAjar, in the wall's own metres) and the floor its wedge (uWedge, in
   *  the world). A side wall's metres run from the front on the left wall
   *  and from the back on the right (see _applyPalette), so a bay's centre
   *  at q is z = FLOOR_FRONT - q on the left and q - d on the right. The
   *  door bays are the panelling's every sixth (bay 3 of each run of six,
   *  0.96 m) or the library's every fifth case (1.02 m) -- passWallH's own
   *  set-out. Rooms that are not the passages draw none, and draw no rand. */
  _placeAjar(pal, room, rand) {
    const fu = this.floorMat.uniforms;
    fu.uWedgeK.value.set(0, 0, 0);
    /* (round 23: a wing may lay its floor crisp as well -- the cloud of
       drift under its pools read as "a mottled cloud texture") */
    fu.uCrisp.value = pal.crispFloor ? 1 : 0;
    for (const m of this.sides) m.material.uniforms.uAjar.value.set(-99, 0);
    if (!pal.ajarDoors) return;
    fu.uCrisp.value = 1;
    const lib = pal.subject === 'backcase';
    const BW = lib ? 1.02 : 0.96, per = lib ? 5 : 6;
    const d = room.d, hw = room.w / 2;
    const k = [0, 0, 0];
    for (let i = 0; i < 2; i++) {
      const want = -(1.2 + rand() * 1.8) - i * 1.6;
      let best = null;
      /* (any bay: the wall program makes the bay it is told a door) */
      for (let n = 0; n < 40 * per; n++) {
        const bi = n;
        const q = (bi + 0.5) * BW;
        const z = i === 0 ? FLOOR_FRONT - q : q - d;
        if (z > -0.6 || z < -(d - 2.0)) continue;
        if (!best || Math.abs(z - want) < Math.abs(best.z - want)) best = { q, z };
      }
      if (!best) continue;
      this.sides[i].material.uniforms.uAjar.value.set(best.q, BW * 0.5);
      /* the slit is at the latch edge, the bay's +q side: toward the back on
         the left wall, toward the front on the right */
      const sz = i === 0 ? best.z - BW * 0.5 + 0.17 : best.z + BW * 0.5 - 0.17;
      const sgn = i === 0 ? -1 : 1;
      /* into the room, and swung a little toward the lens, which is the
         side the leaf opens away from */
      const a = 0.30 * (i === 0 ? -1 : 1);
      const dx = -sgn * Math.cos(a), dz = Math.abs(Math.sin(a));
      fu.uWedge.value[i].set(sgn * hw, sz, dx, dz);
      k[i] = 13.0;
    }
    /* ...and the far door, the end of the passage, standing open on the
       room beyond: its slit at the right of the middle bay, its wedge up the
       passage toward the lens */
    if (!lib) {
      fu.uWedge.value[2].set(0.31, -d, 0.0995, 0.995);
      k[2] = 9.0;
    }
    fu.uWedgeK.value.set(k[0], k[1], k[2]);
  }

  /**
   * Ground shadows for actors a scene owns. `list` items: {x, z, r, strength}.
   * These are appended after the prop shadows in the same instanced draw, so an
   * enemy costs nothing extra.
   */
  setActorShadows(list) {
    this._actors = list;
    const base = this._propShadowN || 0;
    const off = this._shdOffset.array, sc = this._shdScale.array, st = this._shdStr.array;
    let k = base;
    for (let i = 0; i < list.length && k < MAX_PROPS; i++, k++) {
      const a = list[i];
      off[k * 3 + 0] = a.x; off[k * 3 + 1] = 0.018; off[k * 3 + 2] = a.z ?? -4;
      sc[k * 2 + 0] = (a.r ?? 0.9) * 2.2; sc[k * 2 + 1] = (a.r ?? 0.9) * 1.25;
      st[k] = a.strength ?? 0.62;
    }
    this._shdOffset.needsUpdate = this._shdScale.needsUpdate = this._shdStr.needsUpdate = true;
    this.shadowGeo.instanceCount = k;
  }

  _writePools() {
    const fu = this.floorMat.uniforms;
    for (let i = 0; i < MAX_POOLS; i++) {
      const p = this.pools[i];
      if (!p) { fu.uPool.value[i].set(0, 0, 1, 0); continue; }
      // floor-local: (x, -(z - floorCz)) — matches syncLights
      fu.uPool.value[i].set(p.x, -(p.z - this._floorCz), p.r, p.i);
      fu.uPoolAxis.value[i].set(p.ax, p.ay, p.stretch, 0);
    }
    /* ...and the same four ellipses on the ROOF, at the origin of each shaft
       rather than where it lands. The ceiling's pool slots have been zero
       since round 8 cut the pools off it, so nothing else reads them, and
       FLOOR_FRAG gates them on the glasshouse pattern: every other ceiling in
       the house stays exactly as dark as it was. Ceiling-local is
       (x, z - floorCz) — the opposite z sign from the floor, per syncLights. */
    /* (GRAFT NOTE, r11: nothing writes them. This block was already empty on
       ui/r10-bg3-b's tip, so `roofLights` is never read. And the ceiling's
       slots are NOT zero: unwritten, each is THREE.Vector4's default
       (0, 0, 0, 1), which FLOOR_FRAG reads as a flat white wash over the whole
       ceiling -- the accidental light round 8 measured and put back. On the
       glasshouse roof FLOOR_FRAG's gate lets that wash through the panes and
       30% of it onto the bars, which is the roof as judged; on every other
       ceiling the gate is 1.0, as on dev. Wiring real roof pools up here
       would be a new change, not a graft.) */
  }

  /** A stable small integer per region, off its label. */
  static labelHash(label) {
    let h = 2166136261;
    const str = String(label || 'room');
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 3;
  }

  /**
   * How much wallpaper an architecture mode may carry. A fleur damask is right
   * on PANELLING and nowhere else: the seventeen-region sweep found it printed
   * over the Kitchens' brick (arch 4) and, in principle, over the Graveyard's
   * sky, because the wall shader draws every mode. Stone gets a trace of it,
   * because a coursed wall in this house may well have been papered once.
   * A palette may override with `damask`.
   */
  static damaskFor(arch) {
    if (arch === 0) return 1.00;    // panel: wainscot, chair rail, stiles
    if (arch === 2) return 0.28;    // stone: what is left of the paper
    return 0.0;                     // glass, foliage, industrial, open sky
  }

  /** Colour + parameter application. Safe to call every frame during a cross-fade. */
  applyPalette(p) {
    const ceil = p.room?.h > 0 ? p.room.h : (p.ceil ?? 6.4);
    const w = this.wallMat.uniforms;
    const arch = p.arch ?? 0;
    const dam = (p.damask ?? 0.55) * Backdrop.damaskFor(arch);
    /* Which paper this room is hung with. Off the region's LABEL, not its
       uSeed: uSeed is drawn from the build's rand() and would change the
       Nursery's wallpaper every time you walked back into it. A palette may
       name it with `damaskKind`. */
    const kind = p.damaskKind ?? (Backdrop.labelHash(p.label) % 3);
    w.uDamask.value = dam;
    w.uDamKind.value = kind;
    w.uDamCell.value = p.damaskCell ?? (kind === 2 ? 0.74 : 0.92);
    w.uArch.value = arch;
    const subj = SUBJECT[p.subject] ?? 0;
    this._setRoomsProgram(ROOMS_PROGRAM[p.subject] ?? 0);
    w.uSubject.value = subj;
    w.uWains.value = p.wainscot ? 1 : 0;
    /* WHICH WALL CARRIES THE ROOM'S ONE-OFF (round 14). uFar has always
       meant "this is the wall with the staircase on it"; it was simply always
       the back one. A kind may hang its stair on a side wall instead
       (pal.subjWall), and then that wall is the one with uFar = 1. */
    const sWall = p.subjWall || 'back';
    w.uFar.value = sWall === 'back' ? 1 : 0;
    w.uDoorX.value = p.doorX ?? 0;
    w.uHouse.value.set(p.houseX ?? 0, p.moonX ?? 0);
    w.uSubjX.value = sWall === 'back' ? (p.subjX ?? 0) : 0;
    w.uSubjMode.value = p.subjMode ?? 0;
    w.uSubjDir.value = p.subjDir ?? 1;
    w.uHouseS.value = p.houseS ?? 1;
    w.uQuiet.value = p.quietStair ? 1 : 0;
    /* ROUND 16 ITEM 4, judge 1 on combat: "the wall behind the Dust Bunny is
       now the brightest patch in the top half and the enemy's grey fur loses
       its silhouette against it at 1280". A region's MAIN room is the room
       its fight is played in -- the same test quietStair already uses for the
       same reason, that the enemy row stands in front of that wall -- so the
       band of far wall the creatures stand against is pulled about half a
       stop there and nowhere else. The room serves the board (RUBRIC-r16). */
    w.uBoardBand.value = p.isMainRoom ? 1 : 0;
    w.uCool.value = p.coolFill ?? 0.9;
    w.uGrime.value = p.grime ?? 0.7;
    w.uOpen.value = p.openGlow ?? 0.5;
    w.uFogAmt.value = p.wallFog ?? 0.18;
    w.uCeil.value = ceil;
    const cpat = p.room?.ceilPattern ?? 3;
    /* (the same number _room pitches the ceiling by -- WELD's, round 18) */
    w.uGable.value = (p.room?.h ?? 0) > 0.01 && (cpat === 9 || cpat === 12)
      ? Math.max(0, Math.min((p.room.w ?? 30) * 0.16, (p.room.wallPad ?? 5) - 0.4))
      : (p.room?.h ?? 0) > 0.01 && cpat === 15
        ? Math.max(0, Math.min((p.room.w ?? 30) * 0.42, (p.room.wallPad ?? 5) - 0.4)) : 0;
    /* A region with room.h = 0 is OPEN TO THE SKY, and uCeil cannot say so: the
       fallback hands it 6.4 m, so the Hedge Maze was crushed to a tenth above
       6.4 m and painted no sky at all -- 71.5% of its upper third pure black. */
    const noCeil = (p.room?.h ?? 0) <= 0.01 ? 1 : 0;
    w.uOpenSky.value = noCeil;
    /* HOW BRIGHT THE NIGHT IS, and it is a POST-EXPOSURE quantity, so it is
       divided by the region's own exposure. Set by eye on the Graveyard at
       exposure 1.33; applied flat it gave the Title -- exposure 1.8, contrast
       1.67, a warm gold horizon -- a near-white house and hot gold cloud. */
    w.uSkyGlow.value = (p.skyGlow ?? 1.20) / Math.max(p.exposure ?? 2.0, 0.4);
    /* THE SKY IS NOT A WALL. Painted with the region's own `deep` -- the colour
       of its masonry -- the Hedge Maze's green gave an olive sky that read as a
       sick night, and not one of the four samples contains one. mainMenu.png's
       sky is a saturated navy at 0.70-0.89 saturation. So the sky's base is the
       region's deep carried most of the way to a canonical night: a region
       keeps a trace of its own cast, and every sky is recognisably night.
       NOT a palette change -- walls, floors and props are as authored. */
    w.uSkyDeep.value.copy(p._deep).lerp(NIGHT_DEEP, 0.72);
    w.uGain.value = (p.gain ?? 3.4) * 1.05;
    w.uGloss.value = (p.gloss ?? 0.5) * 0.5;
    w.uDeep.value.copy(p._deep);
    w.uMid.value.copy(p._mid);
    w.uHi.value.copy(p._hi);
    w.uAccent.value.copy(p._accent);
    w.uFog.value.copy(p._fog);
    w.uOpenGlow.value.copy(p._open);
    w.uAmbient.value.copy(p._ambient);

    const f = this.floorMat.uniforms;
    f.uPattern.value = p.floorPattern ?? 0;
    /* parquet (10), turf (11) and a pool are drawn by the room-kind variant */
    /* (round 23: an INDOOR bath is variant 2, which lays the hall in its
       water as a mirror; the pond out of doors keeps variant 1) */
    this._setSurfaceProgram(this.floorMat, (p.pool && !p.pool.open) ? 2
      : ((p.floorPattern ?? 0) > 9.5 || !!p.pool));
    f.uRunner.value = p.runner ?? 0;
    /* the runner leads to the door, wherever the subject took it */
    f.uRunX.value = p.runX ?? (p.subjX ?? 0);
    /* a pool sunk in the floor, in floor-local metres (see syncLights) */
    if (p.pool) {
      const cz = this._floorCz ?? 0;
      /* w: 1 an indoor bath (its window lies in it), 2 a pond under the sky */
      f.uWater.value.set(p.pool.hw, -(p.pool.z0 - cz), -(p.pool.z1 - cz), p.pool.open ? 2 : 1);
      f.uMirror.value.set(-(p.room?.d ?? 17), 3.32, ceil - 0.34, 6.4);
    } else {
      f.uWater.value.set(0, 0, 0, 0);
    }
    f.uGloss.value = p.gloss ?? 0.5;
    /* the foreground's vignette into the dark (round 21 graft): FLOOR_FRAG */
    f.uNearDark.value = p.nearDark ?? 0;
    /* the moon on the court's flags and in its pond (round 22 graft) */
    if (p.moonFloor) {
      f.uMoonF.value.set(p.moonFloor[0], p.moonFloor[1], p.moonFloor[2]);
      f.uMoonW.value.set(7.0 + w.uHouse.value.y, 8.5, -(p.room?.d ?? 24), p.moonPond ?? 0);
    } else {
      f.uMoonF.value.setRGB(0, 0, 0);
      f.uMoonW.value.set(0, 0, 0, 0);
    }
    f.uGain.value = (p.gain ?? 3.4) * 0.58;
    f.uDeep.value.copy(p._floorDeep);
    f.uMid.value.copy(p._floorMid);
    f.uFog.value.copy(p._fog);
    f.uAccent.value.copy(p._accent);
    f.uAmbient.value.copy(p._ambient);
    for (let i = 0; i < MAX_POOLS; i++) f.uPoolCol.value[i].copy(p._shaft);

    const c = this.ceilMat.uniforms;
    c.uDeep.value.copy(p._deep).multiplyScalar(0.50);
    c.uMid.value.copy(p._mid).multiplyScalar(0.58);
    c.uFog.value.copy(p._fog);
    c.uAccent.value.copy(p._accent);
    c.uAmbient.value.copy(p._ambient);
    /* A room kind may dim its ceiling (ROOM_KINDS' ceilGain): a vantage that
       shows the ceiling over a room's chandeliers showed it as a flat grey
       slab, where the wing's other rooms keep it dark. */
    c.uGain.value = (p.gain ?? 3.4) * 0.085 * (p.ceilGain ?? 1);

    const pr = this.propMat.uniforms;
    pr.uAlbedo.value.copy(p._propAlb);
    pr.uAlbedoHi.value.copy(p._propHi);
    pr.uFog.value.copy(p._fog);
    pr.uRim.value.copy(p._rim);
    pr.uAccent.value.copy(p._accent);
    pr.uAmbient.value.copy(p._ambient);
    pr.uRimAmt.value = p.rim ?? 1.0;
    pr.uGain.value = (p.gain ?? 3.4) * (p.propGain ?? 1.0);
    pr.uGloss.value = p.propGloss ?? 0.55;
    /* THE PROP LUMINANCE CEILING, in pre-grade units. The grade multiplies by
       uExposure before ACES, so a fixed post-grade target is a MOVING pre-grade
       one: `heart` runs exposure 1.11 and `attic` 2.80, and a single hard clamp
       would either kill the dark rooms or do nothing in the bright ones. Divide
       the target through by the region's own exposure and every room lands on
       the same ceiling. */
    const ex = Math.max(p.exposure ?? 2.0, 0.4);
    const max = (p.propCeil ?? 0.80) / ex;
    pr.uPropMax.value = max;
    pr.uPropKnee.value = max * 0.55;

    for (let i = 0; i < 2; i++) {
      const su = this.sides[i].material.uniforms;
      su.uArch.value = arch;
      su.uDamask.value = dam;
      su.uDamKind.value = kind;
      su.uDamCell.value = w.uDamCell.value;
      su.uSubject.value = subj;
      su.uWains.value = 0;
      /* One staircase, forty niches: a side wall carries the one-off only
         when the room's kind has hung it there. sides[0] is the left wall,
         whose own metres run from the front toward the back, and the right
         wall's the other way (see syncLights). */
      const mine = sWall === (i === 0 ? 'left' : 'right');
      su.uFar.value = mine ? 1 : 0;
      su.uDoorX.value = 0;                      // the side walls keep their own door
      su.uHouse.value.copy(w.uHouse.value);
      const at = p.subjAt ?? -this.room.d * 0.45, d = this.room.d;
      su.uSubjX.value = mine ? (i === 0 ? (FLOOR_FRONT - d) / 2 - at : at + (d - FLOOR_FRONT) / 2) : 0;
      su.uSubjMode.value = mine ? (p.subjMode ?? 0) : 0;
      su.uSubjDir.value = mine ? (i === 0 ? -(p.subjDir ?? 1) : (p.subjDir ?? 1)) : 1;
      su.uHouseS.value = w.uHouseS.value;
      su.uBoardBand.value = 0;   // the creature row stands against the FAR wall
      su.uCool.value = (p.coolFill ?? 0.9) * 0.85;
      su.uGrime.value = Math.min(1, (p.grime ?? 0.7) + 0.12);
      su.uOpen.value = 0;                       // no doorway on the side walls
      su.uFogAmt.value = (p.wallFog ?? 0.18) + 0.10;
      su.uCeil.value = ceil;
      su.uGable.value = w.uGable.value;
      su.uGain.value = (p.gain ?? 3.4) * 0.95;
      su.uGloss.value = (p.gloss ?? 0.5) * 0.4;
      su.uDeep.value.copy(p._deep); su.uMid.value.copy(p._mid); su.uHi.value.copy(p._hi);
      su.uAccent.value.copy(p._accent); su.uFog.value.copy(p._fog);
      su.uOpenGlow.value.copy(p._open); su.uAmbient.value.copy(p._ambient);
      su.uOpenSky.value = noCeil; su.uSkyGlow.value = w.uSkyGlow.value;
      su.uSkyDeep.value.copy(w.uSkyDeep.value);
      this.sides[i].visible = p.sides !== false;
    }

    this.shaftMat.uniforms.uColor.value.copy(p._shaft);
    /* A LINTEL IS A DOORWAY'S HEAD, and an open-air region has no doorway. Over
       the Graveyard's sky the near frame's lintel quad (FRAME_CROP[2]) drew a
       dark band across the upper third with a hard bottom edge -- the seam a
       layer-by-layer A/B (`props=0`, `shafts=0`, `frames=0` on
       tools/shot-scripts/backdrop-room.js) pinned on it after two guesses. The
       drapes and the clutter band stay: a yard may well have a bough or a wall
       in the foreground. */
    const openSky = (p.room?.h ?? p.ceil ?? 6.4) <= 0.01;
    /* ...nor has a GLASSHOUSE a timber beam across its roof (round 18,
       FOLIUM's): seen looking up, the lintel quad came down into the picture
       as a dark band laid straight across the pitched glass and its gable. */
    const glassRoof = w.uGable.value > 0.5;
    /* (round 22 graft, CAPUT's, one judge: "carry the floor boards and
       lamplight into the bottom third instead of fading to black". A room
       whose lens stands too far back for the near frame says so
       (nearFrame: false): the Heart's lens is 13 m out, where the frame's
       clutter band -- whose foot was the seam -- lay across the near floor
       as a dark lid. With no near frame there is no seam and no lid.) */
    const noNear = p.nearFrame === false;
    for (let i = 0; i < this.frames.length; i++) {
      const m = this.frames[i];
      m.visible = this._frameShow[i] !== false && !((openSky || glassRoof) && i === 2) && !noNear;
      m.material.uniforms.uColor.value.copy(p._frame);
      m.material.uniforms.uRim.value.copy(p._rim);
      m.material.uniforms.uAmount.value = p.frameAmount ?? 0.92;
    }
    /* The doorway, the rail and the gate are the house's own joinery seen
       against the lit room: the region's darkest value with its own rim on the
       lit edge, and SOLID -- a vignette is translucent, a door jamb is not.
       A rail is timber or cast iron (`rail`), a door an arch or a doorcase
       under a cornice (`door`). */
    for (const m of this.portals) {
      m.material.uniforms.uColor.value.copy(p._frame).lerp(p._deep, 0.35);
      m.material.uniforms.uRim.value.copy(p._rim);
      m.material.uniforms.uDoorKind.value = m === this.portals[1]
        ? (p.rail === 'iron' ? 1 : 0)
        : (p.door === 'case' ? 1 : 0);
    }
  }

  /** The floor's or the ceiling's program: the room-kind floors (parquet,
   *  turf, a vinery's roof, a pool) are compiled only where they are laid
   *  (MM_FLOORX in shaders/backdrop.js). */
  _setSurfaceProgram(mat, x) {
    const n = x === 2 ? 2 : (x ? 1 : 0);
    if (mat.defines && mat.defines.MM_FLOORX === n) return;
    mat.defines = Object.assign({}, mat.defines, { MM_FLOORX: n });
    mat.needsUpdate = true;
  }

  /** The props' program, by what this room deals (round 14): the grounds'
   *  carved stone -- the churchyard's stones and table tombs (3, and 16 below
   *  16.1; 16.25 is the terrace's kerb, drawn as it always was) and the
   *  fountain (25) -- and the gallery's bust (26) are compiled only into the
   *  rooms that have them. In every program they took the prop link from
   *  9.0 s to 16.7 s and the stage's warm-up from ~47 s to ~70 s. Two
   *  variants, so no room needs one that was not linked behind the game:
   *  the hedge's fountain court has stones AND a fountain, and those are one
   *  variant; nothing that has a bust has either. */
  _setPropProgram(placed) {
    let stones = 0, bust = 0, wings = 0;
    for (const p of placed) {
      const s = p.shape;
      if ((s > 2.5 && s < 3.5) || (s > 15.5 && s < 16.1) || (s > 24.5 && s < 25.5)) stones = 1;
      else if (s > 31.5) wings = 2;          // round 23: the bath, the lamp, the telescope, the kennel
      else if (s > 26.5) wings = 1;          // round 22: the pumpkin and the yew
      else if (s > 25.5) bust = 1;
    }
    const d = this.propMat.defines || {};
    if (d.MM_STONES === stones && d.MM_BUST === bust && d.MM_WINGS === wings) return;
    this.propMat.defines = Object.assign({}, d, { MM_STONES: stones, MM_BUST: bust, MM_WINGS: wings });
    this.propMat.needsUpdate = true;
  }

  /** Switch the three wall planes to the program that carries this subject. */
  _setRoomsProgram(n) {
    if (this._roomsProg === n) return;
    this._roomsProg = n;
    for (const m of [this.wallMat, this.sides[0].material, this.sides[1].material]) {
      m.defines = Object.assign({}, m.defines, { MM_ROOMS: n });
      m.needsUpdate = true;
    }
  }

  /**
   * LINK THE OTHER WINGS' WALL PROGRAMS BEHIND THE GAME, once the stage has
   * warmed, one at a time. Measured on this machine with each program linked
   * alone (a unique define defeats the program cache): a guarded variant
   * links in 0.6-1.5 s, so a wing's program linked on demand holds the first
   * room of that wing about a second -- where a full-size one took 7-9 s.
   *
   * ONE TARGET: the composer's. Play draws the walls only through the
   * composer; the canvas program the stage's own warm-up also links is for
   * its show-the-room-while-post-warms phase, which a variant never sees --
   * and linking both doubled the work done behind the game.
   *
   * THE FOYER'S FIRST, AND AT ONCE. Every expedition starts in the Foyer, and
   * fourteen of its twenty rooms are its hall with a fire or its gallery
   * (program 1), so that is the program a player meets first; begun as soon
   * as the stage has warmed and calibrated, it is linked while the title and
   * the selects are still up. A draft waited 45 s first, so that a capture
   * deep-linked into another wing would link its own program alone -- which
   * bought a faster screenshot with the player's first fight. A room shown
   * before its program is ready links it on demand, as every program was
   * before stage.warmup existed: slower with this running beside it, never a
   * different picture. Measured behind a running Foyer fight on this machine
   * (Intel UHD, ANGLE D3D11): all five variants linked 69 s after the
   * warm-up, the frame loop held 29 fps throughout, and its worst gap was
   * 2.6 s -- BASE's own worst in the same slot, with nothing linking, 7.0 s.
   *
   * EVERY variant is kept here, the live room's included: three.js releases a
   * program when the last material using it moves off it, so a variant held
   * only by the live walls would be thrown away at the next room of another
   * kind and linked again at the one after.
   *
   * Only where KHR_parallel_shader_compile exists: there the link runs off
   * the main thread, and without it a background link would be a multi-second
   * stall on whatever screen is up -- so there a wing's program is linked the
   * first time one of its rooms is shown, as every program was before
   * stage.warmup existed. The materials are KEPT: disposing one would release
   * the program it holds.
   */
  precompileRooms(stage) {
    if (this._pre || !stage?.renderer) return;
    this._pre = [];
    const R = stage.renderer;
    let gl = null;
    try { gl = R.getContext(); } catch { gl = null; }
    if (!gl || !gl.getExtension('KHR_parallel_shader_compile')) return;
    const targets = [stage.composer?.renderTarget1 ?? null];
    /* THE WALLS FIRST, in the order they always were: a wall variant is a
       0.6-1.5 s link, and holding them back behind round 14's heavier ones
       left the Graveyard's plots (wall 4) linking on demand in a batch -- the
       one VOID in its check sheet. Then round 14's: the portal (the Foyer's
       parlor is seen from a doorway), the props with the gallery's busts
       (MM_BUST), the room-kind floor, and last the grounds' carved stone
       (MM_STONES, a 15 s link on this machine), whose first wing is the
       Greenhouse, the third. */
    const wall = (n) => [this.wall.geometry, this.wallMat, { MM_ROOMS: n }];
    const jobs = [
      wall(1), wall(2), wall(3), wall(4), wall(5), wall(6), wall(7),
      wall(8), wall(9), wall(10), wall(11),
      /* round 23 */
      wall(12), wall(13), wall(14), wall(15), wall(16),
      [this.portals[0].geometry, this.portals[0].material, null],
      [this.propGeo, this.propMat, { MM_STONES: 0, MM_BUST: 1 }],
      [this.floor.geometry, this.floorMat, { MM_FLOORX: 1 }],
      [this.floor.geometry, this.floorMat, { MM_FLOORX: 2 }],
      [this.ceiling.geometry, this.ceilMat, { MM_FLOORX: 2 }],
      [this.propGeo, this.propMat, { MM_STONES: 1, MM_BUST: 0 }],
      /* round 22: the pumpkin and the yew, alone and with the grounds' stone
         (the maze's fountain court deals both) */
      [this.propGeo, this.propMat, { MM_STONES: 0, MM_BUST: 0, MM_WINGS: 1 }],
      [this.propGeo, this.propMat, { MM_STONES: 1, MM_BUST: 0, MM_WINGS: 1 }],
      /* round 23: the four wings' own objects */
      [this.propGeo, this.propMat, { MM_STONES: 0, MM_BUST: 0, MM_WINGS: 2 }],
    ];
    (async () => {
      await new Promise((r) => setTimeout(r, 1500));
      for (const [geo, mat, defs] of jobs) {
        const m = mat.clone();
        if (defs) m.defines = Object.assign({}, mat.defines, defs);
        const mesh = new THREE.Mesh(geo, m);
        mesh.frustumCulled = false;
        for (const rt of targets) {
          const prev = R.getRenderTarget();
          R.setRenderTarget(rt);
          let done = null;
          try { done = R.compileAsync(mesh, stage.camera, stage.scene); } catch { done = null; }
          R.setRenderTarget(prev);
          try { await done; } catch { /* keep going */ }
          await new Promise((r) => setTimeout(r, 0));
        }
        this._pre.push(m);
      }
    })();
  }

  /**
   * The region's prop MATERIAL. Structural, not a colour — it swaps with the
   * geometry at build time rather than cross-fading, because a cabinet does not
   * gradually stop being oak.
   */
  applyPropMaterial(m) {
    if (!m) return;
    const u = this.propMat.uniforms;
    u.uMatMix.value.set(m.mix[0], m.mix[1], m.mix[2], m.mix[3]);
    u.uMatFreq.value.set(m.freq[0], m.freq[1]);
    u.uAO.value = m.ao;
    const sat = m.sat ?? 0.14;
    u.uPropSat.value = sat;
    u.uPropSatMax.value = sat * 1.45;
  }

  /** Pack the light rig into wall- and floor-local coordinates. */
  syncLights(rig) {
    const wl = this.wallMat.uniforms.uLights.value, wc = this.wallMat.uniforms.uLightCol.value;
    const fl = this.floorMat.uniforms.uLights.value, fc = this.floorMat.uniforms.uLightCol.value;
    const cl = this.ceilMat.uniforms.uLights.value, cc = this.ceilMat.uniforms.uLightCol.value;
    const ceilY = this.ceiling.position.y;
    const WALL_W = this._wallW, WALL_Z = this._wallZ, SIDE_X = this._sideX;
    for (let i = 0; i < NLIGHT; i++) {
      const p = rig.worldPos[i], inten = rig.inten[i], r = p.w || 1;
      // wall: fold the plane-distance into the intensity so the vec4 stays packed
      const dzw = p.z - WALL_Z;
      wl[i].set(p.x + WALL_W / 2, p.y, r, inten / (1 + (dzw / r) * (dzw / r)));
      wc[i].copy(rig.colors[i]);
      const dyf = p.y;
      fl[i].set(p.x, -(p.z - this._floorCz), r, inten / (1 + (dyf / r) * (dyf / r)));
      fc[i].copy(rig.colors[i]);
      for (let sIdx = 0; sIdx < 2; sIdx++) {
        const su = this.sides[sIdx].material.uniforms;
        const sl = su.uLights.value, sc = su.uLightCol.value;
        // left wall runs front->back as u goes 0->1; right wall runs the other way
        const front = this._sideCz + this._sideLen / 2;
        const qx = sIdx === 0 ? (front - p.z) : (p.z - (this._sideCz - this._sideLen / 2));
        const dxs = sIdx === 0 ? (p.x + SIDE_X) : (SIDE_X - p.x);
        sl[i].set(qx, p.y, r, inten / (1 + (dxs / r) * (dxs / r)));
        sc[i].copy(rig.colors[i]);
      }
      const dyc = ceilY - p.y;
      cl[i].set(p.x, (p.z - this._floorCz), r, inten / (1 + (dyc / r) * (dyc / r)));
      cc[i].copy(rig.colors[i]);
    }
    const pl = this.propMat.uniforms.uLights.value, pc = this.propMat.uniforms.uLightCol.value;
    const pi = this.propMat.uniforms.uLightInt.value;
    /* Which way round the cinematic pair is. The key is the cine light that is
       not the fill; the Pumpkin Grounds' key is a cold moon and its fill is
       warm, so "cold means fill" would have damped the wrong one there. */
    let keyCold = false, haveKey = false;
    for (let i = 0; i < NLIGHT; i++) {
      if (rig.cine[i] && !rig.isFill[i]) { keyCold = rig.cold[i]; haveKey = true; break; }
    }
    for (let i = 0; i < NLIGHT; i++) {
      pl[i].copy(rig.worldPos[i]); pc[i].copy(rig.colors[i]);
      /* A KEY LIGHT LIGHTS THE SUBJECT, NOT THE SET.
         The key and fill sit in front of the action plane, a couple of metres
         from the camera. In a deep room laid out on the perimeter (the Crypt)
         nothing is within their reach and the props look right. In a shallow
         room with a clutter layout (the Nursery, 12.5 m deep) props land 3 m
         from a 7.5 m-radius key and take it at near-full strength — which is
         the entire difference between the two halves of the bimodal split a
         reviewer found. Practical lamps light props; cinematic lights barely
         do. */
      /* AND A PROP IS GREY BY CONSTRUCTION, which is the other half of
         BRIEF-r9's fix 1. The key and the fill reach a prop at the SAME
         CINE_PROP, and in most palettes they are equal-and-opposite hues --
         the Foyer's warm #e2b271 key against its cold #79afce fill, the
         Ballroom's #e5c07e against its violet #a984cd. Two opposite hues at
         equal weight make grey, a smooth grey standing figure is an award
         statuette, and no chroma cap can help because a cap changes
         saturation and not hue. So the CINEMATIC FILL -- not the practical
         lamps, which are the room's own light and belong on the prop at full
         strength -- reaches a prop at about a third of the key. */
      const opposed = haveKey && rig.isFill[i] && rig.cold[i] !== keyCold;
      pi[i] = rig.inten[i] * (rig.cine[i] ? CINE_PROP : 1) * (opposed ? CINE_FILL_PROP : 1);
    }
    this.propMat.uniforms.uKeyDir.value.copy(rig.keyDir);
    /* the lamp the fight's shadows fall away from: the cinematic key */
    for (let i = 0; i < NLIGHT; i++) {
      if (rig.cine[i] && !rig.isFill[i]) {
        const p = rig.worldPos[i];
        this.floorMat.uniforms.uKeyF.value.set(p.x, -(p.z - this._floorCz), Math.max(p.y, 0.6));
        /* STAGE_LIGHT: how much of the key the floor under a figure takes,
           as a multiple of its albedo. Set by eye on the Foyer's boards. */
        this.floorMat.uniforms.uKeyCol.value.copy(rig.colors[i]).multiplyScalar(STAGE_LIGHT * Math.min(rig.inten[i], 2.5));
        break;
      }
    }
    /* THE FIGHT IS PLAYED IN CANDLELIGHT (round 21 graft, OXBLOOD's warm
       wash). The floor under the fight takes a broad pool of the room's WARM
       cinematic light -- the key where the key is a lamp, the fill where the
       key is the moon -- and the floor round it keeps the cold light it had,
       so the stage reads warm against cold the way the samples' candle pools
       do. It is light on the floor's own albedo, so every board, joint and
       crumb stays drawn inside it: a pool, not a haze. */
    const sc2 = this.floorMat.uniforms.uStageCol.value;
    sc2.setRGB(0, 0, 0);
    for (let i = 0; i < NLIGHT; i++) {
      if (rig.cine[i] && !rig.cold[i]) {
        sc2.copy(rig.colors[i]).multiplyScalar(STAGE_WASH * Math.min(rig.inten[i], 2.5));
        break;
      }
    }
  }

  /**
   * WHERE THE FIGHT STANDS (round 21). `list` is up to six {x, z, r, s}: a
   * combatant's feet on the floor in WORLD metres, its footprint radius and
   * the strength of its shadow. Anything past the list is cleared.
   */
  setActors(list = []) {
    const u = this.floorMat.uniforms;
    const a = u.uActor.value, k = u.uActorK.value, key = u.uKeyF.value;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < MAX_ACTORS; i++) {
      const it = list[i];
      if (!it) { a[i].set(0, 0, 0, 0); k[i].set(0, 0, 0, 0); continue; }
      const fx = it.x, fy = -(it.z - this._floorCz), r = Math.max(it.r, 0.08);
      /* a FLIER's radius goes in negative: its shadow is a pool straight
         under it, not a contact and a throw (FLOOR_FRAG) */
      a[i].set(fx, fy, it.fly ? -r : r, it.s);
      /* the throw: away from the key lamp, longer the lower the lamp is
         against its distance, 1.6-4.2 footprints */
      let dx = fx - key.x, dy = fy - key.y;
      const kl = Math.max(Math.hypot(dx, dy), 0.01);
      dx /= kl; dy /= kl;
      const len = r * Math.min(4.2, Math.max(1.6, 1.4 + 1.3 * kl / Math.max(key.z, 0.6)));
      const bound = Math.max(7.6 * r, len + 2.0 * r);
      k[i].set(dx, dy, len, bound * bound);
      x0 = Math.min(x0, fx - bound); x1 = Math.max(x1, fx + bound);
      y0 = Math.min(y0, fy - bound); y1 = Math.max(y1, fy + bound);
    }
    /* THE FIGHT'S POOL (round 21 graft): one warm ellipse over the feet of
       everybody in it, a little wider than they stand. FLOOR_FRAG bounds it
       by its own ellipse (2.2 radii, under 1%), NOT by growing the actors'
       box: the six-actor loop is the floor's cost and runs only in there. */
    if (x0 < x1) {
      let fx0 = Infinity, fy0 = Infinity, fx1 = -Infinity, fy1 = -Infinity;
      for (let i = 0; i < MAX_ACTORS; i++) {
        if (!(a[i].w > 0)) continue;
        fx0 = Math.min(fx0, a[i].x); fx1 = Math.max(fx1, a[i].x);
        fy0 = Math.min(fy0, a[i].y); fy1 = Math.max(fy1, a[i].y);
      }
      const cx = (fx0 + fx1) / 2, cy = (fy0 + fy1) / 2;
      const rx = (fx1 - fx0) * 0.50 + 2.0, ry = (fy1 - fy0) * 0.50 + 1.6;
      u.uStage.value.set(cx, cy, rx, ry);
    } else {
      u.uStage.value.set(0, 0, 1, 1);
    }
    if (x0 < x1) u.uActorBox.value.set(x0, y0, x1, y1);
    else u.uActorBox.value.set(1, 1, -1, -1);
  }

  /**
   * Draw a visible flame at every practical light. Called each frame: the flicker
   * that drives the illumination has to drive the source you can see, or the two
   * come apart and the room reads as lit by nothing.
   */
  syncFlames(rig) {
    const pos = this._flPos.array, col = this._flCol.array,
      par = this._flParam.array, sd = this._flSeed.array;
    /* A candle is drawn under a light that is a FLAME: warm, flickering and
       standing in the room. A cinematic key, a wisp and a cold moon spill are
       none of those, and a candle under any of them is a candle floating in
       mid-air with nothing holding it. */
    let k = 0;
    const ls = rig.lights;
    /* Only flag an attribute dirty when its contents actually moved. Of the four,
       only aParam.y (the flicker) changes on a normal frame — position, colour and
       seed are fixed per region and were being re-uploaded 60 times a second for
       nothing. Combined with DynamicDrawUsage above, this is what took syncFlames
       from 8.5 ms/frame to noise. */
    let dPos = false, dCol = false, dPar = false, dSeed = false;
    for (let i = 0; i < ls.length && k < MAX_FLAMES; i++) {
      const l = ls[i];
      /* ...and BELT AND BRACES on the cinematic pair. The comment above has
         said since round 2 that a key light casts no flame; the filter never
         said it, and the region data that did say it (`glow: 0`) was not being
         passed through by Atmosphere._buildLights. Both are fixed now, and a
         key light that someone later authors without a `glow` still draws
         nothing: `l.cine` is the fact, not the colour. */
      if (!l.enabled || l.cine || l.glow <= 0.001 || l.live <= 0.01) continue;
      const p3 = k * 3;
      if (pos[p3] !== l.pos.x || pos[p3 + 1] !== l.pos.y || pos[p3 + 2] !== l.pos.z) {
        pos[p3] = l.pos.x; pos[p3 + 1] = l.pos.y; pos[p3 + 2] = l.pos.z; dPos = true;
      }
      if (col[p3] !== l.color.r || col[p3 + 1] !== l.color.g || col[p3 + 2] !== l.color.b) {
        col[p3] = l.color.r; col[p3 + 1] = l.color.g; col[p3 + 2] = l.color.b; dCol = true;
      }
      const size = (0.16 + 0.030 * l.radius) * l.glowSize;
      const inten = l.glow * (0.55 + 0.75 * Math.min(l.live / 2.2, 1.4));
      const wick = (l.kind === 'warm' && l.flicker && !l.cine) ? 1 : 0;
      if (par[p3] !== size || par[p3 + 1] !== inten || par[p3 + 2] !== wick) {
        par[p3] = size; par[p3 + 1] = inten; par[p3 + 2] = wick; dPar = true;
      }
      /* Seeded by the light's place in THIS room's rig, not by `l.id`: ids
         come from a page-wide counter that keeps climbing with every room the
         page builds, so the same room's candles flickered in a different phase
         depending on how many rooms had been shown before it -- which is the
         one thing that made a room captured mid-batch differ from the same
         room in a fresh page (643 pixels, all flames; tools/room_batch.py). */
      const seed = (i + 1) * 0.37;
      if (sd[k] !== seed) { sd[k] = seed; dSeed = true; }
      k++;
    }
    if (dPos) this._flPos.needsUpdate = true;
    if (dCol) this._flCol.needsUpdate = true;
    if (dPar) this._flParam.needsUpdate = true;
    if (dSeed) this._flSeed.needsUpdate = true;
    this.flameGeo.instanceCount = k;
  }

  /** Every lit surface needs the eye position for its specular term. */
  syncCamera(pos, quat, camera) {
    /* A portal is drawn ON the lens, so it follows the eye exactly --
       breathing included -- and it is the size of the LIVE lens: the stage
       ramps its fov over 0.7 s from the last room's, and a window can be
       resized mid-fight. Within a hair of the built lens it keeps the built
       size exactly, so a settled frame is the frame it was built as. */
    if (quat && this._portalOn) {
      this.portalRig.position.copy(pos);
      this.portalRig.quaternion.copy(quat);
      const L = this._portalLens;
      if (L && camera) {
        const fov = Math.abs(camera.fov - L.fov) > 0.02 ? camera.fov : L.fov;
        const asp = Math.abs(camera.aspect - L.aspect) > 0.001 ? camera.aspect : L.aspect;
        if (fov !== L.fovNow || asp !== L.aspNow) this._sizePortals(fov, asp);
      }
    }
    this.wallMat.uniforms.uCamera.value.copy(pos);
    this.floorMat.uniforms.uCamera.value.copy(pos);
    this.ceilMat.uniforms.uCamera.value.copy(pos);
    this.propMat.uniforms.uCamera.value.copy(pos);
    for (const m of this.sides) m.material.uniforms.uCamera.value.copy(pos);
  }

  setDread(v) {
    for (const m of this.sides) m.material.uniforms.uDread.value = v;
    this.wallMat.uniforms.uDread.value = v;
    this.floorMat.uniforms.uDread.value = v;
    this.ceilMat.uniforms.uDread.value = v;
    this.propMat.uniforms.uDread.value = v;
    this.shaftMat.uniforms.uDread.value = v;
    this.flameMat.uniforms.uDread.value = v;
    for (const m of this.frames) m.material.uniforms.uDread.value = v;
    for (const m of this.portals) m.material.uniforms.uDread.value = v;
  }

  setSway(v) { this.propMat.uniforms.uSway.value = v; }

  update(dt, t) {
    for (const m of this.sides) m.material.uniforms.uTime.value = t;
    this.wallMat.uniforms.uTime.value = t;
    this.floorMat.uniforms.uTime.value = t;
    this.ceilMat.uniforms.uTime.value = t;
    this.propMat.uniforms.uTime.value = t;
    this.shaftMat.uniforms.uTime.value = t;
    this.flameMat.uniforms.uTime.value = t;
    for (const m of this.frames) m.material.uniforms.uTime.value = t;
    for (const m of this.portals) m.material.uniforms.uTime.value = t;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const m of this.sides) { m.geometry.dispose(); m.material.dispose(); }
    this.wall.geometry.dispose(); this.wallMat.dispose();
    for (const m of (this._pre || [])) m.dispose();
    this.floor.geometry.dispose(); this.floorMat.dispose();
    this.ceiling.geometry.dispose(); this.ceilMat.dispose();
    this.propGeo.dispose(); this.propMat.dispose();
    this.shadowGeo.dispose(); this.shadowMat.dispose();
    this.shaftGeo.dispose(); this.shaftMat.dispose();
    this.flameGeo.dispose(); this.flameMat.dispose();
    for (const m of this.frames) { m.geometry.dispose(); m.material.dispose(); }
    for (const m of this.portals) { m.geometry.dispose(); m.material.dispose(); }
  }
}

export const BACKDROP_CONST = { MAX_PROPS, MAX_SHAFTS, MAX_POOLS, FLOOR_FRONT, NLIGHT };
