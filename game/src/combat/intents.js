/**
 * Enemy intents and the intent queue. OWNER: combat-engine.
 *
 * The intent icon is the single most important read in the game, so its number is
 * computed with the SAME function that resolves the hit (damage.js
 * `previewDamageValue`). It is post-Strength, post-Weak, post-Vulnerable,
 * post-relic, post-Faint, and it re-renders the instant anything moves it.
 *
 * ── Dynamic moves win ───────────────────────────────────────────────────────
 * A MoveDef may carry `damageFn(c)`, `hitsFn(c)`, `blockFn(c)`, `splashFn(c)`, `intentFn(c)`,
 * `appliesFn(c)`, `addsCardsFn(c)`, `ruleFn(c)` and `alternatives(c)`. The engine
 * PREFERS them over the static `damage`/`hits`/`block`/`intent`/`applies`/
 * `addsCards`/`rule`. Most region enemies put their whole design in those functions
 * (Dust Bunny growth, Rocking Horse momentum, Porcelain Doll cracks), so reading
 * the static field would make the intent lie — the worst bug this game can have.
 *
 * ── The intent queue ────────────────────────────────────────────────────────
 * Every enemy has a PLAN: position 0 is the move it will resolve next, positions
 * 1..3 are what it intends after that. Wink can look into the plan (Preview),
 * predict its family (Read), and rearrange it (swap / postpone / delete).
 *
 * Move selection is deterministic *per position*: position k uses
 * `rng.fork('intent:<enemyId>:<absoluteIndex>')`, never the main stream. That has
 * three consequences that matter:
 *   • looking ahead costs nothing and cannot desync the fight,
 *   • a previewed future action is the action you actually get, unless the board
 *     changed the enemy's own reasoning (which the design doc explicitly allows,
 *     and which re-renders the revealed icon),
 *   • whether or not the player previews, the fight plays out identically.
 *
 * Positions the player has manipulated are LOCKED (`enemy.planLocked`) and stop
 * being re-derived until they are consumed, so a swap is not undone a tick later.
 * `move.anchored: true` marks a boss mechanic Wink may not move.
 */

import { EV } from './events.js';
import { Intent } from '../data/schema.js';
import { previewDamageValue } from './damage.js';
import { getStatus } from './statuses.js';

export const MAX_PLAN = 4;          // current + 3 future positions (Wink's cap)

/** Wink's four Intent Families. Every intent type maps to exactly one. */
export function intentFamily(type) {
  switch (type) {
    case Intent.ATTACK: case Intent.ATTACK_BIG: case Intent.ATTACK_DEFEND:
    case Intent.ATTACK_BUFF: case Intent.ATTACK_DEBUFF:
      return 'attack';
    case Intent.DEFEND: case Intent.DEFEND_BUFF:
      return 'defense';
    case Intent.BUFF: case Intent.DEBUFF: case Intent.STRONG_DEBUFF:
      return 'scheme';
    default:
      return 'special';   // summon / sleep / stun / escape / unknown
  }
}
/** Capitalised names, which is how wink.js writes them. */
export const FAMILY_LABEL = { attack: 'Attack', defense: 'Defense', scheme: 'Scheme', special: 'Special' };

export function isAttackIntent(type) { return intentFamily(type) === 'attack'; }

// ── plan derivation ─────────────────────────────────────────────────────────

/**
 * Resolve the move id for plan position `k`, deriving it if it is not already
 * locked or cached. Pure with respect to the main RNG.
 */
function deriveMoveId(engine, enemy, k) {
  const def = enemy.def;
  if (!def || typeof def.nextMove !== 'function') return null;
  const absolute = enemy.history.length + k;
  const ctx = engine.enemyCtx(enemy, null, {
    rng: engine.rng.fork(`intent:${enemy.id}:${absolute}`),
    history: enemy.history.concat(enemy.plan.slice(0, k).filter(Boolean)),
    planPosition: k,
  });
  let id = null;
  try { id = def.nextMove(ctx); } catch (err) { console.error(`[combat] ${enemy.defId}.nextMove threw`, err); }
  if (id && !(def.moves && def.moves[id])) {
    console.warn(`[combat] enemy ${enemy.defId} planned unknown move "${id}"`);
    id = null;
  }
  return id;
}

