# Steam Deck, and the four Steam systems around it

Status of achievements, Cloud saves, the overlay, controller input and Deck
verification, as of **2026-08-30**. Every number here was measured by a suite in
this repo, not estimated.

    python tests/platform/run.py      49 checks — platform, achievements, storage, pause
    python tests/gamepad/run.py       23 checks — the controller, against a synthetic pad
    python tests/steam-deck/run.py     6 checks — every screen at 1280x800

---

## The short version

| System | Game side | Steam side |
|---|---|---|
| Achievements | **done** — 32 defined, 30 shippable, unlock/persist/toast/reconcile | needs the App ID + the API Names entered on the partner site |
| Cloud saves | **done** — file-backed storage, versioning, migration, `.bak` recovery, export/import | needs the App ID + an Auto-Cloud path, and a wrapper to supply `storage` |
| Overlay | **done** — pause, audio suspend, save flush, input freeze | needs a wrapper that forwards Steam's overlay callback |
| Deck input | **done** — full controller play, correct glyphs, OSK for text | needs a default controller layout published against the App ID |
| Deck verification | **display audited and fixed**; input met | needs a build before the other two categories can be tested |

**Nothing here is blocked on design.** Everything outstanding is blocked on the
App ID, or on the wrapper that does not exist yet (see `HANDOFF.md`).

---

## What a wrapper has to provide

The whole Steam surface is behind one object the wrapper sets **before the
game's first module evaluates** — Electron: a preload script with
`contextBridge`; Tauri: an init script.

```js
window.__MM_HOST__ = { name, version, steam: {…}, storage: {…} }
```

The full contract, member by member, is the header of
[`game/src/platform/index.js`](../game/src/platform/index.js). Two notes that
are easy to get wrong:

* **`storage` is not optional if you want Cloud saves.** Steam Auto-Cloud syncs
  a *directory of files*. It cannot see `localStorage`, which lives inside the
  wrapper's own Chromium profile in a LevelDB nobody should be syncing. A
  wrapper that does not expose file storage gets a working game with local-only
  saves — `core/storage.js` falls back silently — and no Cloud.
* **Every member is optional and every one degrades.** A partial bridge is a
  supported state, not a crash. `installFakeHost()` in the same file is what the
  suites drive, so the whole path is exercised today with no Steam anywhere.

---

## Achievements

32 defined in [`game/src/core/achievements.js`](../game/src/core/achievements.js).
Each declares the bus event it listens to and a predicate; the engine keeps one
subscription per event name. Nothing in `scenes/` or `state/` knows they exist.

**30 of the 32 ship. Two do not, on purpose.** `rescue-all` needs all sixteen
Companions freeable and `reach-heart` needs the Heart of the House; both need
regions that are not built. They are written and tested and deliberately not
registered with Steam, because a store page listing achievements nobody can earn
is a review complaint with a screenshot attached. `shippable()` is the list to
register; `plannedFor()` is the list to hold back, so the omission stays visible
rather than being forgotten.

**Steam API Names are derived, not hand-listed:** `first-win` → `ACH_FIRST_WIN`.
Those exact strings must be entered on the partner site. Deriving them is what
stops the two lists drifting.

**Offline is the normal case, not the edge case.** Unlocks are written to the
local save first and pushed to Steam second — a player earns things on a plane,
in the browser build, and while the Steam client is restarting. `reconcile()`
runs at boot and pushes anything Steam missed, and pulls back anything Steam has
that this machine does not (a save that arrived from another PC after the
achievement was earned on it).

---

## Cloud saves

The rewrite is [`game/src/core/storage.js`](../game/src/core/storage.js);
`core/save.js` delegates to it and its API is unchanged and still synchronous,
because `setSetting` is called from a slider's `input` handler.

* **Backend** — host files when a wrapper supplies `storage`, `localStorage`
  otherwise, memory if the device refuses both (private browsing).
* **Read once at boot, write through on a debounced flush**, plus an
  unconditional flush on `pagehide`, on `visibilitychange`, and whenever the
  game pauses. That last one is the Deck going to sleep.
* **Every slot is written twice**, `name` then `name.bak`, backup first. If the
  process dies between the two writes the backup holds the previous good state.
  A read that fails to parse falls back to it.
* **Versioning.** `SAVE_VERSION = 2` with a `MIGRATIONS` chain. A save from a
  **newer** build is refused, left byte-for-byte alone, and `Save.blocked` is
  set so writes are disabled for the session. This is the case Cloud creates on
  day one: play on the desktop, launch the Deck before it has updated, and the
  old build would otherwise merge what it understood, drop the rest, and write
  the result back over a newer save the first time the player touched a slider.
