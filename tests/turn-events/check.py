"""Gate: `turn:start` / `turn:end` listeners must say which side they mean.

    python tests/turn-events/check.py

WHY THIS EXISTS
---------------
The engine emits `turn:start` and `turn:end` for the PLAYER **and for every
enemy on the board** (`side: 'enemy'`). A listener written as

    e.on('turn:start', () => { ... })

therefore fires once for the player and once per enemy — three times a round in
a two-enemy fight. Every Companion tracker in this build was written that way,
and all four consequences shipped:

  * Marmalade's Untouched was decided by whichever enemy swung LAST, because the
    baseline Courage was overwritten mid-enemy-phase. Verified by running a solo
    Marmalade fight where the first enemy hits for 9 and the second only blocks:
    the Kid ended on 61 Courage and was still "Untouched". Her entire Untouched
    archetype did nothing in any fight with more than one enemy.
  * Bones' Buried countdown ticked once per enemy, so buried cards resurfaced in
    about a third of the intended turns.
  * Pipkin's Patch ran a growth step per enemy and zeroed Height repeatedly.
  * Taffy's Stretch counters climbed on every enemy turn end.

None of it produced a console error, a failing test, or a visible symptom short
of the numbers being wrong — the same silent-at-the-seam shape as CONTRACTS
rule 8. `state/run.js` had it right all along (`if (ev.side !== 'player')
return`), which is what made the pattern findable.

THE RULE
--------
Any `.on('turn:start')` / `.on('turn:end')` outside `src/combat/` must either
go through `U.onPlayerTurn(engine, 'start'|'end', fn, seat)` or filter on
`ev.side` itself within a few lines of the handler.

Exit code 1 if an unguarded listener exists.
"""
import os, re, sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "game", "src")

# The engine itself is allowed to listen raw — it is the thing doing the emitting.
SKIP_DIRS = {os.path.join(SRC, "combat")}

LISTEN = re.compile(r"""\.on\(\s*['"]turn:(start|end)['"]""")
# A guard counts if it inspects `side` in the handler body that follows.
GUARD = re.compile(r"\bside\s*!==?\s*['\"]player['\"]|\bside\s*===?\s*['\"]player['\"]")
HELPER = re.compile(r"\bonPlayerTurn\s*\(")

# Lines around the listener searched for a side check. Both directions, because
# a named handler is usually declared just ABOVE the line that registers it:
#   const h = (ev) => { if (ev.side !== 'player') return; ... }; e.on(type, h);
AHEAD, BEHIND = 6, 8

COMMENT = re.compile(r"^\s*(//|\*|/\*)")


def scan(path):
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    bad = []
    for i, line in enumerate(lines):
        if not LISTEN.search(line):
            continue
        # A doc comment explaining this very trap is not an instance of it.
        if COMMENT.match(line):
            continue
        if HELPER.search(line):
            continue
        window = "\n".join(lines[max(0, i - BEHIND):i + AHEAD])
        if GUARD.search(window):
            continue
        bad.append((i + 1, line.strip()))
    return bad


def main():
    problems, checked = [], 0
    for base, dirs, files in os.walk(SRC):
        if any(base == d or base.startswith(d + os.sep) for d in SKIP_DIRS):
            continue
        for fn in files:
            if not fn.endswith(".js"):
                continue
            path = os.path.join(base, fn)
            checked += 1
            for ln, text in scan(path):
                problems.append((os.path.relpath(path, ROOT).replace("\\", "/"), ln, text))

    for rel, ln, text in problems:
        print(f"  {rel}:{ln}")
        print(f"      {text[:110]}")
        print("      -> use U.onPlayerTurn(e, 'start'|'end', fn, seat), or check ev.side yourself.")
        print("         The raw event also fires once per ENEMY.")

    print(f"RESULT: {checked} files scanned, {len(problems)} unguarded turn listeners")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
