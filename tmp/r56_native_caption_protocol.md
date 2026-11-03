# Shared timing-only caption protocol

This is common validation guidance, not sibling design/source. The full
tests/ui-r51-spinel/probe-queue.py fixture stays unchanged. Its CHECK contains
two measured getComputedStyle call sites for owner captions. In your own native
ABBA helper only, make these exact additional substitutions after extracting
CHECK and adding rawFrameTimes:

    CHECK=CHECK.replace("getComputedStyle(el).visibility==='visible'", "el.style.visibility==='visible'")
    CHECK=CHECK.replace('parseFloat(getComputedStyle(el).fontSize)', 'window.r56CaptionFont')
    assert 'getComputedStyle' not in CHECK

The actual engine _syncOwnerCaptions assigns inline visible/hidden and the
caption class supplies the common font. Preserve every other CHECK assertion.
In the existing preflight/postflight SNAPSHOT, create a .cb-fx-owner probe in
the actual fx.$nums host (the temporary cb-num can be reused after changing its
class). Cache parseFloat(getComputedStyle(probe).fontSize) in
window.r56CaptionFont and return ownerFont. Require ownerFont>=17 and exact
before/after equality. Outside measured animation, explicitly set the probe's
inline visibility to visible and hidden, checking computed visibility matches
both; return ownerVisibilityControlled:true. Remove the probe. All these style
reads occur before/after the timed CHECK, never within it. Do not alter engine,
caption markup, lifetime, queue, geometry or full-fixture assertions.

Export the exact executed string using
write_bytes(CHECK.encode('utf-8')) to native-material-timing/measured-check.js.
Record measuredCheckSHA256 from those exact bytes, harnessSHA256 from your helper
file and importedFixtureSHA256 from the unchanged full fixture. Preserve all
native stylesheet, asset URL/HTTP/decode/local hash, kind font/color and before/
after style checks. Root will reconstruct the executed CHECK independently.

If you already ran an earlier native comparison, retain its directory, source,
logs and raw arrays separately. Do not relabel it or overwrite it. Report the
actual protocol used, without a speedup claim or choosing a favorable rerun.
No need to rerun the full functional fixture for this test-only correction.
