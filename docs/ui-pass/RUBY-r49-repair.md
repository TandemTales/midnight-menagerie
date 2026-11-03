# RUBY round 49 combat repair

The selected RUBY build now keeps condition labels beside their actual owner and clear of actor art and controls. When a complete local group cannot fit, only the overflow waits in a presentation queue. Engine status effects and persistent status icons still update immediately. No text is shortened or dropped, and font sizes, animation durations, gameplay, actor placement and the global slower-animation setting are unchanged.

This deliberately replaces the original crowded-board requirement that all six labels be visible together. Forcing six full-size ribbons into the narrow empty band produced misleading ownership or overlaps. The approved replacement requires delivery conservation, FIFO per owner, original full lifetimes, owner locality and clearance on every sampled frame. Both boss fixtures still display all six together.

## Production files

- `game/src/fx/combatfx.js`: compact owner-group candidate layouts; per-label horizontal owner neighborhoods; full pop/fade envelope reservation; bounded joint search; FIFO overflow queue; fresh bounds and idle retry every 0.25 game-seconds. Owned words stay stationary while retaining their original pop/fade and full duration. Numeric damage floaters retain their existing motion.
- `game/src/scenes/combat.js`: actual loaded Maya and companion sprite bounds, enemy stage bounds, and visible HUD/intent/guard/name/health/hand/help/player-mechanic exclusions. Blocked-number calls now carry their target identity. Fresh geometry is available when queued labels retry.
- `game/src/scenes/combat.css`: centre owned ribbons and trim empty padding only; no font-size changes.

No other production files were edited by this repair agent. Root owns commits and line-ending normalization.

## Reproducible checks

With the game served locally, run from the repository root:

```powershell
$env:R49_URL='http://localhost:9492'
python tests/ui-r49/probe-queue.py
python tests/ui-r49/probe-idle-resize.py
```

Python Playwright and installed Chrome are required. `R49_OUT` optionally changes the output folder. `R49_QUICK=1` runs only the three initial 1280 cases. The full proof uses the actual loaded Maya sprite and real `engine.applyStatus` events, seed 42, Bones, the foyer boss, and the true four-enemy Passages / Narrow Corridor standard encounter. It checks boss plus each enemy's three-status group alongside Maya's three statuses, all four enemies' Vulnerable plus Maya's Dexterity/Regen, and six identical Vulnerable events on one enemy, at 1280x800 and 1600x900.

Final machine evidence: [RUBY-r49-repair-proof.json](RUBY-r49-repair-proof.json). Screenshots are under `shots/r49-repair/queue/`.

## Results

- 14/14 cases passed, 84/84 distinct serial-numbered label starts and expiries, zero page errors, zero detected protected-art/UI/label/viewport/locality collisions across 3,099 sampled frames. All 84 expiries reached or exceeded their original 1.0326795297 game-second duration; delayed labels start with a fresh full duration. No lifetime was consumed while queued.
- Boss: six simultaneous labels at both sizes; unpaused burst-to-drain 2.417s / 2.470s.
- Ordinary crowded cases: worst drain 4.833s at 1280, about 2.416s beyond the 1280 boss burst; worst 1600 drain 3.096s. Maximum observed onset from the original burst was 3.293s at 1280 / 1.562s at 1600. These onset values include the game's existing sequential event dispatch and therefore upper-bound queue-only waiting; queue-only latency was not separately isolated.
- Repeated-label stress: all six identical labels delivered exactly once and started in serial order 1, 2, 3, 4, 5, 6 at both sizes. Dense 1280 geometry permits one at a time: 9.336s total drain, maximum onset 7.790s. At 1600, peak 3 and 3.470s total drain. This longer stress-case duration preserves every full lifetime instead of collapsing repeats.
- Idle singleton / resize: a real `+2 Vulnerable` waited alone at 320px with zero live labels for 1.8s. After resize to 1280, it became visible in 0.137s, then expired at 1.04147 game-seconds against its unchanged 1.03268 duration. Queue ended empty; no page errors. This verifies recovery when no active label can trigger an expiry retry.
- Performance: 183 measured layout calls; p95 1.9ms, maximum 8.6ms. Per-case animation-frame interval p95 ranged 19.6–49.1ms; worst interval 104.3ms. The deliberate 500ms screenshot pause is excluded from timing and drain calculations. These are observed desktop/Chrome timings, not a guaranteed FPS claim; root briefly ran a CPU-only static audit during part of the proof. No repeat was needed because measured layout work stayed bounded.
- JavaScript syntax checks passed for both edited JS files; Python compile checks passed for the probe sources. Root runs the broader selected-build gates.

## Limits

Presentation can lag an already-applied effect while a narrow actor neighborhood is occupied. Persistent status icons remain immediate. An exceptionally narrow viewport may retain a label until space returns; the idle retry recovers after resizing, and scene exit clears FX as before. Full collision testing covers the specified static combat fixtures and complete pop/fade cycles, not arbitrary mid-animation window resizing or every possible future custom status string. The former collision-only proof was rejected when it missed the Loose Bones panel or allowed misleading distant ownership; it is retained only as development evidence, not the final pass.

## Root memorial repair and regression validation

The memorial progress plaque and featured card now occupy separate rows, and the outer continuation control has a dedicated footer row. The inner inventory cue also has its own grid row. No type was reduced. Normal and long-collection checks passed at1600x900 and1280x800: every16/109 Trick target is reachable, all8 stats clear the footer, heading/card and cue intersections are zero, and Enter/Space scroll without leaving the scene. Evidence is in the two repair-memorial JSON files.

Portable checks: `python tests/ui-r49/memorial.py --port 9492` and the same command with `--long-deck`; use `--out` to select an evidence directory. `python tests/ui-r49/shop-rules.py 9492 shots/shop-rules.json` checks actual rule-text rectangles and banner occlusion.

All seven selected-build browser gates pass: chrome27/0, steam-deck6/0, gamepad23/0, events, gameover-keeps16/0, seams/proof, and combat-scene/seam22/0. Static scene-css has0 conflicts; css-tokens has0 undefined tokens. The static seam audit checked9104 calls and found only the4 unchanged floorplan local-Map false positives. Original blind comparison images remain untouched; repaired gameover/combat images are retaken separately before integration.
