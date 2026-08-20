/**
 * Dev-mode seam guard. OWNER: combat-engine.
 *
 * CONTRACTS.md rule 8 exists because `ctx.loseHp?.(…)` on a payload with no
 * `loseHp` is *silence*, and silence in a card effect is indistinguishable from
 * "the designer wanted nothing to happen". Marmalade's Haunt dealt zero damage
 * for an entire build that way; "Ignores Guard" passed `{pierceBlock:true}` into
 * a pipeline that reads `pierce` and nobody noticed for as long.
 *
 * `tests/seams/check.py` catches both shapes statically. This is the runtime
 * half: in dev, the objects handed across those seams throw on a member they do
 * not define, so the next one is a stack trace on the first play instead of a
 * mechanic that quietly does nothing.
 *
 * ── Cost ────────────────────────────────────────────────────────────────────
 * One Proxy allocation per guarded object, and only while the guard is armed.
 * `guardFactory()` resolves the flag ONCE and returns either `_wrap` or the
 * identity function, so a shipped build does no per-property work at all — the
 * hot path is a single already-resolved function reference. Nothing is
 * allocated per property read in either mode.
 *
 * ── Armed when ──────────────────────────────────────────────────────────────
 *   `?debug` / `#debug` in the URL, hostname localhost / 127.0.0.1, or
 *   `new CombatEngine({ strictCtx: true })`.  Force off with `?strictCtx=0`.
 */

/**
 * Members a guarded object is ALLOWED not to have. Three kinds live here, and
 * adding a fourth is a deliberate act — write the reason beside the name.
 *   1. language / host internals (`then` is checked by `await`, devtools probe
 *      a handful of others),
 *   2. sanctioned feature detection — `if (c.removeDebuff) … else …` is the
 *      approved alternative to `?.` and has to keep working,
 *   3. `enemyCtx({...extra})` fields that only exist for the lifecycle callback
 *      that passes them.
 */
export const CTX_SOFT_KEYS = new Set([
  // 1. language / host internals
  'then', 'catch', 'finally', 'toJSON', 'constructor', 'prototype', 'length',
  'name', 'inspect', 'nodeType', 'hasOwnProperty', 'valueOf', 'toString',
  'splice', 'call', 'apply', 'bind', '$$typeof', 'tagName',
  // 2. sanctioned feature detection (data/companions/_util.js, bosses, wink)
  'removeDebuff', 'removeBlock', 'retain', 'debuffCount',
  'removeWorstStatus', 'placeRead',
  // 3. enemyCtx `...extra` fields
  'rule', 'event', 'data', 'info', 'playedCard', 'read',
]);

/**
 * Fields SOME hook dispatch carries. A hook that reads one its own dispatch does
 * not supply gets `undefined` — that is the deliberate, variadic part of the
 * payload contract (`if (h.card)` is fine). A field NO dispatch has ever carried
 * is a typo or an invention and throws: `isAttack`, `fromAttack`,
 * `slowDissipation` and `targetIsPlayer` were all exactly that.
 */
export const HOOK_SOFT_FIELDS = new Set([
  'actor', 'owner', 'self', 'player', 'e', 'engine', 'stacks', 'def', 'hookId',
  'source', 'sourceId', 'turn', 'side', 'reason', 'opts', 'meta',
  'attacker', 'defender', 'target', 'kind', 'card', 'cause',
  'amount', 'base', 'blocked', 'hpLoss', 'delta', 'value', 'index',
  'hits', 'hitIndex', 'id', 'pile', 'count', 'move', 'enemy', 'killerId',
  'focusable', 'fromCard', 'prevented',
  // mutators a specific hook adds
  'prevent', 'setAmount', 'setHp', 'setStacks',
]);

function _wrap(o, label, soft) {
  return new Proxy(o, {
    get(t, k, r) {
      if (typeof k === 'symbol' || k in t) return Reflect.get(t, k, r);
      if (soft.has(k) || String(k).charAt(0) === '_') return undefined;
      throw new TypeError(
        `[combat] ${label} has no member "${String(k)}". Add it to the surface, ` +
        `or stop calling it — never reach for "${String(k)}?.()" and hope ` +
        '(CONTRACTS.md rule 8).');
    },
  });
}

/** Should the guard be armed for this engine? */
export function detectStrict(cfg = {}) {
  if (cfg.strictCtx !== undefined) return !!cfg.strictCtx;
  try {
    const loc = globalThis.location;
    if (!loc) return false;
    const q = String(loc.search || '') + String(loc.hash || '');
    if (/[?&#]strictCtx=0\b/.test(q)) return false;
    if (/[?&#]debug\b/.test(q)) return true;
    return loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
  } catch { return false; }
}

/**
 * Resolve the flag once and hand back the wrapper to use forever after.
 * `strict === false` gives the identity function: zero cost, no branch per read.
 */
export function guardFactory(strict, soft = CTX_SOFT_KEYS) {
  if (!strict) return (o) => o;
  return (o, label) => _wrap(o, label || 'ctx', soft);
}
