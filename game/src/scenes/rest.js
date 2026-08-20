import { Scene } from '../core/scenes.js';
export class RestScene extends Scene {
  async enter(params) {
    this.root.innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center;
      font-family:var(--font-display);color:var(--text-mid);letter-spacing:.16em;text-transform:uppercase">
      rest — not built yet</div>`;
  }
}
