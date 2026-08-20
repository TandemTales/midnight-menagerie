/** Asset loader with progress reporting and texture caching. */
import * as THREE from 'three';

export class Assets {
  constructor() {
    this.tex = new Map();
    this.img = new Map();
    this.loader = new THREE.TextureLoader();
    this.pending = 0; this.done = 0;
    this.onProgress = null;
  }
  _tick() { this.onProgress?.(this.done, this.pending); }

  texture(url, { srgb = true, aniso = 8 } = {}) {
    if (this.tex.has(url)) return this.tex.get(url);
    this.pending++;
    const p = new Promise((res, rej) => {
      this.loader.load(url, (t) => {
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = aniso;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        this.done++; this._tick(); res(t);
      }, undefined, (e) => { this.done++; this._tick(); console.warn('tex fail', url); rej(e); });
    });
    this.tex.set(url, p);
    return p;
  }

  image(url) {
    if (this.img.has(url)) return this.img.get(url);
    this.pending++;
    const p = new Promise((res, rej) => {
      const i = new Image();
      i.decoding = 'async';
      i.onload = () => { this.done++; this._tick(); res(i); };
      i.onerror = (e) => { this.done++; this._tick(); rej(e); };
      i.src = url;
    });
    this.img.set(url, p);
    return p;
  }

  async all(urls, kind = 'image') {
    return Promise.all(urls.map(u => (kind === 'texture' ? this.texture(u) : this.image(u)).catch(() => null)));
  }
}
export const assets = new Assets();