* **Export/import** — the player's manual backup, and how a support request gets
  a reproducible save.

---

## The overlay

`platform:pause` fires for the Steam overlay **and** for the window losing focus,
which is the same requirement arriving two ways. On pause: the clock stops (every
tween, timer and scene update freezes), the AudioContext suspends, the save
flushes, and the gamepad stops being polled because polling hangs off the clock.

A hidden browser tab stops getting `requestAnimationFrame` and freezes itself.
The Steam overlay does **not** hide the window — it composites over a game that
is still running and still resolving an enemy turn the player cannot see.

---

## Controller

[`gamepad.js`](../game/src/input/gamepad.js) reads pads and emits semantic
actions. [`navigation.js`](../game/src/input/navigation.js) decides what an
action means on the screen in front of you. Two mechanisms, both reusing what
already worked for the keyboard:

* **Spatial focus** for menus — real DOM focus moved geometrically, then a click.
  Every screen got controller support the moment its buttons were focusable,
  which they already were.
* **Key forwarding** for combat, which has its own keyboard model in `hand.js`
  (arrow selection, Tab target-cycling, confirm). The pad dispatches the keydown
  the scene already handles, so there is one implementation of aiming rather
  than two that drift.

Measured working: selection along the hand, ending a turn, opening the piles,
cycling enemy targets, driving every menu, and adjusting sliders — left/right on
a range control changes the value instead of moving focus, without which half
the Settings panel is unreachable on a Deck.

**Glyphs follow the pad.** A PlayStation player is told to press ✕, not Ⓐ. Text
rather than sprites: four families times fourteen actions is fifty-six images to
draw, licence and keep in sync with a palette, to say what a circled letter says.

**Text entry uses the Steam on-screen keyboard.** The Treehouse asks for a room
code; a Deck in gamepad mode has nothing to type it with. Confirm on a text field
calls `Platform.steam.showKeyboard()`. Deliberately no in-game key grid as a
fallback: it would be a worse keyboard than the one the only platform that needs
it already provides.

---

## Display: every screen at 1280x800

`tests/steam-deck/run.py` walks all eleven screens at the Deck's native panel and
measures horizontal overflow, unreachable content, the smallest text actually
rendered, and whether a controller can focus anything.

**One real bug found and fixed.** Four scenes are `position:absolute; inset:0;
overflow:hidden`, which is right at 1080p and wrong at 800: content below the
fold was not merely unscrolled, it was unreachable. Measured A/B on Game Over —

| | unreachable elements |
|---|---|
| before | 3, worst `go-btn--primary` clipped 9px — *the button back to the Clubhouse* |
| after | 0 |

The fix is a `max-height: 860px` rule in `ui/base.css` letting those four scenes
scroll, plus pad focus scrolling itself into view. Combat and the map are
excluded: they are fixed boards computed against the viewport and a scrollbar on
either would be a bug rather than a fix.

**Current state: 0 unreachable elements across all 11 screens, no horizontal
scrolling anywhere, every menu controller-focusable.**

### The warning that is not a pass

The smallest rendered text is **9px**, on the Clubhouse, combat, events and the
Shop. That clears the 9px floor this suite asserts and it is *tight on a
seven-inch panel*. Valve asks for legibility rather than a number, so this is a
judgement call somebody should make with a Deck in hand rather than a number
somebody should argue about. The Large Text accessibility setting exists and
helps; it is off by default.

**Two measurements were wrong before they were right**, and both failed the same
way: they sampled mid-animation. A flat 1800 ms wait caught Game Over's footer
still transforming and reported its buttons 6px off the panel; a later probe
caught the resting layout and I concluded the opposite, that they had never been
clipped. Only an A/B with the fix stashed settled it — the buttons *are* clipped
without the rule and are not with it. The suite now waits for `is-entering` to
clear and for the screen to be navigable before it measures anything.

---

## What cannot be checked until there is a build

* SteamOS / Proton compatibility.
* No launcher, no compatibility warning on the store page.
* Suspend/resume against a Deck that is actually asleep.
* That the real Steamworks SDK accepts these API Names.
* That Auto-Cloud syncs the directory `storage.dir()` returns.
* That the real overlay fires the callback this code subscribes to.
* Valve's own Deck review, which is a queue with a wait.

Those are the other half of Deck Verified, and every one of them needs the App ID
first.
