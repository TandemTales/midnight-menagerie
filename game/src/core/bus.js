/** Tiny synchronous event bus. The only cross-module coupling allowed. */
export class Bus {
  #m = new Map();
  on(ev, fn) {
    if (!this.#m.has(ev)) this.#m.set(ev, new Set());
    this.#m.get(ev).add(fn);
    return () => this.off(ev, fn);
  }
  once(ev, fn) {
    const off = this.on(ev, (...a) => { off(); fn(...a); });
    return off;
  }
  off(ev, fn) { this.#m.get(ev)?.delete(fn); }
  emit(ev, payload) {
    const s = this.#m.get(ev);
    if (s) for (const fn of [...s]) {
      try { fn(payload); } catch (e) { console.error(`[bus:${ev}]`, e); }
    }
    const w = this.#m.get('*');
    if (w) for (const fn of [...w]) { try { fn(ev, payload); } catch (e) { console.error(e); } }
  }
  clear() { this.#m.clear(); }
}
export const bus = new Bus();
