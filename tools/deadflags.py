"""Find content state that is written and never read, or read and never written.

    python tools/deadflags.py [--reads] [--verbose]

Every dead seam this project has found has one of two shapes, and they are
different bugs:

  WRITTEN, NEVER READ   the state is recorded and no rule consults it, so the
                        rule the author meant to write does not exist. The
                        Topiary Beast's `shelled` (§7's "its next attack deals 4
                        additional damage") and the Oven Maw's `preheated`
                        (§12's "the next baked enemy emerges one turn earlier")
                        were both this, and neither had ever run.

  READ, NEVER WRITTEN   the guard clause is always false, so a finished-looking
                        rule silently does nothing. `actor.summonedBy` was this
                        - read by five content sites across three regions and
                        written by NOTHING - and it cost the House Bell's
                        Resonance lever, the Toy Chest's summon cap, its Tidy
                        Up, and the Wardrobe's despawn-on-death.

The second is the more expensive shape and is what `--reads` looks for.

READS AND WRITES ARE BOTH COUNTED ACROSS THE WHOLE OF game/src. The first
version of this scanner looked inside one file; this codebase deliberately
writes a flag in one file and reads it in another - `heart.js` documents
`remnant: true` as "what the Housekeeper's Tidy Up looks for" - so a per-file
scan turns every cross-file convention into a false positive. Per file it was
26 candidates; repo-wide it was 14.

IT PRINTS CANDIDATES, NOT VERDICTS, and confirming them is the expensive half.
Most survivors of the write side are dead WEIGHT rather than dead RULES:
`ballroom.guarding` duplicates a protection that really runs on `_curtain`,
`heart.damageDone` was superseded by the engine's own `damageTakenThisTurn`. The
question that separates them is the one HANDOFF asks of an unused export - does
the field make a CLAIM? A name that appears in an `announceRule` text, a design
chapter or a Haunt note is promising the player something. A name that merely
records what happened is not. The 2026-09-01 verdicts are tabulated in
docs/notes/2026-09-01-the-write-only-flag-sweep.md so that pass is not repeated.

Exit code is always 0: this is an audit, not a gate. A gate would be permanently
red on a dozen harmless fields.
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
CONTENT = [SRC / "data" / "bosses", SRC / "data" / "enemies"]

# m.foo = / mem(c).foo = / (x.mem ||= {}).foo = / s.mem.foo =
MEM_WRITE = re.compile(
    r"(?:\bm\.|\bmem\(\w+\)\.|\.mem\)\.|\.mem\.|\bmm\.)([A-Za-z_]\w*)"
    r"\s*(?:=[^=]|\+\+|--|\+=|-=)")

# Any property read in content: actor.foo, c.self.foo, a.foo, def.foo
PROP_READ = re.compile(r"\.([A-Za-z_]\w*)\b")

# An assignment ANYWHERE, in any form the codebase uses. All five matter, and
# the first version had only the first two - which reported every `export const
# ATTIC_ENEMIES = [...]` in enemies/index.js as read-but-never-written, because
# a module-level declaration is not a property write.
#   .foo = / .foo++ / .foo +=        an ordinary write
#   foo: value                       an object-literal key, which is how enemy
#                                    defs declare almost everything
#   const foo = / let / var          a declaration
#   function foo / class foo         a declaration
#   import { foo }                   a binding from elsewhere
#   .foo ||= / &&= / ??=             logical assignment, which this codebase
#                                    uses constantly for lazy init -
#                                    `(mem(c).costRules ||= {})` - and which
#                                    the first version missed, reporting three
#                                    live fields as never written
ASSIGN_TMPL = (
    r"(?:\.%(k)s\s*(?:\|\|=|&&=|\?\?=|=[^=]|\+\+|--|\+=|-=)"
    r"|(?<![.\w])%(k)s\s*:"
    r"|\b(?:const|let|var|function|class)\s+%(k)s\b"
    r"|\bimport\b[^;]*?\b%(k)s\b"
    r"|\bfunction\s*\w*\s*\([^)]*\b%(k)s\b"
    r"|\b(?:const|let|var)\s+\w+\s*=\s*\([^)]*\b%(k)s\b"
    r"|\(\s*\{[^}]*\b%(k)s\b[^}]*\}\s*\)\s*=>"
    # method shorthand in an object literal - `springs(c, moveId) {` - which is
    # how every enemy def declares its helpers, and which the first version
    # reported as read-but-never-written for the whole roster
    r"|^\s*%(k)s\s*\([^)]*\)\s*\{"
    r")"
)

# Structural names, array/Map/Set members, and DOM/JS builtins.
SKIP = {
    "phase", "length", "push", "filter", "map", "slice", "join", "find", "id",
    "name", "text", "hp", "maxHp", "block", "alive", "mem", "self", "player",
    "toFixed", "forEach", "some", "every", "includes", "indexOf", "keys",
    "concat", "sort", "reduce", "split", "replace", "trim", "add", "has",
    "delete", "get", "set", "size", "value", "label", "turnsLeft", "reason",
    "call", "apply", "bind", "toString", "valueOf", "then", "catch", "finally",
    "prototype", "constructor", "entries", "values", "flat", "flatMap", "pop",
    "shift", "unshift", "splice", "reverse", "fill", "from", "of", "isArray",
    "min", "max", "round", "floor", "ceil", "abs", "random", "sign", "pow",
    "log", "warn", "error", "info", "assign", "freeze", "stringify", "parse",
    "startsWith", "endsWith", "padStart", "padEnd", "repeat", "match", "test",
    "toLowerCase", "toUpperCase", "charAt", "substring", "substr", "at",
    "new", "this", "super", "default", "return", "typeof", "void",
    "Object", "create", "findIndex", "lastIndexOf", "findLast", "flatten",
}


def strip_comments(s):
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    return re.sub(r"(?m)^\s*//.*$", "", s)


def load():
    corpus = {}
    for p in SRC.rglob("*.js"):
        corpus[p] = strip_comments(p.read_text(encoding="utf-8", errors="replace"))
    return corpus


def assigned_anywhere(corpus, key):
    pat = re.compile(ASSIGN_TMPL % {"k": re.escape(key)}, re.M)
    for s in corpus.values():
        if pat.search(s):
            return True
    return False


def read_anywhere(corpus, key):
    reads = 0
    for s in corpus.values():
        uses = len(re.findall(r"\.%s\b" % re.escape(key), s))
        asg = len(re.findall(
            r"\.%s\s*(?:=[^=]|\+\+|--|\+=|-=)" % re.escape(key), s))
        reads += max(0, uses - asg)
    return reads


def sweep_writes(corpus, a):
    writers = collections.defaultdict(list)
    for d in CONTENT:
        for p in sorted(d.glob("*.js")):
            for key in set(MEM_WRITE.findall(corpus[p])):
                if key not in SKIP and not key.startswith("_"):
                    writers[key].append(p)

    dead = []
    for key, files in sorted(writers.items()):
        if read_anywhere(corpus, key) == 0:
            dead.append((key, files))
        elif a.verbose:
            print("  read %-3d %-24s %s" % (read_anywhere(corpus, key), key,
                                            ", ".join(f.name for f in files)))
    return dead


def sweep_reads(corpus, a):
    """Fields content READS that nothing anywhere ASSIGNS - the summonedBy shape."""
    readers = collections.defaultdict(set)
    for d in CONTENT:
        for p in sorted(d.glob("*.js")):
            for key in set(PROP_READ.findall(corpus[p])):
                if key not in SKIP and not key.startswith("_"):
                    readers[key].add(p)

    dead = []
    for key, files in sorted(readers.items()):
        if not assigned_anywhere(corpus, key):
            dead.append((key, sorted(files)))
    return dead


def main(a):
    corpus = load()

    if a.reads:
        dead = sweep_reads(corpus, a)
        print("fields content READS that nothing in game/src ever ASSIGNS")
        print("=" * 68)
        for key, files in dead:
            print("  %-24s %s" % (key, ", ".join(f.name for f in files[:4])))
        print()
        print("%d candidate(s). This is the `summonedBy` shape: a guard clause"
              % len(dead))
        print("that is always false, so a finished-looking rule does nothing at all.")
        print("Confirm each - is the name a typo for a real field, or an intended")
        print("one nobody ever wrote?")
        return 0

    dead = sweep_writes(corpus, a)
    print("mem flags WRITTEN and never READ anywhere in game/src")
    print("=" * 68)
    for key, files in dead:
        print("  %-24s %s" % (key, ", ".join(f.name for f in files)))
    print()
    print("%d candidate(s). Confirm each by hand: does the field make a CLAIM -"
          % len(dead))
    print("a rule text, a design chapter line, a Haunt note? Then it is a defect.")
    print("Otherwise it is spare bookkeeping and costs the player nothing.")
    print()
    print("Run with --reads for the other shape, which is the expensive one.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--reads", action="store_true",
                    help="sweep for fields read but never written (the summonedBy shape)")
    ap.add_argument("--verbose", action="store_true",
                    help="also list flags that ARE read, with the count")
    sys.exit(main(ap.parse_args()))