/**
 * Bring `enemy.plan` up to `depth` entries, re-deriving every unlocked position.
 * Called on every intent refresh, so a reactive enemy keeps its plan honest.
 */
export function rebuildPlan(engine, enemy, depth = MAX_PLAN) {
  if (!enemy.alive) { enemy.plan.length = 0; enemy.pendingMove = null; return; }
  for (let k = 0; k < depth; k++) {
    if (k < enemy.planLocked && enemy.plan[k]) continue;
    enemy.plan[k] = deriveMoveId(engine, enemy, k);
  }
  enemy.plan.length = depth;
  const id = enemy.plan[0];
  const raw = id && enemy.def?.moves ? enemy.def.moves[id] : null;
  enemy.pendingMove = raw ? { id, ...raw } : null;
  // An override replaces the CURRENT action only, and it is not in def.moves —
  // it is supplied whole by whoever substituted it (Boggle's Search). It is
  // applied after the derive so a rebuild cannot quietly undo it, and cleared
  // by consumePlan once it has resolved.
  if (enemy.intentOverride) enemy.pendingMove = { ...enemy.intentOverride };
}

/** Advance the plan by one after a move resolves. */
export function consumePlan(enemy) {
  enemy.intentOverride = null;
  enemy.plan.shift();
  enemy.plan.push(null);
  enemy.planLocked = Math.max(0, enemy.planLocked - 1);
  enemy.previewDepth = Math.max(0, enemy.previewDepth - 1);
  // "No Such Thing as Random": this enemy's plan stays revealed and stays put.
  if (enemy.intentControlled) {
    enemy.previewDepth = MAX_PLAN - 1;
    enemy.planLocked = MAX_PLAN;
  }
}

/**
 * Wink's `No Such Thing as Random`. The card promises the player picks whenever
 * the AI would roll; the engine has no player-facing prompt inside the (sync)
 * planning path, so what it does instead is take the roll away entirely: the
 * enemy's whole plan is revealed to Wink's maximum depth and LOCKED, so every
 * future position stops being re-derived and what she sees is exactly what she
 * gets. See docs/NOTES.md — a true "you pick the branch" prompt needs an
 * enemy-turn choice UI that does not exist yet.
 */
export function setIntentControl(engine, enemy, on = true) {
  if (!enemy) return false;
  enemy.intentControlled = !!on;
  if (!on) return true;
  rebuildPlan(engine, enemy);
  enemy.previewDepth = MAX_PLAN - 1;
  enemy.planLocked = MAX_PLAN;
  afterQueueEdit(engine, enemy, 'control');
  return true;
}

/**
 * Wink's `Forked Future`. Both branches are already Previewed, so the choice is
 * made with full information: whichever the player picks becomes the next
 * action and the other stays queued behind it. Resolves to the chosen position.
 */
export async function forkFuture(engine, enemy) {
  if (!enemy || !enemy.alive) return -1;
  rebuildPlan(engine, enemy);
  if (!enemy.plan[1] || !enemy.plan[2]) return -1;
  if (isAnchored(enemy, 1) || isAnchored(enemy, 2)) return -1;
  const opts = [1, 2].map(k => {
    const i = buildIntent(engine, enemy, moveAt(enemy, k), { position: k });
    return { label: `${i.name || enemy.name}${i.damage ? ` — ${i.damage}${i.hits > 1 ? `x${i.hits}` : ''}` : ''}` };
  });
  const picked = await engine.choices.ask({
    kind: 'option', pool: opts, count: 1,
    prompt: `Which does ${enemy.name} do next?`,
    meta: { enemyId: enemy.id, fork: true },
  });
  const which = Array.isArray(picked) ? (picked[0] ?? 0) : 0;
  if (which === 1) swapIntents(engine, enemy, 1, 2);
  else { lock(enemy, 2); afterQueueEdit(engine, enemy, 'fork'); }
  return which + 1;
}

function lock(enemy, upTo) { enemy.planLocked = Math.max(enemy.planLocked, upTo + 1); }

export function moveAt(enemy, k) {
  const id = enemy.plan[k];
  const raw = id && enemy.def?.moves ? enemy.def.moves[id] : null;
  return raw ? { id, ...raw } : null;
}

