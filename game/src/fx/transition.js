/** Screen transitions. OWNER: atmosphere agent. */
import { clock } from '../core/clock.js';
export class Transition {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = document.createElement('div');
    this.el.className = 'transition';
    this.el.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:0;background:var(--ink-900);z-index:var(--z-transition)`;
    ctx.fx.appendChild(this.el);
  }
  async cover(kind = 'veil') {
    this.el.style.pointerEvents = 'auto';
    await clock.ramp(0.28, v => { this.el.style.opacity = v; });
  }
  async reveal() {
    await clock.ramp(0.34, v => { this.el.style.opacity = 1 - v; });
    this.el.style.pointerEvents = 'none';
  }
}
