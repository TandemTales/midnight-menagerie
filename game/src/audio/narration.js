/**
 * Stored narration playback.
 *
 * ElevenLabs is a BUILD-TIME dependency for this project. The game never
 * sends text to ElevenLabs and never needs an API key: it reads the generated
 * manifest and MP3 files from `game/assets/audio/voiceover/` and plays them
 * through the dedicated voice side of the existing master bus.
 */

const DEFAULT_BASE = new URL('../../assets/audio/voiceover/', import.meta.url);

/** Keep source text and generated-file lookup stable across line wrapping. */
export function normalizeNarrationText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Stable id shared with `generate_narration.py`.
 *
 * FNV-1a over UTF-8 is small, deterministic and available before the async
 * manifest load finishes. It is not used as a security boundary.
 */
export function narrationId(value) {
  const text = normalizeNarrationText(value);
  let hash = 0x811c9dc5;
  const bytes = typeof TextEncoder === 'function'
    ? new TextEncoder().encode(text)
    : [...text].map(ch => ch.charCodeAt(0) & 0xff);
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `narration-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * One voice at a time. A fresh line interrupts nothing currently playing; it
 * waits behind it, with a small cap so a rapid story transition cannot make
 * narration minutes behind the board.
 */
export class NarrationPlayer {
  constructor(ac, output, options = {}) {
    this.ac = ac;
    this.output = output;
    this.base = new URL(options.base || DEFAULT_BASE, import.meta.url);
    this.manifestUrl = new URL('manifest.json', this.base);
    this.volume = clamp(options.volume ?? 0.8, 0, 1);
    this.onStart = options.onStart || null;
    this.onStop = options.onStop || null;
    this.entries = new Map();
    this.byText = new Map();
    this.queue = [];
    this.active = null;
    this.loaded = false;
    this._disposed = false;
    this._loading = null;
  }

  /** Load only the local manifest. A missing/empty manifest is valid. */
  async load() {
    if (this._loading) return this._loading;
    this._loading = (async () => {
      try {
        const response = await fetch(this.manifestUrl.href, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
        const manifest = await response.json();
        for (const raw of Array.isArray(manifest.entries) ? manifest.entries : []) {
          const text = normalizeNarrationText(raw.text);
          if (!text || !raw.file) continue;
          const entry = {
            id: String(raw.id || narrationId(text)),
            text,
            file: String(raw.file),
            volume: clamp(raw.volume ?? 1, 0, 1),
          };
          this.entries.set(entry.id, entry);
          this.byText.set(text, entry);
        }
      } catch (error) {
        // Audio is presentation. A build with no generated voiceover assets
        // remains fully playable and should not turn a 404 into a console
        // error on every narration event.
        if (!this._disposed && !/HTTP 404/.test(String(error?.message || error))) {
          console.warn('[narration] local manifest unavailable:', error);
        }
      } finally {
        this.loaded = true;
        this._loading = null;
        const pending = this._pending || [];
        this._pending = [];
        for (const request of pending) request();
      }
      return this.entries.size;
    })();
    return this._loading;
  }

  /**
   * Queue a line by its exact authored text, or an explicit generated id.
   * Returns the manifest entry when it exists and null for an unvoiced line.
   */
  play(textOrId, options = {}) {
    if (this._disposed) return null;
    const raw = String(textOrId ?? '');
    const text = normalizeNarrationText(raw);
    if (!text) return null;

    let result = null;
    const request = () => {
      const explicit = options.id ? this.entries.get(String(options.id)) : null;
      const entry = explicit || this.entries.get(raw) || this.byText.get(text);
      result = entry;
      if (entry) this._enqueue(entry, options);
    };
    if (this.loaded) request();
    else {
      // Keep only the newest few events while the manifest is loading. The
      // first click commonly unlocks audio and starts a fight immediately.
      (this._pending ||= []).push(request);
      if (this._pending.length > 8) this._pending.shift();
      void this.load();
    }
    return result;
  }

  setVolume(value) {
    this.volume = clamp(value, 0, 1);
    if (this.active) this.active.gain.gain.value = this._gain(this.active.entry);
  }

  /** Start queued media after an autoplay gate or host pause has cleared. */
  wake() { this._advance(); }

  stop() {
    this.queue.length = 0;
    this._finish(true);
  }

  dispose() {
    this._disposed = true;
    this._pending = [];
    this.stop();
  }

  _enqueue(entry, options) {
    if (this.active?.entry.id === entry.id || this.queue.some(x => x.entry.id === entry.id)) return;
    this.queue.push({ entry, options });
    if (this.queue.length > 4) this.queue.shift();
    this._advance();
  }

  _advance() {
    if (this._disposed || this.active || !this.queue.length) return;
    // Keep the entry queued until Audio.unlock() resumes the context. Calling
    // HTMLMediaElement.play() while suspended can reject and lose the line.
    if (this.ac?.state && this.ac.state !== 'running') return;
    const { entry, options } = this.queue.shift();
    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.src = new URL(entry.file, this.base).href;
    audio.setAttribute('aria-hidden', 'true');
    audio.className = 'mm-narration-audio';

    const gain = this.ac.createGain();
    gain.gain.value = this._gain(entry, options);
    const source = this.ac.createMediaElementSource(audio);
    source.connect(gain);
    gain.connect(this.output);

    this.active = { audio, gain, source, entry };
    const done = () => this._finish(false);
    audio.addEventListener('ended', done, { once: true });
    audio.addEventListener('error', done, { once: true });
    document.body.appendChild(audio);
    try { this.onStart?.(entry); } catch {}
    void audio.play().catch(done);
  }

  _finish(interrupted) {
    const current = this.active;
    if (!current) return;
    this.active = null;
    try { current.audio.pause(); } catch {}
    try { current.source.disconnect(); } catch {}
    try { current.gain.disconnect(); } catch {}
    current.audio.remove();
    try { this.onStop?.(current.entry, interrupted); } catch {}
    this._advance();
  }

  _gain(entry, options = {}) {
    return clamp(this.volume * entry.volume * (options.vol ?? 1), 0, 1);
  }
}

function clamp(value, min, max) {
  const n = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

export default NarrationPlayer;
