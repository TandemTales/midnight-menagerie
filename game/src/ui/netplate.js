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

/** One line for a moment, with no session behind it: a Steam join that failed. */
export function showNetNotice(ctx, text) {
  ensureCss(CSS);
  const plate = document.createElement('div');
  plate.className = 'net-plate';
  plate.setAttribute('role', 'status');
  const words = document.createElement('p');
  words.className = 'net-plate__words';
  words.textContent = text;
  plate.append(words);
  (ctx.dom || document.body).appendChild(plate);
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
    plate.replaceChildren();
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
  };

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
