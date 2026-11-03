/** Read-again lessons: presentation only, no combat or save mutations. */
import { Modal, kitButton } from './modal.js';
import { bus } from '../core/bus.js';

export const SCUFFLE_HELP = [
  ['Your turn', 'Read the sign above each enemy. It shows the move that enemy plans next. Play Tricks to help your Companion. Choose End Turn when you are ready. You may leave Nerve unused.'],
  ['Tricks and Nerve', 'Point to a Trick to read it. Compare its Nerve cost with your current Nerve. Nerve refills at the start of your turn. Effects can change how much you get. Read the numbers on your board.'],
  ['Courage and Guard', 'At zero Courage, a Companion is out of this Scuffle. Guard usually takes damage before Courage does. Guard normally clears at the start of your next turn. Some Tricks and attacks have special rules: read their text.'],
  ['Mouse and touch', 'Select a Trick, then choose its target if it needs one. With a mouse, you can also drag a Trick onto a target. A Trick that does not need a target can play straight away.'],
  ['Keyboard', 'Left and Right select a Trick. Up chooses it. If it needs a target, Left and Right change targets, then Up confirms. Down cancels your selection. E ends your turn. Tab moves keyboard focus when no Trick is selected.'],
  ['Where Tricks go', 'At turn end, most unplayed Tricks go to Discard. Retain keeps a Trick in your hand. Ethereal makes an unplayed Trick Vanish. When Draw is empty, Discard shuffles into Draw. Use the labeled piles to read their Tricks.'],
  ['Pile shortcuts', 'Q opens Draw. W opens Discard. R opens Torn. T opens Vanished. D opens your Deck. Close a pile before playing. Buttons on the board also open these piles.'],
  ['Marmalade’s Haunt', 'After a Haunted enemy attacks, it loses Courage equal to its Haunt. Then it normally loses half its Haunt, rounded up. Haunt does not stop the attack that triggers it. Some Tricks change how Haunt works.'],
  ['Marmalade’s Lives', 'Lives are a Scuffle resource, not a count of your remaining attempts. They do not refill each turn. They reset for the next Scuffle; some Tricks can restore them sooner. Read each Trick before spending Lives.'],
  ['Controller', 'Use the on-screen controller prompts to select a Trick and confirm. Choose a target when asked, then confirm again. Use the cancel action to back out. You can always select the labeled End Turn button.'],
  ['Remember', 'Read the enemy’s next move. Read your Tricks. Check Nerve, Courage and Guard. Play what helps, then end your turn. The Dust Bunny has no pockets. You, fortunately, have a Backpack.'],
];
export const HELP_GROUPS = [
  { label: 'Turns and resources', pages: [0, 1, 2, 10] },
  { label: 'Controls and piles', pages: [3, 4, 9, 5, 6] },
  { label: 'Marmalade', pages: [7, 8] },
];
let active = null;

export function openScuffleHelp(ctx = {}) {
  if (active) return active.promise;
  let group = null, page = null;
  const modal = new Modal({ title: 'Scuffle help', size: 'md', host: ctx.dom });
  modal.footer.style.flexWrap = 'wrap';
  modal.footer.style.gap = 'var(--s-3)';
  const text = document.createElement('p');
  text.className = 'mm-modal__text';
  text.tabIndex = -1;
  const choices = document.createElement('div');
  choices.style.display = 'grid';
  choices.style.gap = 'var(--s-3)';
  choices.setAttribute('role', 'group');
  modal.body.append(text, choices);
  const topics = document.createElement('button'); topics.textContent = 'All topics';
  const back = document.createElement('button'); back.textContent = 'Previous';
  const next = document.createElement('button'); next.textContent = 'Next';
  const done = document.createElement('button'); done.textContent = 'Back to game';
  for (const button of [topics, back, next, done]) {
    button.type = 'button'; kitButton(button); modal.footer.append(button);
  }
  const addChoice = (label, select) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    kitButton(button, { quiet: true });
    button.style.whiteSpace = 'normal';
    button.onclick = select; choices.append(button);
  };
  const render = () => {
    choices.replaceChildren();
    const reading = page !== null;
    choices.hidden = reading; choices.style.display = reading ? 'none' : 'grid';
    for (const button of [back, next]) { button.hidden = !reading; button.style.display = reading ? '' : 'none'; }
    topics.hidden = group === null; topics.style.display = group === null ? 'none' : '';
    if (group === null) {
      modal.setTitle('Scuffle help', 'What would you like to check?');
      text.textContent = 'Choose a topic. You can come back whenever you need.';
      choices.setAttribute('aria-label', 'Help categories');
      HELP_GROUPS.forEach((entry, index) => addChoice(entry.label, () => {
        group = index; render();
      }));
    } else if (!reading) {
      modal.setTitle('Scuffle help', HELP_GROUPS[group].label);
      text.textContent = 'Choose just the explanation you want.';
      choices.setAttribute('aria-label', HELP_GROUPS[group].label + ' topics');
      HELP_GROUPS[group].pages.forEach((index) => addChoice(SCUFFLE_HELP[index][0], () => {
        page = index; render();
      }));
    } else {
      const position = HELP_GROUPS[group].pages.indexOf(page);
      modal.setTitle('Scuffle help', SCUFFLE_HELP[page][0]);
      text.textContent = SCUFFLE_HELP[page][1];
      back.disabled = position === 0;
      next.disabled = position === HELP_GROUPS[group].pages.length - 1;
    }
    // Replacing the index removes the pressed button. Move focus to its
    // replacement, never to the battle underneath or an old hidden button.
    if (modal.el.isConnected) {
      (reading ? text : choices.querySelector('button')).focus({ preventScroll: true });
      modal.body.scrollTop = 0;
    }
  };
  const move = (delta) => {
    if (page === null || group === null) return;
    const pages = HELP_GROUPS[group].pages;
    const at = pages.indexOf(page) + delta;
    if (at < 0 || at >= pages.length) return;
    page = pages[at]; render();
  };
  topics.onclick = () => { group = page = null; render(); };
  back.onclick = () => move(-1);
  next.onclick = () => move(1);
  done.onclick = () => modal.close();
  render();
  const off = bus.on('scene:leaving', () => modal.close());
  // Keep keys out of combat even before the next-frame focus transfer.
  // Legacy pad forwarding targets window; focused dialog keys use Modal's trap.
  const capture = (event) => {
    if (event.target instanceof Node && modal.el.contains(event.target)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === 'Escape') modal.close();
    else if (event.key === 'ArrowLeft') move(-1);
    else if (event.key === 'ArrowRight') move(1);
    else if (event.key === 'ArrowUp' || event.key === 'Enter') {
      const first = choices.querySelector('button');
      if (page === null && first) first.click(); else done.click();
    }
  };
  window.addEventListener('keydown', capture, true);
  const promise = modal.open().finally(() => {
    off(); window.removeEventListener('keydown', capture, true); active = null;
  });
  active = { modal, promise };
  return promise;
}
