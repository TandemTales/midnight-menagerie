"""Every cue in the sound bank must be reachable from somewhere.

    python tests/audio/cues.py [--verbose]

`game/src/audio/sfx.js` defines 46 cues, each hand-built out of `dsp.js` — real
work, tuned, with a waveform strip in `shots/`. On 2026-08-29 **twelve of them
could not be played by anything**. The victory-purse sting, the Companion
rescue phrase, the coin, the treasure lid, the mended-Trick knock: all authored,
all silent. The only thing that would ever have asked for them was a bus handler
in `audio.js` listening for a name nothing emits (CONTRACTS 54).

`tests/bus-names/check.py` gates the other half of that — a subscription whose
name has no emitter. This is the mirror: a SOUND whose id has no caller.

── What counts as reachable ────────────────────────────────────────────────

The id appears as a quoted string in some `game/src/**/*.js` other than
`sfx.js` itself. Deliberately loose, and the looseness is the point: ids are
chosen inside ternaries (`play(isPlayer ? 'combat:player-hurt' : 'combat:hit-light')`),
built into lookup tables, and passed through variables. A checker that only
matched `play('literal')` reported five false positives the first time this
analysis was run by hand.

It is loose in the safe direction. A mention is not proof a sound plays, but the
absence of any mention IS proof it cannot — and that is the failure this exists
for. `tests/seams/check.py` UNKNOWN-SFX covers the opposite error, an id that is
asked for and does not exist.

Aliases resolve to their target: if something plays `card:pick`, the cue it
aliases to is reached.

Exit code 1 when a cue has no caller and is not in UNREACHABLE below.
"""
import argparse
import io
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "game", "src")
SFX = os.path.join(SRC, "audio", "sfx.js")

# Cues with nothing to hang them on. Each needs a MECHANIC or an EVENT that does
# not exist, so wiring one means building that first — which is why they are
# named here rather than quietly tolerated.
UNREACHABLE = {
    "combat:crit":
        "there is no crit in this game. The `damage` event (combat/events.js) "
        "carries no crit field and nothing sets one; the single occurrence of a "
        "crit flag in the repo is this suite's own soundboard payload. Wiring "
        "it means designing critical hits first.",
}


def read(p):
    return io.open(p, encoding="utf-8", newline="").read()


def js_files():
    out = []
    for base, dirs, files in os.walk(SRC):
        dirs[:] = [d for d in dirs if d not in ("vendor", "node_modules")]
        out += [os.path.join(base, f) for f in sorted(files) if f.endswith(".js")]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()

    sfx = read(SFX)
    # `[A-Za-z0-9]` and not `[a-z0-9]`: the bank holds `card:pickUp`, and a
    # lower-case-only class silently left one cue unchecked — which is the
    # failure this whole file exists to catch, in the file that catches it.
    cues = set(re.findall(r"^\s{2}'([A-Za-z][A-Za-z0-9:_-]+)':\s*\{", sfx, re.M))
    alias = dict(re.findall(r"^\s{2}'([A-Za-z][A-Za-z0-9:_-]+)':\s*'([A-Za-z][A-Za-z0-9:_-]+)'",
                            sfx, re.M))

    callers = {}
    for p in js_files():
        if os.path.abspath(p) == os.path.abspath(SFX):
            continue
        rel = os.path.relpath(p, ROOT).replace("\\", "/").replace("game/src/", "")
        s = read(p)
        for name in set(cues) | set(alias):
            if "'" + name + "'" in s or '"' + name + '"' in s:
                callers.setdefault(name, set()).add(rel)

    # an alias being called reaches its target
    for a_id, target in alias.items():
        if a_id in callers:
            callers.setdefault(target, set()).update(callers[a_id])

    silent = sorted(c for c in cues if c not in callers)
    unexpected = [c for c in silent if c not in UNREACHABLE]
    fixed = [c for c in UNREACHABLE if c in callers]

    if a.verbose:
        for c in sorted(cues):
            who = ", ".join(sorted(callers.get(c, []))) or "— nothing —"
            print("  %-28s %s" % (c, who))

    for c in unexpected:
        print(f"  SILENT  '{c}' — in the bank, called by nothing")
    for c in sorted(UNREACHABLE):
        if c in callers:
            print(f"  NOW REACHED  '{c}' is called by "
                  f"{', '.join(sorted(callers[c]))} — remove it from UNREACHABLE")
        else:
            print(f"  known silent  '{c}' — {UNREACHABLE[c].split('.')[0]}")

    print(f"\nRESULT: {len(cues)} cues, {len(cues) - len(silent)} reachable, "
          f"{len(unexpected)} silent, {len(UNREACHABLE)} known-silent")
    # A cue that starts working must not stay on the list: the list is a claim
    # about the code and a stale one reads as a gap that is still open.
    return 1 if (unexpected or fixed) else 0


if __name__ == "__main__":
    sys.exit(main())
