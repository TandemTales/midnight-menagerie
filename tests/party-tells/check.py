"""An AoE move must not tell one Kid it is coming for them. OWNER: enemies.

    python tests/party-tells/check.py [--root game/src/data]

A gate against a bug class, in the family of tests/dup-keys, tests/hook-names
and tests/status-names.

WHY THIS EXISTS
---------------
`partyTarget: 'all'` hits every Kid at the table. `partyTarget: 'two'` hits two.
The TELL is the promise the game makes about what is about to happen — this
project's own quality bar opens with "the player can always see exactly what
will happen before it happens".

Four moves made that promise to the wrong number of people, and had since the
day party play was built:

    foyer.js      Run the Hall     "Every inch of carpet snaps taut, pointed
                                    directly at you."
    nursery.js    Toy Barrage      "It throws its own contents at you, one
                                    handful at a time."
    butler.js     (tidying)        "He produces a cloth and begins, briskly,
                                    to tidy you."
    governess.js  (a seam)         "She takes in a seam somewhere on you that
                                    you did not know you had."

Every one of them is `partyTarget: 'all'`. At four Kids, all four players read a
tell addressed personally to them, and then all four were hit. Toy Barrage's own
code comment even says "in a party there are more of you to throw them at" — the
author knew, and the string never moved.

Nothing caught it because nothing was looking: the enemy suite asserts what a
move DOES and the audit walks 2085 turns of intents, and neither has an opinion
about the English.

THE RULE
--------
A move with a `partyTarget` may not carry a `tell` that addresses a single
person ("you", "your", "yourself") unless it also has a `tellFn`, which is the
seam `combat/intents.js` already provides for a tell that depends on the board.
`tellFn` lets solo keep the intimate wording and a party hear the truth, which
is better than one compromise sentence that serves neither.

A tell with no second-person address at all is fine and needs nothing: "A dozen
umbrellas open at once and swing in a single wide arc" is true at any table
size, and most of them already read that way.

Exit code 0 only when there are no violations.
"""
import argparse
import io
import os
import pathlib
import re
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = pathlib.Path(__file__).resolve().parents[2]

PARTY = re.compile(r"partyTarget\s*:")
TELL = re.compile(r"(?<!Fn)\btell\s*:\s*'((?:\\.|[^'])*)'")
TELLFN = re.compile(r"\btellFn\s*:")
ID = re.compile(r"\bid\s*:\s*'([^']+)'")
# Second person singular, as a whole word. "your friends" is still singular
# address for this purpose - it is speaking to one reader.
SECOND = re.compile(r"\b(you|your|yours|yourself)\b", re.I)


def is_comment(line):
    s = line.strip()
    return s.startswith("*") or s.startswith("//") or s.startswith("/*")


def moves_in(text):
    """Yield (line_no, id, body) for every move that declares a partyTarget.

    BOUNDED BY THE MOVE, not by a line window. The first version of this took
    a +/-14 line window around each `partyTarget:` and searched it for a tell,
    which reported the Thing Beneath's UNDER THE BED - whose own tell is "Every
    noise in the room stops at once", perfectly fine - as carrying the tell of
    a DIFFERENT move fourteen lines above it. A gate that cries wolf gets
    switched off, so it reads one move at a time now.

    A move starts at its own `id: '...'` and ends where the next one starts.
    That is the shape every enemy file in this project actually uses, and it
    needs no brace matching, which is the thing there is no parser for offline.
    """
    lines = text.split("\n")
    starts = [i for i, l in enumerate(lines) if ID.search(l) and not is_comment(l)]
    for n, i in enumerate(starts):
        end = starts[n + 1] if n + 1 < len(starts) else len(lines)
        body_lines = lines[i:end]
        # `partyTarget` must be REAL code in this move, not its prose.
        if not any(PARTY.search(l) and not is_comment(l) for l in body_lines):
            continue
        yield i + 1, ID.search(lines[i]).group(1), "\n".join(body_lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="game/src/data")
    a = ap.parse_args()

    root = ROOT / a.root
    files = sorted(p for p in root.rglob("*.js"))
    problems = []
    checked = 0

    for f in files:
        try:
            text = io.open(f, encoding="utf-8", newline="").read()
        except Exception:
            continue
        rel = os.path.relpath(f, ROOT).replace("\\", "/")
        for line_no, move_id, body in moves_in(text):
            checked += 1
            if TELLFN.search(body):
                continue
            m = TELL.search(body)
            if not m:
                continue
            tell = m.group(1)
            if SECOND.search(tell):
                problems.append((rel, line_no, move_id, tell))

    print(f"party-tells: {checked} move(s) with a partyTarget, "
          f"across {len(files)} files under {a.root}")
    if not problems:
        print("RESULT: 0 AoE tells that address one Kid")
        return 0

    for rel, line_no, move_id, tell in problems:
        print(f"  {rel}:{line_no}  {move_id}")
        print(f"      tell: {tell!r}")
    print(f"RESULT: {len(problems)} AoE tells that address one Kid")
    print("A move that hits the whole table must not promise one player it is "
          "coming for them. Give it a `tellFn` — solo keeps the intimate "
          "wording, a party is told the truth.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
