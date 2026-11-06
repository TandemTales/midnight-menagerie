/** Scroll furniture for the four reading boards; no game state. */
export function boardScrollCue(root, scroller, label = 'page', host = null) {
  if (!scroller) return () => {};
  const foot = host || root.querySelector('.rm-foot, .go-foot');
  if (!foot) return () => {};
  const cue = document.createElement('button');
  cue.type = 'button'; cue.className = 'r49-scrollcue';
  cue.dataset.boardScroll = label;
  if (host) cue.classList.add('r49-scrollcue--inset');
  const rail = document.createElement('div');
  rail.className = 'r50-scrollrail';
  const title = document.createElement('span');
  title.textContent = label === 'choices' ? 'Fort choices' : label === 'wares' ? 'Shop shelves' : label === 'story' ? 'Story register' : label === 'record' ? 'Memorial record' : label === 'Tricks' ? 'Final Tricks' : 'Keepsakes';
  rail.append(title, cue);
  if (host) host.appendChild(rail); else scroller.after(rail);
  let raf = 0;
  const refresh = () => {
    let max = scroller.scrollHeight - scroller.clientHeight;
    // Round 60: a rail that stands in the board's own grid row takes its
    // height from the scroller, so it is only owed when the board would still
    // overflow without it (otherwise it hides the very lines it points at).
    const spare = !host && !rail.hidden ? rail.offsetHeight : 0;
    cue.hidden = max - spare < 8 || scroller.clientHeight < 1;
    if (cue.hidden) max = Math.max(0, max - spare);
    rail.hidden = cue.hidden;
    const end = scroller.scrollTop >= max - 8;
    cue.dataset.end = String(end);
    cue.textContent = end ? (host ? 'End · ↑ Top' : `End of ${label} · ↑ Top`) : (host ? '↓ More below' : `↓ More ${label} below`);
    cue.setAttribute('aria-label', end ? `End of ${label}. Return to top` : `Scroll down to see more ${label}`);
  };
  const soon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(refresh); };
  const click = () => scroller.scrollTo({ top: cue.dataset.end === 'true' ? 0 : scroller.scrollTop + scroller.clientHeight * .7, behavior: 'auto' });
  const key = e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); };
  cue.addEventListener('keydown', key);
  cue.addEventListener('click', click);
  scroller.addEventListener('scroll', soon, { passive: true });
  const resize = new ResizeObserver(soon); resize.observe(scroller);
  const mutation = new MutationObserver(soon); mutation.observe(scroller, { childList: true, subtree: true });
  soon();
  return () => { cancelAnimationFrame(raf); resize.disconnect(); mutation.disconnect(); scroller.removeEventListener('scroll', soon); cue.removeEventListener('click', click); cue.removeEventListener('keydown', key); rail.remove(); };
}
