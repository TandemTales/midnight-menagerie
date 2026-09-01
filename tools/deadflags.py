"""Find per-actor `mem` flags that are WRITTEN and never READ anywhere.

    python tools/deadflags.py [--verbose]

Every dead seam this project has found has this shape. `actor.summonedBy` was
read by five content sites in three regions and written by nothing. The
Watcher's `grounded` was written and read only by the half of its own rule that
worked, so "cannot gain Guard until it climbs back" was printed to the player
and never enforced. The Topiary Beast's `shelled` was written and read by
nothing at all, so §7's "its next attack deals 4 additional damage" never once
happened.

READS ARE CHECKED ACROSS THE WHOLE OF game/src, NOT PER FILE. The first version
of this scanner looked inside one file and reported 26 candidates; this codebase
deliberately writes flags in one file and reads them in another - `heart.js`
documents `remnant: true` as "what the Housekeeper's Tidy Up looks for" - so a
per-file scan turns every cross-file convention into a false positive. Repo-wide
it was 14.

IT IS A HEURISTIC AND IT PRINTS CANDIDATES, NOT VERDICTS. Most survivors are
dead WEIGHT rather than dead RULES: `ballroom.guarding` duplicates a protection
that really runs on `_curtain`, `heart.damageDone` was superseded by the
engine's own `damageTakenThisTurn`. The question that separates them is the one
HANDOFF asks of an unused export - does the field make a CLAIM? A flag whose
name appears in an `announceRule` text, a design chapter or a Haunt note is
promising the player something. A flag that merely records what happened is not.

Exit code is always 0: this is an audit, not a gate. A gate would be permanently
red on thirteen harmless fields.
"""
import re
import sys
import pathlib
import argparse
import collections

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "game" / "src"
SCAN = [SRC / "data" / "bosses", SRC / "data" / "enemies"]

# m.foo = / mem(c).foo = / (x.mem ||= {}).foo = / s.mem.foo =
WRITE = re.compile(
    r"(?:\bm\.|\bmem\(\w+\)\.|\.mem\)\.|\.mem\.|\bmm\.)([A-Za-z_]\w*)"
    r"\s*(?:=[^=]|\+\+|--|\+=|-=)")

# Structural names, and array/Map/Set members that are not per-actor state.
SKIP = {
    "phase", "length", "push", "filter", "map", "slice", "join", "find", "id",
    "name", "text", "hp", "maxHp", "block", "alive", "mem", "self", "player",
    "toFixed", "forEach", "some", "every", "includes", "indexOf", "keys",
    "concat", "sort", "reduce", "split", "replace", "trim", "add", "has",
    "delete", "get", "set", "size", "value", "label", "turnsLeft", "reason",
}


def strip_comments(s):
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    return re.sub(r"(?m)^\s*//.*$", "", s)


def main(a):
    # every source file, comments stripped, so a name that only appears in prose
    # does not count as a read
    corpus = {}
    for p in SRC.rglob("*.js"):
        corpus[p] = strip_comments(p.read_text(encoding="utf-8", errors="replace"))

    writers = collections.defaultdict(list)
    for d in SCAN:
        for p in sorted(d.glob("*.js")):
            for key in set(WRITE.findall(corpus[p])):
                if key not in SKIP and not key.startswith("_"):
                    writers[key].append(p)

    dead = []
    for key, files in sorted(writers.items()):
        reads = 0
        for p, s in corpus.items():
            uses = len(re.findall(r"\.%s\b" % re.escape(key), s))
            asg = len(re.findall(
                r"\.%s\s*(?:=[^=]|\+\+|--|\+=|-=)" % re.escape(key), s))
            reads += max(0, uses - asg)
        if reads == 0:
            dead.append((key, files))
        elif a.verbose:
            print("  read %-3d %-24s %s" % (reads, key,
                                            ", ".join(f.name for f in files)))

    print("mem flags WRITTEN and never READ anywhere in game/src")
    print("=" * 68)
    for key, files in dead:
        print("  %-24s %s" % (key, ", ".join(f.name for f in files)))
    print()
    print("%d candidate(s). Confirm each by hand: does the field make a CLAIM -"
          % len(dead))
    print("a rule text, a design chapter line, a Haunt note? Then it is a defect.")
    print("Otherwise it is spare bookkeeping and costs the player nothing.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true",
                    help="also list flags that ARE read, with the count")
    sys.exit(main(ap.parse_args()))
