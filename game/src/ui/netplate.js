/**
 * What the table can see of the wire: who has dropped, who is back, and whether
 * the machines still agree.
 *
 * `net/session.js` has always known these things and told only the console. The
 * failure that left is the worst one co-op has: a friend's connection goes, every
 * other screen just stops answering, and nothing says why. So this is a small
 * plate over whatever scene is up, with the two decisions a player can actually
 * make. It is deliberately not a modal: a scene that does not need the missing
 * player (a shop, a reward) goes on working underneath it.
 */
import { bus } from '../core/bus.js';
import { kitButton } from './modal.js';
import { ensureCss } from './portrait.js';

const CSS = new URL('./netplate.css', import.meta.url).href;
const OUTSIDE = new Set(['title', 'clubhouse', 'select', 'lobby']);
const NOTE_MS = 5000;
/* What a hung plate must never cover in a fight: each creature's sign, intent, plate and Guard. */
const KEEP_CLEAR = '.cb-enemy__above, .cb-enemy__intent, .cb-enemy__plate, .cb-enemy__guard, .cb-enemy__rule';
const FACE = '<i class="net-plate__face"></i><i class="net-plate__chain net-plate__chain--l"></i><i class="net-plate__chain net-plate__chain--r"></i>';
/* A rope's two ends, parted and frayed: somebody's line to the house has gone. */
const MEDAL = '<i class="net-plate__medal" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M2.5 25.5 12 16M5.5 28.5 15 19"/><path d="M12 16l1-5M13.5 17.5l4-3.5M15 19l5 .5"/><path d="M29.5 6.5 21 15M26.5 3.5 18 12"/><path d="M21 15l-.5 5M19.5 13.5l-3.5 4M18 12l-5-1"/></svg></i>';

/**
 * Hang the plate over the board where it hides nothing a player reads. It keeps its height and
 * slides along the rail, nearest the middle first; if nowhere is clear (a very full board), the
 * spot that hides the least. Off a fight there is nothing to dodge and it stays centred.
 */
function hang(plate) {
  const fight = document.querySelector('.cb-root');
  const clear = fight ? [...document.querySelectorAll(KEEP_CLEAR)].map(e => e.getBoundingClientRect()).filter(r => r.width && r.height) : [];
  plate.style.left = ''; plate.style.transform = '';
  if (!clear.length) return;
  const host = plate.offsetParent?.getBoundingClientRect() || { left: 0 };
  const me = plate.getBoundingClientRect();
  const mates = document.querySelector('.cb-mates:not([hidden])')?.getBoundingClientRect();
  const help = document.querySelector('.story-tools')?.getBoundingClientRect();
  const lo = Math.max(16, (mates?.right ?? 0) + 10);
  const hi = (help && me.top < help.bottom ? help.left - 10 : innerWidth - 16) - me.width;
  const hidden = x => clear.reduce((sum, r) =>
    sum + Math.max(0, Math.min(x + me.width, r.right) - Math.max(x, r.left)) * Math.max(0, Math.min(me.bottom + 8, r.bottom) - Math.max(me.top, r.top)), 0);
  const mid = (innerWidth - me.width) / 2;
  let best = Math.max(lo, Math.min(hi, mid)), least = Infinity;
  for (let x = lo; x <= hi; x += 12) {
    const cost = hidden(x) * 1000 + Math.abs(x - mid);
    if (cost < least) { least = cost; best = x; }
  }
  plate.style.left = `${Math.round(best - host.left)}px`;
  plate.style.transform = 'none';
}

/** One line for a moment, with no session behind it: a Steam join that failed. */
export function showNetNotice(ctx, text) {
  ensureCss(CSS);
  const plate = document.createElement('div');
  plate.className = 'net-plate';
  plate.setAttribute('role', 'status');
  const words = document.createElement('p');
  words.className = 'net-plate__words';
  words.textContent = text;
  plate.innerHTML = FACE + MEDAL;
  plate.append(words);
  (ctx.dom || document.body).appendChild(plate);
  hang(plate);
  setTimeout(() => plate.remove(), NOTE_MS * 2);
}

