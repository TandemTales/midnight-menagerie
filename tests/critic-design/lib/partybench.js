/**
 * A BOSS with FRIENDS, against decks real expeditions carried. OWNER: balance.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * Neither existing harness can see a boss's party behaviour, and the gap is
 * exactly the shape of the thing co-op scaling is built on:
 *
 *   `bench()` next door builds a SOLO Run — one Kid, one captured loadout. It
 *   is the right instrument for the solo A/B and it cannot seat a second Kid.
 *
 *   `tests/coop/balance.html` seats four Kids and fights the STANDARD tier with
 *   10-card STARTING decks. Point it at the boss and the Butler holds
 *   165 x 5.7 = 940 Courage against four tutorial decks: that measures a floor,
 *   not a change. Every party size reads ~0% and every edit looks identical.
 *
 * So AoE coverage — the ONLY lever co-op has, because enemy damage deliberately
 * never scales with party size (regions/01-foyer.md §26) — was unmeasurable
 * before this file. "Do not ship a guess" needs an instrument that can see the
 * guess being wrong.
 *
 * ── What it does ────────────────────────────────────────────────────────────
 * Seats N captured pre-boss loadouts in ONE real `Run` (`new Run({ kids })`) and
 * drives every seat with the same competent bot, each ending its own turn — the
 * loop from `tests/coop/balance.html`, against real decks instead of starting
 * ones. Nothing here re-implements the game: the Run builds the fight, the
 * engine resolves it, and the bot plays it.
 *
 * ── Reading the output ──────────────────────────────────────────────────────
 * `left` is the party's leftover Courage as a fraction of the party's MAXIMUM,
 * over wins only. That is the number the party-of-four round left open: at
 * matched win rates a bigger party finishes far healthier (26% solo -> 62% at
 * 4p), and closing that gap without lengthening the fight is what AoE coverage
 * is for. A flat `left` across party sizes is the target; a rising one means
 * bringing friends still buys safety the curve is not charging for.
 */
import { Run } from '/game/src/state/run.js';
import { NodeType, REGION_ORDER } from '/game/src/data/schema.js';
import { expedition } from './expedition.js';
import { competentTurn } from './bot.js';

export const PARTY_MAX_TURNS = 60;

/** Four different Kids, so nothing in the run layer can key off a shared slug. */
const KID_SLUGS = ['maya', 'eli', 'priya', 'jordan'];

/**
 * Capture pre-boss loadouts, one pool per Companion.
 *
 * A loadout is a DECK, so it belongs to the Companion that drafted it — seating
 * a Marmalade deck under a Bones Kid would build a run with cards its trackers
 * never registered. `snapshotLoadout` does not record the Companion (it never
 * had to, being solo), so it is tagged on here at the point where it is known.
 */
export async function generateLoadouts({ gen = 8, seed = 90000, slugs = ['marmalade'],
                                         region = 'foyer', policy = 'balanced',
                                         haunt = 0, tier = 'boss', onProgress = null } = {}) {
  const pools = {};
  const errors = [];
  for (const slug of slugs) {
    const pool = [];
    for (let i = 0; i < gen; i++) {
      try {
        const r = await expedition({ seed: seed + i * 7, bot: 'competent', policy, haunt, companion: slug });
        const g = (r.regions || []).find(x => x.region === region);
        if (!g) continue;
        const l = tier === 'boss' ? g.loadoutAtBoss : (g.loadoutAtFirstElite || g.loadoutAtBoss);
        if (l) pool.push({ ...l, companion: slug });
      } catch (e) { errors.push(`gen ${slug} ${i}: ${e && e.message || e}`); }
      onProgress?.(slug, i + 1, gen, pool.length);
    }
    pools[slug] = pool;
  }
  return { pools, errors };
}

/** Seat i's loadout: alternate Companions so a party is not four of one deck. */
export function seatLoadouts(pools, slugs, size, offset = 0) {
  const out = [];
  for (let i = 0; i < size; i++) {
    const slug = slugs[i % slugs.length];
    const pool = pools[slug] || [];
    if (!pool.length) return null;
    out.push(pool[(offset + i) % pool.length]);
  }
  return out;
}

/** A what-if lever for sweeps ONLY, matching `bench`. Shipping numbers live in the defs. */
function scaleHp(engine, mul) {
  if (!mul || mul === 1) return;
  for (const en of engine.enemies) {
    en.maxHp = Math.max(1, Math.round(en.maxHp * mul));
    en.hp = Math.max(1, Math.round(en.hp * mul));
  }
}

/**
 * One fight: `size` Kids, each carrying a captured loadout, against one tier.
 *
 * The dev seam guard is left ARMED by default (it is on at localhost anyway).
 * `balance.html` disarms it on purpose, reasoning that a throw mid-fight biases
 * the win rate toward whichever party size tripped it — which is true, and the
 * answer here is to COUNT the throws and report them rather than to stop
 * hearing about them. A measurement with `botErrors > 0` is not a measurement,
 * and this way it says so instead of quietly reading low.
 */