export function isAnchored(enemy, k) {
  const m = moveAt(enemy, k);
  return !!(m && m.anchored);
}

// ── intent construction ─────────────────────────────────────────────────────

/**
 * Build the display intent for a move. Pure — no mutation, no events.
 * Dynamic `*Fn` variants always win over the static fields.
 */
export function buildIntent(engine, enemy, move, opts = {}) {
  if (!move) {
    return {
      type: Intent.UNKNOWN, family: 'special', familyLabel: 'Special', moveId: null, name: '???',
      damage: 0, hits: 0, totalDamage: 0, block: 0, statuses: [],
      addsCards: [], rule: null,
      tell: '', tooltip: 'You cannot tell what it is about to do.', targetId: null,
      anchored: false, revealed: true, position: opts.position ?? 0,
    };
  }

  const c = engine.enemyCtx(enemy, move, { planPosition: opts.position ?? 0, forecast: (opts.position ?? 0) > 0 });

  // Dynamic first. A static value is only a fallback.
  const type = pick(move.intentFn, c, move.intent) || Intent.UNKNOWN;
  let base = pick(move.damageFn, c, move.damage) ?? 0;
  let hits = pick(move.hitsFn, c, move.hits);
  const blockRaw = pick(move.blockFn, c, move.block) ?? 0;

  if (hits == null) hits = base > 0 ? 1 : 0;
  hits = Math.max(0, hits | 0);

  const defender = engine.intentTargetFor(enemy);
  const damage = (hits > 0 && base > 0 && defender)
    ? previewDamageValue(engine, enemy, defender, base, { kind: 'attack', pierce: !!move.pierce })
    : 0;

  const block = blockRaw > 0 ? engine.previewBlockValue(enemy, blockRaw, { fromCard: false }) : 0;

  /**
   * `splash` — what EVERY OTHER seat takes from a move whose main number
   * belongs to one Kid.
   *
   * The Bedframe Beast's BOO is the case the field exists for: "That player
   * receives the full BOO. All other players receive 4 plus 3 per Scare
   * damage." One `damage` and one `targetId` cannot say that, and a move that
   * quietly hits a seat with no arrow on it breaks the promise the whole intent
   * system exists to keep. Zero — and absent from the intent — in solo and for
   * every move that does not declare it, so nothing that reads an intent today
   * sees a new field unless a party is on the board.
   */
  const splashRaw = pick(move.splashFn, c, move.splash) ?? 0;

  const applies = (typeof move.appliesFn === 'function' ? safe(move.appliesFn, c) : move.applies) || [];
  // Carry `icon` through with name/kind. The renderer draws the pip straight
  // from this; without the icon Roused (icon `bell-small`) fell back to a `?`,
  // which on an intent reads as "unknown intent". An unregistered status has no
  // real icon, so leave the field off and let the renderer pick its fallback.
  const statuses = applies.map(a => {
    const def = getStatus(a.id);
    const s = {
      id: a.id, stacks: a.stacks ?? 1, to: a.to || 'player',
      name: def.name, kind: def.kind,
    };
    if (def.icon && !def._missing) s.icon = def.icon;
    return s;
  });

  // Deck pollution is a threat and belongs on the chip. Pack Wrong was rendering
  // a bare "5" -- its GUARD -- under a debuff icon, and never mentioned the
  // Clutter, which is the entire point of the move. Entries are grouped by
  // (id, pile) and COUNTED, so a move that adds two of something says 2.
  const addsRaw = (typeof move.addsCardsFn === 'function' ? safe(move.addsCardsFn, c) : move.addsCards) || [];
  const addsCards = groupCards(engine, addsRaw);

  // A House Rule is the whole content of some intents (Door Greeter showed a
  // bare "DEBUFF" with no magnitude and no duration). `ruleFn` lets an enemy
  // that alternates rules name the one it is actually about to announce.
  const ruleRef = (typeof move.ruleFn === 'function' ? safe(move.ruleFn, c) : move.rule) || null;
  const rule = ruleRef ? engine.resolveRule(ruleRef) : null;

  const family = intentFamily(type);
  const intent = {
    type, family, familyLabel: FAMILY_LABEL[family],
    moveId: move.id, name: move.name || move.id,
    damage, hits, totalDamage: damage * hits,
    baseDamage: base,
    block, statuses, addsCards, rule,
    tell: typeof move.tellFn === 'function' ? (safe(move.tellFn, c) || '') : (move.tell || ''),
    targetId: defender ? defender.id : null,
    anchored: !!move.anchored,
    position: opts.position ?? 0,
    revealed: opts.revealed !== false,
    tooltip: '',
  };
  if (splashRaw > 0) intent.splash = splashRaw;
  intent.tooltip = intentTooltip(intent, enemy);
  return intent;
}

