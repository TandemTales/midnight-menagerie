/** Pointer + keyboard input normalisation, with hover intent and drag thresholds. */
import { bus } from './bus.js';

export class Input {
  constructor(el = window) {
    this.pointer = { x: 0, y: 0, nx: 0, ny: 0, down: false, dragging: false };
    this.keys = new Set();
    this._downAt = null;
    this.DRAG_PX = 6;

    el.addEventListener('pointermove', (e) => {
      this.pointer.x = e.clientX; this.pointer.y = e.clientY;
      this.pointer.nx = (e.clientX / innerWidth) * 2 - 1;
      this.pointer.ny = -(e.clientY / innerHeight) * 2 + 1;
      if (this.pointer.down && !this.pointer.dragging && this._downAt) {
        const dx = e.clientX - this._downAt.x, dy = e.clientY - this._downAt.y;
        if (Math.hypot(dx, dy) > this.DRAG_PX) { this.pointer.dragging = true; bus.emit('input:dragstart', this._downAt); }
      }
      bus.emit('input:move', this.pointer);
    }, { passive: true });

    el.addEventListener('pointerdown', (e) => {
      this.pointer.down = true;
      this._downAt = { x: e.clientX, y: e.clientY, t: performance.now(), target: e.target };
      bus.emit('input:down', this._downAt);
    });

    el.addEventListener('pointerup', (e) => {
      const wasDrag = this.pointer.dragging;
      this.pointer.down = false; this.pointer.dragging = false;
      bus.emit('input:up', { x: e.clientX, y: e.clientY, wasDrag, from: this._downAt });
      this._downAt = null;
    });

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      bus.emit('key:down', e);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); bus.emit('key:up', e); });
    addEventListener('blur', () => { this.keys.clear(); this.pointer.down = false; });
  }
  held(code) { return this.keys.has(code); }
}
