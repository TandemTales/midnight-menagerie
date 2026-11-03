# GARNET round50 selected-build lifecycle repair

When a scene removed an enemy view while one of its condition labels waited
for space, refreshing the label's bounds returned no owner. The retry rendered
an unowned label but retained the queued entry, repeatedly showing it forever.
The selected repair refreshes bounds once and retires obsolete pending visual
entries whose owner has left. It preserves delivery for remaining owners and
does not change engine effects, fonts, animation duration or actor placement.

The three-case Node regression covers removed-owner cleanup, ordinary live
delivery, and preservation of another owner's queued label. Removed/mixed
cases fail before the fix; all three pass afterward. The real-scene browser
test first queues Vulnerable at320px, removes the actual scene view, restores
1280 and verifies no orphan replay, followed by live-player Dexterity delivery.

- Baseline browser:169 orphan-label frames in180 sampled frames, queue remained
  occupied and never drained; no page errors. The live-player control worked.
- Test-only module prototype:0 orphan frames in174, queue empty, normal live
  delivery and drain; no page errors. No comparison build was changed.
- Actual selected build, no override:0 orphan frames in173, queue empty,
  surviving-player label retains its1.03268 game-second lifetime and drains;
  no page errors. Evidence is GARNET-r50-lifecycle-selected.json.
- All seven selected-build browser gates pass: chrome, steam-deck, gamepad,
  events, gameover-keeps, seams/proof and combat-scene/seam.
- Static scene CSS:0 conflicts; CSS tokens:0 undefined references; JS syntax
  and endings checks pass. Seam audit checks9108 calls and reports only the4
  unchanged local-Map false positives in floorplan.js.

Portable regressions, from repository root with the local server running:

```
node tests/ui-r50/queue-lifecycle.mjs
python tests/ui-r50/queue-lifecycle.py --port 9502 --out shots/lifecycle
```

The browser test's optional --fx-override is only for isolated diagnosis; the
selected-build pass above uses no override. Cancelling obsolete pending
presentation when its owner leaves is intentional. Existing live-owner FIFO
and full-lifetime guarantees remain, as does the scene-exit FX cleanup.
Original blind comparison images remain frozen. The combat pair is retaken
after this repair; the eight unchanged board images retain their provenance.
