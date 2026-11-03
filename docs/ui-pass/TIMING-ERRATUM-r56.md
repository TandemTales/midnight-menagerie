# Timing protocol correction discovered in Round56

The native ABBA helpers used in Round54 (MORGANITE, PERIDOT, KUNZITE) and
Round55 (JADE, IOLITE, ZIRCON) import CHECK from
tests/ui-r51-spinel/probe-queue.py. CHECK has two getComputedStyle call sites
inside its measured frame loop: one reads each owner caption's visibility and
the other reads visible captions' font size. Disabling screenshot pauses did
not remove those style queries.

Any description of these runs as having no style queries during measured
animation is incorrect and is withdrawn. The raw arrays remain intact and
describe the actual instrumented geometry harness, including those calls.
They are not query-free measurements or isolated ordinary-game rendering
costs. Native stylesheet routing, asset HTTP/decode/hash checks, zero screenshot
pauses, before/after style equality and full-lifetime functional results remain
valid where recorded. No game defect or invalid blind image comparison follows
from this instrumentation issue. Earlier Round53 retractions remain in force.

The correction is confined to the timing helper. The full functional fixture
retains its original per-frame checks. For the timing-only CHECK, the existing
engine-maintained caption visibility is read inline; caption font size is
cached in preflight and reverified after drainage. The current engine sets
caption visibility explicitly to visible/hidden and does not assign per-owner
fonts. The timing preflight also checks computed visibility against both inline
states. All DOM/Range, collision, locality, caption-name/count, cleanup, duration
and per-owner FIFO assertions remain. The exact executed CHECK bytes and source
hashes must be saved, with an assertion that CHECK contains no getComputedStyle.

Round56 ONYX identified the issue before its native timing trials. Its first
corrected run lacked the later explicit visibility-equivalence preflight and
used a text export whose line endings could differ from the executed string.
That run is retained separately. A second bounded comparison adds those checks
and exact byte export; it is a protocol refinement, not a rerun chosen for a
preferred timing result. TOPAZ and AMBER receive the same protocol before their
native trials. Final proof status belongs in their reports and RESULTS-r56.json.

Historical selected files and raw evidence are preserved. This erratum and the
annotated parent RESULTS records supersede conflicting prose in earlier notes.