/**
 * Collapse `[{id,pile},{id,pile}]` into `[{id,name,pile,count}]`, resolving the
 * card name through the engine's registry so the chip can say CLUTTER rather
 * than `clutter`. An entry may carry its own `count`.
 */
function groupCards(engine, list) {
  const out = [];
  const byKey = new Map();
  for (const raw of (Array.isArray(list) ? list : [list])) {
    if (!raw) continue;
    const entry = typeof raw === 'string' ? { id: raw } : raw;
    if (!entry.id) continue;
    const pile = entry.pile || 'discard';
    const key = `${entry.id}/${pile}`;
    const n = Math.max(1, entry.count ?? 1);
    const hit = byKey.get(key);
    if (hit) { hit.count += n; continue; }
    const def = engine.resolveCardDef(entry.id);
    const rec = { id: entry.id, name: (def && def.name) || entry.id, pile, count: n };
    byKey.set(key, rec);
    out.push(rec);
  }
  return out;
}

function pick(fn, ctx, staticValue) {
  if (typeof fn === 'function') {
    const v = safe(fn, ctx);
    if (v !== undefined && v !== null) return v;
  }
  return staticValue;
}
function safe(fn, ctx) {
  try { return fn(ctx); } catch (err) { console.error('[combat] dynamic intent fn threw', err); return undefined; }
}

/** Plain-language sentence for the intent hover. Never leaves a number implicit. */
export function intentTooltip(intent, enemy) {
  const parts = [];
  if (intent.hits > 1 && intent.damage > 0) {
    parts.push(`Attacks ${intent.hits} times for ${intent.damage} damage each (${intent.totalDamage} total).`);
  } else if (intent.damage > 0) {
    parts.push(`Attacks for ${intent.damage} damage.`);
  }
  if (intent.block > 0) parts.push(`Gains ${intent.block} Guard.`);
  for (const s of intent.statuses) {
    const who = s.to === 'self' ? (enemy?.name || 'itself') : s.to === 'allEnemies' ? 'its allies' : 'you';
    parts.push(`Applies ${s.stacks} ${s.name} to ${who}.`);
  }
  for (const a of (intent.addsCards || [])) {
    const where = a.pile === 'draw' ? 'your draw pile' : a.pile === 'hand' ? 'your hand' : 'your discard pile';
    parts.push(`Puts ${a.count} ${a.name} into ${where}.`);
  }
  if (intent.rule) {
    parts.push(`Announces a House Rule: ${intent.rule.name}.${intent.rule.text ? ' ' + intent.rule.text : ''}`);
  }
  if (parts.length === 0) {
    switch (intent.type) {
      case Intent.SLEEP: parts.push('Asleep. It does nothing this turn.'); break;
      case Intent.STUN: parts.push('Stunned. It does nothing this turn.'); break;
      case Intent.ESCAPE: parts.push('Preparing to flee.'); break;
      case Intent.SUMMON: parts.push('Calling for help.'); break;
      case Intent.UNKNOWN: parts.push('You cannot tell what it is about to do.'); break;
      default: parts.push(intent.name); break;
    }
  }
  if (intent.anchored) parts.push('Anchored — this action cannot be rearranged.');
  if (intent.tell) parts.push(intent.tell);
  return parts.join(' ');
}