export async function partyBench({ loadouts, size = 1, seed = 1, region = 'foyer',
                                   tier = 'boss', encounterId = null, haunt = 0,
                                   maxTurns = PARTY_MAX_TURNS, hpScale = 1,
                                   fullCourage = false, clutter = true } = {}) {
  const kids = [];
  for (let i = 0; i < size; i++) {
    kids.push({ companion: loadouts[i].companion, kid: KID_SLUGS[i % KID_SLUGS.length] });
  }
  const run = new Run({ seed, kids, hauntLevel: haunt });
  run.ephemeral = true;

  // Bench a later region's door, exactly as `bench()` does: `_buildCombat`
  // resolves formations through `this.region`, so moving the Run up the ladder
  // is the whole of it.
  if (region && region !== run.region) {
    const idx = REGION_ORDER.indexOf(region);
    if (idx < 0) throw new Error(`[partyBench] unknown region ${region}`);
    run.regionIndex = idx;
    run.region = region;
  }
  run.encounterHistory = [];

  /* Load each seat through `setLocalSeat`, so every per-Kid field is written by
     the same accessor the screens use. Card uids are namespaced per seat: two
     Kids holding the same uid is the bug `tests/coop/selectscreen.py` exists to catch. */
  for (let i = 0; i < size; i++) {
    run.setLocalSeat(i);
    const l = loadouts[i];
    run.deck = l.deck.map((c, j) => ({ uid: `b${i}_${j}`, id: c.id, upgraded: !!c.upgraded }));
    run.keepsakes = [];
    for (const id of l.keepsakes) run.addKeepsake(id);
    run.snacks = l.snacks.map(s => ({ ...s }));
    run.maxCourage = l.maxCourage;
    run.courage = fullCourage ? l.maxCourage : l.courage;
  }
  run.setLocalSeat(0);

  const type = tier === 'boss' ? NodeType.BOSS
    : tier === 'elite' ? NodeType.BIG_SCARE : NodeType.SCUFFLE;
  /**
   * The node id is NOT cosmetic: `run.buildCombat` seeds the fight with
   * `this.fork(`combat:${node.id}`)`, so it decides the shuffle, the opening
   * hand and every enemy roll. Naming it `pbench-…` gave this harness a
   * different fight from `bench()` for the same loadout and seed, which read as
   * a disagreement between the two harnesses and was only ever a different
   * stream. It uses `bench()`'s id so that the size-1 row here reproduces
   * `sweep.py` exactly — the anchor that says this instrument is sound.
   */
  const node = { id: `bench-${seed}`, row: 11 };
  let engine = await run.buildCombat(node, type);
  if (encounterId && run.combatMeta.encounter !== encounterId) {
    for (let k = 0; k < 60 && run.combatMeta.encounter !== encounterId; k++) {
      engine = await run.buildCombat({ id: `bench-${seed}-${k}`, row: 11 }, type);
    }
  }
  scaleHp(engine, hpScale);

  const meta = { ...run.combatMeta };
  const enemyHp = engine.enemies.reduce((n, x) => n + x.maxHp, 0);

  /* Damage bookkeeping per seat. `damage` carries sourceId/targetId — NOT
     attacker/defender, which belong to the onCourageLoss / onIncomingHit HOOK
     payloads (CONTRACTS trap 26). */
  const takenBySeat = new Array(size).fill(0);
  const hitsBySeat = new Array(size).fill(0);
  /**
   * What the party's GUARD ate, per seat — the other half of `takenBySeat`.
   *
   * "Four Kids finish this boss holding 89% of their Courage" has two very
   * different explanations and they want opposite fixes: the boss is not
   * SWINGING enough (a content problem — too many DEFEND turns, too little
   * coverage), or it is swinging plenty and every point is being blocked (a
   * Guard-budget problem, which no damage number fixes because four Kids
   * generate four Kids' worth of Guard while one or two are targeted).
   * `blocked + taken` is what the boss actually aimed; `taken` alone is what it
   * achieved. Without both, the difference is invisible and the leftover-Courage
   * gap reads as "make the numbers bigger".
   */
  const blockedBySeat = new Array(size).fill(0);
  const seatIndexById = new Map(engine.players.map((p, i) => [p.id, i]));
  let enemyGuard = 0;
  let partyGuard = 0;
  engine.on('damage', (ev) => {
    const i = seatIndexById.get(ev.targetId);
    if (i == null) return;
    takenBySeat[i] += ev.hpLoss || 0;
    blockedBySeat[i] += ev.blocked || 0;
    if ((ev.hpLoss || 0) > 0 || (ev.blocked || 0) > 0) hitsBySeat[i]++;
  });
  engine.on('block', (ev) => {
    if (seatIndexById.has(ev.actorId)) partyGuard += ev.amount || 0;
    else enemyGuard += ev.amount || 0;
  });

  await engine.startCombat();

  const errors = [];
  /* One running estimate PER SEAT: the bot projects the rest of the fight from
     it, and sharing one object between four Kids would have every seat planning
     against the last seat's threat picture. */
  const fcs = engine.players.map(() => ({ dps: 10, threat: 8, guard: 4, peak: 0, turns: 0 }));
  const snackFor = (pl) => {
    const k = run.kids[seatIndexById.get(pl.id) ?? 0];
    return k ? k.snacks : null;
  };
  /* A Snack is a LIMITED resource. `bench` removes the eaten one through this
     callback; without it the bot re-eats the same Snack every turn for the
     whole fight and the harness measures a party that cannot run out. */
  const onSnackFor = (pl) => (i, s) => {
    const k = run.kids[seatIndexById.get(pl.id) ?? 0];
    if (!k || !Array.isArray(k.snacks)) return;
    const at = k.snacks.indexOf(s);
    if (at >= 0) k.snacks.splice(at, 1);
  };

  let turns = 0;
  while (!engine.over && turns < maxTurns) {
    turns++;
    const roundTurn = engine.turn;
    // Every seat plans and ends its OWN turn — simultaneous turns for real.
    for (const pl of engine.livingPlayers()) {
      const i = seatIndexById.get(pl.id) ?? 0;
      try {
        await competentTurn(engine, {
          seat: pl, snacks: snackFor(pl), onSnack: onSnackFor(pl), fc: fcs[i],
        });
      } catch (err) {
        errors.push(`seat ${i} turn ${turns}: ${err && err.message || err}`);
      }
      if (engine.over) break;
      await engine.endTurn(pl);
      if (engine.over) break;
    }
    /**
     * Close the table ONLY if this round did not already close itself.
     *
     * `endTurn(seat)` runs the enemy phase the moment the LAST seat ends and
     * then opens the next player turn, so after the loop above `tableReady` is
     * false again and `phase` is 'player' again — for the NEW round. Ending it
     * here burns a turn nobody has played and runs a SECOND enemy phase.
     * `tests/coop/balance.html` shipped exactly that, and counting
     * `phase:'enemy'` per round reads [2,2,2,2] unguarded against [1,1,1,1]
     * guarded, at every party size including solo. `engine.turn` is what
     * separates "the round never resolved" from "the next one has begun".
     */
    if (!engine.over && !engine.tableReady && engine.phase === 'player'
        && engine.turn === roundTurn) {
      await engine.endTurn();
    }
  }

  const hp = engine.players.reduce((n, p) => n + Math.max(0, p.hp), 0);
  const maxHp = engine.players.reduce((n, p) => n + p.maxHp, 0);
  const courageAtDoor = loadouts.slice(0, size).reduce((n, l) => n + l.courage, 0);
  return {
    ...meta,
    size, seed,
    win: !!engine.victory,
    turns,
    timeout: turns >= maxTurns && !engine.over,
    fallen: engine.players.filter(p => p.fallen).length,
    courageLeft: maxHp ? hp / maxHp : 0,
    courageCost: courageAtDoor - hp,
    takenBySeat, hitsBySeat, blockedBySeat,
    /* What the boss AIMED at the party, and what its Guard budget stopped. */
    aimed: takenBySeat.reduce((a, b) => a + b, 0) + blockedBySeat.reduce((a, b) => a + b, 0),
    blocked: blockedBySeat.reduce((a, b) => a + b, 0),
    partyGuard,
    /* The AoE reading. With every move single-target the damage piles onto one
       or two seats; spreading it is the whole point of the lever. */
    spread: spreadOf(takenBySeat),
    enemyHp, enemyGuard,
    botErrors: errors.length, errors: errors.slice(0, 4),
  };
}

/**
 * How evenly incoming damage was shared, 0..1.
 *
 * 1.0 = every seat took the same; 0 = one seat took all of it. Solo is 1.0 by
 * definition and is not interesting; the number exists so "he now has AoE" is
 * something the harness can SEE rather than something the diff claims.
 */
export function spreadOf(taken) {
  const n = taken.length;
  if (n <= 1) return 1;
  const total = taken.reduce((a, b) => a + b, 0);
  if (total <= 0) return 1;
  const even = total / n;
  const dev = taken.reduce((a, t) => a + Math.abs(t - even), 0) / (2 * total * (n - 1) / n);
  return Math.max(0, 1 - dev);
}

export default { partyBench, generateLoadouts, seatLoadouts, spreadOf };