/**
 * @returns {() => void} take the plate down and let go of the session
 */
export function installNetPlate(ctx, session, run) {
  ensureCss(CSS);
  let plate = null;
  let note = '';
  let noteTimer = null;
  let drifted = false;
  let driftWaved = false;

  const nameOf = (seat) => {
    const typed = session.roster?.names?.[seat];
    const kid = run.kids[seat] ? run.kidNameOf(run.kids[seat]) : `Seat ${seat + 1}`;
    return typed ? `${typed} (${kid})` : kid;
  };
  const list = (seats) => {
    const names = seats.map(nameOf);
    return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  };

  const button = (label, quiet, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    kitButton(b, { quiet });
    b.addEventListener('click', fn);
    return b;
  };

  const leave = () => {
    try { run.save(); } catch { /* storage is best-effort */ }
    teardown();
    try { session.close(); } catch { /* already gone */ }
    ctx.scenes?.go?.('title', {}, { instant: true });
  };

  const paint = () => {
    const lost = [...session.lost];
    const showDrift = drifted && !driftWaved;
    if (run.result || (!lost.length && !note && !showDrift)) {
      plate?.remove();
      plate = null;
      return;
    }
    if (!plate) {
      plate = document.createElement('div');
      plate.className = 'net-plate';
      plate.setAttribute('role', 'status');
      plate.setAttribute('aria-live', 'polite');
      /* Above the scenes, under nothing of theirs: `ctx.dom` holds every board. */
      (ctx.dom || document.body).appendChild(plate);
    }
    plate.innerHTML = FACE + MEDAL;
    const words = document.createElement('p');
    words.className = 'net-plate__words';
    const acts = document.createElement('div');
    acts.className = 'net-plate__acts';
    if (lost.length) {
      words.textContent = `${list(lost)} lost the connection. The house is waiting for `
        + `${lost.length > 1 ? 'them' : 'them to climb back in'}.`;
      acts.append(
        button('Play on without them', false, () => {
          for (const s of lost) session.dropSeat(s);
        }),
        button('Leave the expedition', true, leave),
      );
    } else if (showDrift) {
      words.textContent = 'Your games have come apart: what you see and what your friends see '
        + 'no longer match. That is a bug in the game, not anything you did. Leaving and '
        + 'climbing back in puts you back on their board.';
      acts.append(
        button('Keep playing', true, () => { driftWaved = true; paint(); }),
        button('Leave and climb back in', false, leave),
      );
    } else {
      words.textContent = note;
    }
    plate.append(words);
    if (acts.childElementCount) plate.append(acts);
    hang(plate);
  };
  /* A creature's intent changes turn by turn, so the plate looks again while it is up. */
  const rehang = () => { if (plate) hang(plate); };
  const rehangEvery = setInterval(rehang, 1500);
  window.addEventListener('resize', rehang);

  const say = (text) => {
    note = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { note = ''; paint(); }, NOTE_MS);
    paint();
  };

  const offs = [
    session.on('presence', ({ seat, here }) => {
      if (here) say(`${nameOf(seat)} is back.`);
      else paint();
    }),
    session.on('gone', ({ seat }) => say(`Playing on. ${nameOf(seat)} can climb back in with the same password.`)),
    session.on('back', ({ seat }) => { if (seat !== session.seat) say(`${nameOf(seat)} climbed back in.`); }),
    session.on('diverge', () => { drifted = true; paint(); }),
  ];

  const teardown = () => {
    for (const off of offs.splice(0)) { try { off(); } catch { /* already gone */ } }
    clearTimeout(noteTimer);
    clearInterval(rehangEvery);
    window.removeEventListener('resize', rehang);
    plate?.remove();
    plate = null;
    offScene();
  };
  /* Every way out of an expedition ends on one of these screens, and a session
     left running there would go on applying inputs to a run nobody is looking at. */
  const offScene = bus.on('scene:entered', ({ name }) => {
    if (!OUTSIDE.has(name)) { paint(); return; }
    teardown();
    try { session.close(); } catch { /* already gone */ }
  });

  paint();
  return teardown;
}

export default { installNetPlate };
