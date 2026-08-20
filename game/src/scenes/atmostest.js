/**
 * Atmosphere test bench. OWNER: atmosphere agent.
 * NEEDS REGISTERING in src/main.js:
 *     import { AtmosTestScene } from './scenes/atmostest.js';
 *     .register('atmostest', (c) => new AtmosTestScene(c))
 * Then: #scene=atmostest   (or #scene=atmostest&region=crypt)
 *
 * Keys: [ ] cycle region · D dread · I impact · P pulse · 1-5 transitions
 */
import { Scene } from '../core/scenes.js';
import { mountShowcase, SHOWCASE_ORDER } from '../fx/showcase.js';

const TRANS = ['veil', 'doorway', 'blueprint', 'candle-out', 'dawn'];

export class AtmosTestScene extends Scene {
  async enter(params) {
    this.show = mountShowcase(this.ctx, { start: params?.region || 'foyer', hideDom: false });
    this.root.innerHTML =
      `<div style="position:absolute;left:20px;top:16px;font:var(--fs-sm)/1.7 var(--font-body);
        color:var(--text-lo);pointer-events:none;text-shadow:0 1px 6px #000">
        [ ] region &nbsp;·&nbsp; D dread &nbsp;·&nbsp; I impact &nbsp;·&nbsp; P pulse &nbsp;·&nbsp; 1-5 transition
      </div>`;
    this._dread = 0;
    this._i = SHOWCASE_ORDER.indexOf(params?.region || 'foyer');
    this._onKey = (e) => {
      const o = SHOWCASE_ORDER;
      if (e.key === ']') { this._i = (this._i + 1) % o.length; this.show.set(o[this._i]); }
      else if (e.key === '[') { this._i = (this._i + o.length - 1) % o.length; this.show.set(o[this._i]); }
      else if (e.key.toLowerCase() === 'd') { this._dread = this._dread > 0.5 ? 0 : 1; this.show.dread(this._dread); }
      else if (e.key.toLowerCase() === 'i') this.show.impact();
      else if (e.key.toLowerCase() === 'p') this.show.pulse();
      else if (TRANS[+e.key - 1]) this.show.trans(TRANS[+e.key - 1]);
    };
    addEventListener('keydown', this._onKey);
  }
  async exit() {
    removeEventListener('keydown', this._onKey);
    this.show?.unmount();
  }
}
