# The card-art hitch is real, and it is `toDataURL` — 2026-08-30

HANDOFF has said **"THE CARD-ART HITCH DOES NOT REPRODUCE"** since 2026-08-26,
alongside "entry-stall timings swing 2x run to run" and "do not chase any of the
three on this machine as it currently is."

Two of those three are now settled and they went opposite ways. fps does not
reproduce — eleven of eleven samples at 61. The card-art hitch **does**, and it
has an exact line number.

---

## 1. The stall reproduces

`tools/entryprof.py --goto combat`, thirteen runs:

    1150  1200  1233  1250  1283  1350  1917  1933  1933  2033  2050  2166  2217

against a **1200 ms budget**. Eleven of thirteen are over it. The standing
conclusion came from **three** samples, one of which happened to pass.

The variance is real. What was concluded from it was not, and three samples is
where that went wrong. The fps item taught the same lesson the same day in the
opposite direction.

**Where the time goes matters more than the total.** A typical run blocks
~250 ms just before the scene enters, ~550 ms immediately after, then throws
evenly spaced triplets of ~100–130 ms at about t+1.5 s and again at t+3.3 s.
Combat keeps hitching for seconds after it is nominally in, so "entry stall"
undersells it.

---

## 2. What it is not

Ruled out by measurement, in this order, because each was the obvious suspect:

**Not JavaScript.** CDP CPU profile across the transition: **1289 ms of 1398 ms
sampled is `(program)`** — native, outside JS. Every game file together comes to
about 48 ms, the largest being `card.js` at 13.6 ms.

**Not shader linking.** Hooking `linkProgram` / `getProgramParameter` /
`getProgramInfoLog`: 27 programs and **289 ms of blocking `getProgramInfoLog`
at the title**, then only **2 programs and 12 ms** entering combat. Shader
linking is a boot cost. `KHR_parallel_shader_compile` is available, for
whoever wants the boot half.

**Not texture upload.** `texImage2D` totals **0.1 ms** over 61 calls entering
combat. `bufferData` 0.5 ms. `drawElements` 4.8 ms over 2818 calls.

---

## 3. What it is

Hooking `HTMLCanvasElement.prototype.toDataURL` before any page script runs:

    AT TITLE:         0 calls
    ENTERING COMBAT:  6 calls, 274 ms total

    122.1 ms  314x176 png   render (cardart.js:352) <- step (cardart.js:423)
     58.9 ms  314x176 png   render (cardart.js:352) <- step (cardart.js:423)
     52.2 ms  314x176 png   render (cardart.js:352) <- cardArt (cardart.js:335)
     29.1 ms  314x176 png   render (cardart.js:352) <- cardArt (cardart.js:335)
      6.4 ms  314x176 png   render (cardart.js:352) <- step (cardart.js:423)
      5.8 ms  314x176 png   render (cardart.js:352) <- step (cardart.js:423)

All six are `cardart.js render()`:

```js
paint(g, w, h, def, def.companion || 'neutral', !!o.upgraded);
const url = cv.toDataURL('image/png');      // line 352 — synchronous PNG encode
```

**Why the previous investigation missed it.** It instrumented `cardart.js
render` and reported "6 renders, 27.7 ms total, ZERO of them synchronous". Six
renders is the right count — it found the right function — but `toDataURL` is
*inside* `render`, at line 352, and it is where the time is. A measurement that
brackets the wrong side of a call reports the wrong number with total
confidence.

**The warm loop cannot stop it.** `warmArt`'s `step` is meant to keep this
incremental:

```js
const t0 = performance.now();
while (warmQueue.length) {
  const url = CACHE.get(j.key) || render(...);   // can take 122 ms
  if (performance.now() - t0 > budget) break;    // budget is 11 ms
}
```

The budget is checked **after** each job. An 11 ms budget is powerless against a
122 ms unit of work — it can only ever prevent the *next* one. This is a frame
budget that cannot protect a frame, and it reads as if it can.

---

## 4. A fix that was tried and REJECTED

The costs decay — 122 / 59 / 52 / 29 / 6 / 6 — which looks exactly like encoder
warm-up. Isolated, that held up: eight consecutive encodes of a fresh 314x176
canvas read

    25.5  5.5  4.5  1.7  1.3  1.2  5.0  1.5

So: pay the warm-up on the title screen, where there are seconds of idle time,
and the transition gets it free. Three lines, no API change, no object-URL
lifetime to manage.

**It does not work.** Implemented as a throwaway encode on an idle callback:

    8x8 warm canvas      → title pays 22 ms, combat's first encode still 112.7 ms
    314x176 warm canvas  → title pays 22 ms, combat's first encode still 113.8 ms

Reverted. The isolated reproduction was misleading: eight encodes back-to-back
in one synchronous loop is a different regime from encodes spread across frames
with a scene transition's work between them. **Suspect your own reproduction as
hard as you suspect the instrument** — this is the second time in one session
that a clean-looking analysis was wrong (see also `tools/entryprof.py`, where a
`--scene` baseline was subtracted from a `--goto` run that had already excluded
it).

---

## 5. What the fix actually is

Take the encode off the main thread: `canvas.toBlob(cb, 'image/png')` plus
`URL.createObjectURL`. The encode then happens off-thread and `warmArt` is
already promise-based, so the warm path can absorb an async render without any
caller changing.

Two real costs, which is why it is not done here:

- `cardArt()` is **synchronous** and `card.js _paintArt` calls it that way. The
  on-demand path either keeps blocking (2 of 6 calls, ~81 ms) or grows a
  placeholder-then-swap.
- Object URLs need revoking. `CACHE.clear()` at 320 entries would leak every
  blob it drops, and `data:` and `blob:` URLs would coexist in one cache during
  any partial migration.

Scoped, that is a contained piece of work in one file with a measurement already
written to check it: re-run the `toDataURL` hook and the six calls should
disappear from the transition.