/** Two intents are the same render if every displayed field matches. */
export function sameIntent(a, b) {
  if (!a || !b) return a === b;
  if (a.type !== b.type || a.moveId !== b.moveId) return false;
  if (a.damage !== b.damage || a.hits !== b.hits || a.block !== b.block) return false;
  if (a.anchored !== b.anchored) return false;
  // Compare what is DRAWN, not just what it points at: registering a rule's real
  // text, or a card's display name, changes the chip and must re-render.
  const ar = a.rule, br = b.rule;
  if (!!ar !== !!br) return false;
  if (ar && (ar.id !== br.id || ar.name !== br.name || ar.text !== br.text)) return false;
  const ac = a.addsCards || [], bc = b.addsCards || [];
  if (ac.length !== bc.length) return false;
  for (let i = 0; i < ac.length; i++) {
    if (ac[i].id !== bc[i].id || ac[i].count !== bc[i].count
      || ac[i].pile !== bc[i].pile || ac[i].name !== bc[i].name) return false;
  }
  if (a.statuses.length !== b.statuses.length) return false;
  for (let i = 0; i < a.statuses.length; i++) {
    if (a.statuses[i].id !== b.statuses[i].id || a.statuses[i].stacks !== b.statuses[i].stacks) return false;
  }
  return true;
}

function sameQueue(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].moveId !== b[i].moveId || a[i].family !== b[i].family || a[i].revealed !== b[i].revealed) return false;
  }
  return true;
}

/** The revealed slice of an enemy's plan, as plain data for the renderer. */
export function queueSnapshot(engine, enemy) {
  const out = [];
  const depth = Math.min(MAX_PLAN, 1 + (enemy.previewDepth || 0));
  for (let k = 0; k < depth; k++) {
    const m = moveAt(enemy, k);
    if (!m && k > 0) break;
    const it = buildIntent(engine, enemy, m, { position: k, revealed: true });
    out.push({
      position: k, moveId: it.moveId, name: it.name, type: it.type,
      family: it.family, familyLabel: it.familyLabel,
      damage: it.damage, hits: it.hits, block: it.block,
      addsCards: it.addsCards.map(x => ({ ...x })), rule: it.rule ? { ...it.rule } : null,
      anchored: it.anchored, revealed: true, tooltip: it.tooltip,
    });
  }
  // Only the REVEALED slice is returned. The renderer knows how many hidden
  // slots to draw from `MAX_PLAN - out.length`; putting placeholder entries in
  // here made `queue[1]` mean two different things depending on Preview depth.
  return out;
}

/**
 * Recompute every living enemy's plan and displayed intent. Emits `intent` only
 * where the rendering actually changed, so the renderer can animate every one.
 */
export function refreshIntents(engine, reason = 'refresh') {
  for (const en of engine.enemies) {
    if (!en.alive) { en.intent = null; en.queue = []; continue; }
    rebuildPlan(engine, en);
    const next = buildIntent(engine, en, en.pendingMove, { position: 0 });
    const q = queueSnapshot(engine, en);
    const changed = !sameIntent(en.intent, next) || !sameQueue(en.queue, q);
    if (changed) {
      const prev = en.intent;
      en.intent = next;
      en.queue = q;
      engine._emit(EV.INTENT, {
        enemyId: en.id, intent: { ...next }, previous: prev ? { ...prev } : null,
        queue: q.map(x => ({ ...x })), reason,
      });
    }
  }
}

/** Force a fresh choice for an enemy (combat start, summon, after resolving). */
export function chooseMove(engine, enemy, reason = 'turn') {
  if (!enemy.alive) return null;
  rebuildPlan(engine, enemy);
  engine.hooks.dispatch('onIntentChosen', { enemy, move: enemy.pendingMove });
  const next = buildIntent(engine, enemy, enemy.pendingMove, { position: 0 });
  const prev = enemy.intent;
  enemy.intent = next;
  enemy.queue = queueSnapshot(engine, enemy);
  engine._emit(EV.INTENT, {
    enemyId: enemy.id, intent: { ...next }, previous: prev ? { ...prev } : null,
    queue: enemy.queue.map(x => ({ ...x })), reason,
  });
  return enemy.pendingMove;
}

// ── player-facing queue manipulation (Wink) ─────────────────────────────────

