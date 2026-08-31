"""`ANIMATED_EVENTS` says the renderer must animate these. Nothing checked it.

    python tests/animated-events/check.py [--verbose]

`combat/events.js` exports:

    /** Events the renderer must animate rather than just re-render state for. */
    export const ANIMATED_EVENTS = Object.freeze([ … ]);

and NOTHING IMPORTS IT. Grepping the whole repo on 2026-08-31 finds exactly one
reference: the line that declares it. It is a promise about the renderer,
written beside the renderer, and read by nobody — trap 54's shape on a data
export rather than on content, and the third one found this session after
`actor.summonedBy` (trap 56) and the Haunt envelope's `moves` field (trap 57).

There are two honest ways to end that and only one of them is safe. WIRING it —
having `scenes/combat.js` derive its dispatch from the list — replaces a working
switch with a table lookup and would have to be right first time on the one
surface a player looks at for a whole fight. GATING it costs nothing at runtime
and makes the declaration true: this suite reads the list out of the module and
the `case` labels out of `scenes/combat.js`'s event switch, and requires that
every event the list names has somewhere to be animated.

The list is also checked in the other direction, because a control that cannot
fail is not a control (trap 52): every id in it must be a real `EV` value, so a
renamed event cannot leave a dead string behind in the list itself.

What it does NOT claim: that the animation is good, or that the case does more
than re-render. That is a screenshot's job, and this project has one.

Prints `RESULT: n passed, m failed`. Exit 0 only when m == 0.
"""
import argparse
import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[2]
EVENTS = ROOT / "game" / "src" / "combat" / "events.js"
SCENE = ROOT / "game" / "src" / "scenes" / "combat.js"


def read(p):
    return p.read_text(encoding="utf-8", newline="")


def ev_table(src):
    """The EV map: NAME -> 'event:string'."""
    body = src[src.index("export const EV"):]
    body = body[: body.index("});") + 3]
    return dict(re.findall(r"([A-Z_0-9]+):\s*'([^']+)'", body))


def animated_names(src):
    body = src[src.index("export const ANIMATED_EVENTS"):]
    body = body[: body.index("]);") + 3]
    return re.findall(r"EV\.([A-Z_0-9]+)", body)


def scene_cases(src):
    return set(re.findall(r"case\s+'([^']+)'\s*:", src))


def main(a):
    passed = failed = 0
    notes = []

    def check(cond, label, detail=""):
        nonlocal passed, failed
        if cond:
            passed += 1
            notes.append(("PASS", label, detail))
        else:
            failed += 1
            notes.append(("FAIL", label, detail))

    esrc, ssrc = read(EVENTS), read(SCENE)
    ev = ev_table(esrc)
    names = animated_names(esrc)
    cases = scene_cases(ssrc)

    check(len(ev) >= 30, "the EV map loads", f"{len(ev)} event types")
    check(len(names) >= 20, "ANIMATED_EVENTS loads", f"{len(names)} entries")
    check(len(cases) >= 30, "the combat scene's event switch loads",
          f"{len(cases)} case labels")

    # ── every entry names a real event ────────────────────────────────────
    unknown = [n for n in names if n not in ev]
    check(not unknown,
          "every entry in ANIMATED_EVENTS is a real EV member — a renamed event "
          "cannot leave a dead string behind in the list",
          ", ".join(unknown) or f"{len(names)} entries resolve")

    # ── and every one of them has somewhere to be animated ────────────────
    missing = sorted({ev[n] for n in names if n in ev} - cases)
    check(not missing,
          "every event the renderer is TOLD to animate has a case in the combat "
          "scene",
          ", ".join(missing) or f"{len(names)} events, all handled")

    # ── the list is not a duplicate of the map ────────────────────────────
    check(len(set(names)) == len(names),
          "and it names each event once",
          ", ".join(sorted({n for n in names if names.count(n) > 1})) or "no repeats")

    # ── the control: it must be able to FAIL ──────────────────────────────
    #
    # A gate that cannot fail is not a gate (trap 52). Injecting an event the
    # scene has no case for must produce exactly one finding.
    probe = sorted(set(ev.values()) - cases)
    check(bool(probe),
          "CONTROL: there is at least one EV value with no case, so the check "
          "above is capable of failing",
          f"{len(probe)} unanimated events exist: {', '.join(probe[:6])}")

    for kind, label, detail in notes:
        if kind != "PASS" or a.verbose:
            print(f"{kind}  {label}" + (f"  - {detail}" if detail else ""))
    print("\nRESULT: %d passed, %d failed" % (passed, failed))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    sys.exit(main(ap.parse_args()))
