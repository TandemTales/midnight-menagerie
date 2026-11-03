# Original enemy clips at 30 fps

The 29 preexisting animated enemies now use 30 fps for all 118 clips: idle, attack, hurt, defeat, and the Butler/Governess casts. Only the `fps` values in `game/assets/sprites/enemy-clips/<id>/index.json` changed. Original formatting, image pixels, frame order, loop/hold flags and gameplay/runtime code were preserved.

All 118 original source sheets have 81 occupied cells in 9×9 grids. The existing packed clips already have 48 frames except defeat clips with 11–48. Those selections were retained. Idle is now 1.6 seconds instead of about 4.05; attack/hurt are 1.6 instead of about 1.35; cast is 1.6 instead of about 1.69. Defeat duration increases from 0.275–1.2 to 0.367–1.6 seconds. Existing event scheduling, global slow motion and reduced-motion behavior remain unchanged.

The actual `ClipPlayer` and `EnemyView._tickClip` modules passed a headless seam test across 118 clips and 5,067 frame samples, including loop/hold/end behavior, 60/144 Hz updates and an incorrect-rate negative control. The existing static checker passed 826 checks; its two remaining findings concern the already-paused new assets intentionally absent from the live registry. No browser-rendered or full gameplay test was performed.

The immutable preservation baseline now records 3,379 unchanged files plus 29 explicitly authorized, exact-hash, fps-only metadata changes. New provisional assets remain untouched and production remains paused. Historical orientation derivatives are not integrated or retimed by this maintenance.

Exact paths, per-clip before/after timings, original metadata backups and test evidence: [timing maintenance report](../enemy-roster-2026-10-26/animation-production/legacy-30fps-2026-10-27/REPORT.txt). Future sprite rebuilds must intentionally preserve/reapply this timing policy; the historical build pipeline was not modified or run.