/** Reveal `n` more future positions. Returns how many were newly revealed. */
export function previewIntent(engine, enemy, n = 1) {
  if (!enemy || !enemy.alive) return 0;
  const before = enemy.previewDepth || 0;
  const got = Math.max(0, Math.min(n, (MAX_PLAN - 1) - before));
  if (!got) return 0;
  enemy.previewDepth = before + got;
  rebuildPlan(engine, enemy);
  engine._emit(EV.INTENT_QUEUE, {
    enemyId: enemy.id, action: 'preview', depth: enemy.previewDepth,
    queue: queueSnapshot(engine, enemy),
  });
  engine.refreshIntents('preview');
  return got;
}

export function previewDepthOf(enemy) { return enemy?.previewDepth || 0; }

/** Families of the revealed FUTURE positions (position 1 onward). */
export function previewedFamilies(engine, enemy) {
  const q = queueSnapshot(engine, enemy);
  return q.slice(1).filter(x => x.revealed).map(x => x.familyLabel);
}

/** Swap two plan positions. Refuses if either is Anchored. */
export function swapIntents(engine, enemy, a, b) {
  if (!enemy || a === b) return false;
  if (a < 0 || b < 0 || a >= MAX_PLAN || b >= MAX_PLAN) return false;
  if (isAnchored(enemy, a) || isAnchored(enemy, b)) return false;
  if (!enemy.plan[a] || !enemy.plan[b]) return false;
  const t = enemy.plan[a]; enemy.plan[a] = enemy.plan[b]; enemy.plan[b] = t;
  lock(enemy, Math.max(a, b));
  afterQueueEdit(engine, enemy, 'swap');
  return true;
}

/** Push the current action to the back of the plan; everything else moves up. */
export function postponeIntent(engine, enemy) {
  if (!enemy || isAnchored(enemy, 0) || !enemy.plan[0]) return false;
  const cur = enemy.plan.shift();
  const last = enemy.plan.filter(Boolean).length;
  enemy.plan.splice(Math.min(last, MAX_PLAN - 1), 0, cur);
  enemy.plan.length = MAX_PLAN;
  lock(enemy, MAX_PLAN - 1);
  afterQueueEdit(engine, enemy, 'postpone');
  return true;
}

/** Remove the current action entirely. The next one becomes current. */
export function deleteIntent(engine, enemy) {
  if (!enemy || isAnchored(enemy, 0) || !enemy.plan[0]) return false;
  enemy.plan.shift();
  enemy.plan.push(null);
  enemy.previewDepth = Math.max(0, enemy.previewDepth - 1);
  // Everything still in the plan was chosen by the player's edit — freeze it, or
  // the very next rebuild would derive the deleted action straight back in.
  enemy.planLocked = Math.max(enemy.planLocked, enemy.plan.filter(Boolean).length);
  afterQueueEdit(engine, enemy, 'delete');
  return true;
}

/**
 * Replace the CURRENT action with a supplied move, for this turn only.
 *
 * Unlike swap/postpone/delete this does not reorder anything: the original
 * action is spent, exactly as `deleteIntent` spends it, and something else
 * happens in its place. Boggle's Search is the reason it exists — an Unaware
 * enemy with a directed Attack aimed only at him stops attacking and looks for
 * him instead, and the design requires the intent display to change the moment
 * he hides rather than when the enemy acts.
 *
 * `move` is a whole move object ({ id, name, intent, effect }), NOT an id:
 * Search is not in any enemy's `def.moves` and must not have to be.
 * Anchored actions refuse, like every other edit.
 */
export function overrideIntent(engine, enemy, move) {
  if (!enemy || !move) return false;
  if (isAnchored(enemy, 0)) return false;
  enemy.intentOverride = { ...move };
  afterQueueEdit(engine, enemy, 'override');
  return true;
}

/** Drop a pending override without resolving it (the enemy stopped being Unaware). */
export function clearIntentOverride(engine, enemy) {
  if (!enemy || !enemy.intentOverride) return false;
  enemy.intentOverride = null;
  afterQueueEdit(engine, enemy, 'override-clear');
  return true;
}

function afterQueueEdit(engine, enemy, action) {
  rebuildPlan(engine, enemy);
  enemy.queue = queueSnapshot(engine, enemy);
  engine._emit(EV.INTENT_QUEUE, {
    enemyId: enemy.id, action, depth: enemy.previewDepth,
    queue: enemy.queue.map(x => ({ ...x })),
  });
  engine.refreshIntents(action);
}
