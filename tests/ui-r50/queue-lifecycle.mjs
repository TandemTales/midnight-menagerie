/** Lifecycle regression for pending presentation labels; no browser required. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { CombatFX } = await import(pathToFileURL(resolve(process.argv[2] || 'game/src/fx/combatfx.js')));

// Minimal DOM measurement surface; this fixture still isolates queue lifecycle.
globalThis.document = { createRange: () => ({ selectNodeContents() {}, getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 24 }) }) };

function fixture({ removed = false, actorId = 'retiring-enemy' } = {}) {
  const fx = Object.create(CombatFX.prototype);
  const actor = { id: actorId, x: 300, y: 200, left: 280, right: 320, top: 180, bottom: 240 };
  fx.showNumbers = true;
  fx.nums = [{ live: 0, el: { style: {}, dataset: {}, classList: { toggle() {} }, offsetWidth: 100, offsetHeight: 24, getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 24 }) } }];
  fx._fitWords = () => true; // This regression isolates queue lifecycle, not layout.
  fx.wordQueue = [{ x: 300, y: 150, text: '+2 Vulnerable', o: {
    kind: 'debuff', actorId: actor.id, actor, actors: [actor], plates: [],
    refreshBounds: () => ({ actorId: actor.id, actor: removed ? undefined : actor,
      actors: removed ? [] : [actor], plates: [] })
  } }];
  return fx;
}

const results = [];
for (const [name, options, expectedLive] of [
  ['removed owner cancels pending visual once', { removed: true }, 0],
  ['live owner still receives one full label', {}, 1],
]) {
  const fx = fixture(options);
  fx._flushWords();
  const initial = { queued: fx.wordQueue.length, live: fx.nums.filter(n => n.live).length };
  for (let i = 0; i < 5; i++) fx._updateNumbers(2);
  const settled = { queued: fx.wordQueue.length, live: fx.nums.filter(n => n.live).length };
  let error = null;
  try {
    assert.equal(initial.queued, 0);
    assert.equal(initial.live, expectedLive);
    assert.equal(settled.queued, 0);
    assert.equal(settled.live, 0);
  } catch (e) { error = e.message; }
  results.push({ name, initial, settled, error });
}
{
  const fx = fixture({ removed: true }), survivor = fixture({ actorId: 'survivor' });
  fx.wordQueue.push(...survivor.wordQueue);
  fx.nums.push(...survivor.nums);
  fx._flushWords();
  const initial = { queued: fx.wordQueue.length, owners: fx.nums.filter(n => n.live).map(n => n.actorId) };
  let error = null;
  try { assert.equal(initial.queued, 0); assert.deepEqual(initial.owners, ['survivor']); }
  catch (e) { error = e.message; }
  results.push({ name: 'retiring one owner preserves another pending label', initial, error });
}
console.log(JSON.stringify(results, null, 2));
process.exitCode = results.some(r => r.error) ? 1 : 0;
