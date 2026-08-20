/** Deterministic seeded RNG (mulberry32). Every run is reproducible from a seed. */
export function hashSeed(str) {
  let h = 1779033703 ^ String(str).length;
  for (let i = 0; i < String(str).length; i++) {
    h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 1;
}

export class RNG {
  constructor(seed = Date.now()) {
    this.seed = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
    this.s = this.seed;
    this.calls = 0;
  }
  next() {
    this.calls++;
    let t = (this.s += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(maxExclusive) { return Math.floor(this.next() * maxExclusive); }
  range(min, maxInclusive) { return min + this.int(maxInclusive - min + 1); }
  pick(arr) { return arr[this.int(arr.length)]; }
  chance(p) { return this.next() < p; }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  /** Pick n distinct items. */
  sample(arr, n) { return this.shuffle(arr).slice(0, n); }
  /** Weighted pick: items = [{w, ...}] */
  weighted(items, wKey = 'w') {
    const total = items.reduce((s, i) => s + (i[wKey] ?? 1), 0);
    let r = this.next() * total;
    for (const it of items) { r -= (it[wKey] ?? 1); if (r <= 0) return it; }
    return items[items.length - 1];
  }
  fork(tag) { return new RNG(hashSeed(`${this.seed}:${tag}`)); }
  snapshot() { return { s: this.s, calls: this.calls, seed: this.seed }; }
  restore(sn) { this.s = sn.s; this.calls = sn.calls; this.seed = sn.seed; }
}
