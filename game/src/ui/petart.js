/**
 * The eight missing pets, painted as warm, grainy family snapshots.
 * OWNER: frontend. Artwork lives in assets/pets/; provenance and the original
 * procedural reference images live in docs/pet-polaroids-2026-10-26/.
 * All scenes share these files, including the Polaroids, posters and ledger.
 */
import { KIDS } from '../data/schema.js';

const PET_W = 1122, PET_H = 1402;
export const PET_KEYS = KIDS.map((kid) => kid.pet.toLowerCase());
const CACHE = new Map();
const PRELOADS = new Map();

/** Accept a pet name, kid slug or full kid name, as before. */
export function petKey(any) {
  const value = String(any || '').toLowerCase().trim();
  const kid = KIDS.find((k) => k.slug === value ||
    k.pet.toLowerCase() === value || k.name.toLowerCase() === value);
  return kid ? kid.pet.toLowerCase() : null;
}

/** Stable asset URL for the canonical photograph; unknown names return null. */
export function petPhoto(any) {
  const key = petKey(any);
  if (!key) return null;
  if (!CACHE.has(key)) {
    CACHE.set(key, new URL('../../assets/pets/' + key + '.png', import.meta.url).href);
  }
  return CACHE.get(key);
}

/** Reserve the full authored Polaroid print, including its border and notes. */
export function petImg(any, { alt, className = 'petpic' } = {}) {
  const key = petKey(any);
  const img = document.createElement('img');
  img.className = className;
  img.decoding = 'async';
  img.draggable = false;
  img.width = PET_W;
  img.height = PET_H;
  const kid = KIDS.find((k) => k.pet.toLowerCase() === key);
  img.alt = alt ?? (kid
    ? 'Photograph of ' + kid.pet + ', ' + kid.name.split(' ')[0] + "'s missing pet"
    : 'Missing pet');
  const src = petPhoto(key);
  if (src) img.src = src;
  return img;
}

/**
 * Start loading/decoding all eight pictures without canvas work on the main
 * thread. Legacy callers may still pass { sync, budgetMs }; file decoding is
 * always asynchronous. Retain each Image so decoded bitmaps can be reused.
 * A failed load can be retried by the next warm-up, without an unhandled
 * rejection from scenes which intentionally do not await this helper.
 */
export function warmFaces() {
  const jobs = [];
  for (const key of PET_KEYS) {
    if (PRELOADS.has(key)) continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = petPhoto(key);
    PRELOADS.set(key, img);
    jobs.push(img.decode().then(() => 1, () => {
      if (PRELOADS.get(key) === img) PRELOADS.delete(key);
      return 0;
    }));
  }
  return Promise.all(jobs).then((counts) => counts.reduce((sum, n) => sum + n, 0));
}

/** Test/diagnostic hooks. */
export function faceCacheSize() { return CACHE.size; }
export function clearFaceCache() { CACHE.clear(); PRELOADS.clear(); }
