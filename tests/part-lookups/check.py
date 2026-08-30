"""An actor's `id` is its board slot. Comparing it to a DEF id never matches.

    python tests/part-lookups/check.py [--verbose]

`_makeEnemy` names enemies `e0`, `e1`, `e2` by slot. `defId` is the definition's
id — `favorite-doll`, `the-wardrobe`, `blanket-hydra`. Every multi-body enemy in
this game has to find its own parts, and four of them looked for them by `id`:

  * the Governess could never see her Favorite Doll, so Stitched Together
    redirected nothing and Mend My Darling was never once selected;
  * each Porcelain Twin believed it was alone, so Joined was dead twice over;
  * a Blanket Hydra Head could not find its own body, and the Hydra could not
    count its own Heads;
  * the Wardrobe could not find its body from a Door, so `doorsBroken` — the
    counter behind BOTH of its signature rules — never left zero.

The first two were found and fixed one at a time, each with a comment naming the
trap, and the other two stayed broken underneath them. The Wardrobe's only
surfaced when `isTargetable` and `damageTakenMul` were wired up on 2026-08-30
and its Big Scare stopped being able to END: body at 140/140, both Doors dead,
eighty turns, nobody able to win or lose.

THE RULE NEEDS NO REGISTRY. An actor id is `e<slot>` and is therefore never
kebab-case, so comparing one to a kebab-case literal cannot match whatever that
literal happens to be. The first draft of this gate instead collected `id: '…'`
literals and reported only comparisons against those — and found two of the four,
because the Hydra's Heads and the Wardrobe's Doors are built by FACTORIES and
their ids are arguments, so the string `id:` never appears beside them. Half the
bug was invisible to the check written to find it.

Comparing `a.id` to a VARIABLE is fine and common — that is how an enemy
remembers one specific instance, which the Sanctuary Warden does on purpose — so
only literals are reported.

Exit 0 only when the count is zero.
"""
import argparse
import pathlib
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCAN = ["game/src/data/enemies", "game/src/data/bosses"]

KEBAB = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)+$")

# `a.id === 'literal'` / `'literal' === a.id` / `[…].includes(a.id)`
CMP = re.compile(r"""(\w+)\.id\s*(?:===|==)\s*['"]([^'"]+)['"]""")
CMP_REV = re.compile(r"""['"]([^'"]+)['"]\s*(?:===|==)\s*(\w+)\.id\b""")
INCLUDES = re.compile(r"""\.includes\(\s*(\w+)\.id\s*\)""")

# `ev.id`, `p.id`, `a.id` on a plain data object are not actors. Only names that
# are actually bound to actors in this content are reported; every one of them
# appears as `allies(c).find(a => …)` or `.filter(a => …)`, so the variable is
# almost always a/x/e/d/k. Anything else is listed under --verbose instead.
ACTORISH = {"a", "x", "d", "k", "en", "actor", "ally", "mate", "seat", "pl", "body", "head", "part"}


def strip_comments(s):
    s = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), s, flags=re.S)
    return re.sub(r"(^|[^:])//[^\n]*", lambda m: m.group(1), s)


def line_of(src, pos):
    return src.count("\n", 0, pos) + 1


def main(a):
    problems, skipped, files = [], [], 0
    for rel in SCAN:
        for path in sorted((ROOT / rel).rglob("*.js")):
            files += 1
            src = strip_comments(path.read_text(encoding="utf-8", errors="replace"))
            name = path.relative_to(ROOT).as_posix()

            for m in CMP.finditer(src):
                var, literal = m.group(1), m.group(2)
                if not KEBAB.match(literal):
                    continue
                row = (name, line_of(src, m.start()),
                       "%s.id === '%s' — an actor id is e0/e1; use %s.defId" % (var, literal, var))
                (problems if var in ACTORISH else skipped).append(row)

            for m in CMP_REV.finditer(src):
                literal, var = m.group(1), m.group(2)
                if not KEBAB.match(literal):
                    continue
                row = (name, line_of(src, m.start()),
                       "'%s' === %s.id — an actor id is e0/e1; use %s.defId" % (literal, var, var))
                (problems if var in ACTORISH else skipped).append(row)

            # A list of def ids tested against an actor's id. The literals are
            # not at the call site, so follow the LIST: the property immediately
            # before `.includes`, then its declaration.
            for m in INCLUDES.finditer(src):
                var = m.group(1)
                if var not in ACTORISH:
                    continue
                head = src[max(0, m.start() - 90):m.start()]
                named = re.findall(r"""['"]([a-z0-9]+(?:-[a-z0-9]+)+)['"]""", head)
                if not named:
                    prop = re.search(r"([\w$]+)\s*\.includes\(\s*%s\.id" % re.escape(var),
                                     src[max(0, m.start() - 80):m.end()])
                    if prop:
                        decl = re.search(r"\b%s\s*:\s*\[([^\]]*)\]" % re.escape(prop.group(1)), src)
                        if decl:
                            named = [x for x in re.findall(r"""['"]([^'"]+)['"]""", decl.group(1))
                                     if KEBAB.match(x)]
                if named:
                    problems.append((name, line_of(src, m.start()),
                                     ".includes(%s.id) over def ids %s — use %s.defId"
                                     % (var, named[:3], var)))

    seen, uniq = set(), []
    for p in problems:
        if p[:2] in seen:
            continue
        seen.add(p[:2])
        uniq.append(p)

    print("scanned %d files" % files)
    for name, line, why in uniq:
        print("  !! %s:%d  %s" % (name, line, why))
    if a.verbose and skipped:
        print("  (not actor-shaped, ignored:)")
        for name, line, why in skipped:
            print("     %s:%d  %s" % (name, line, why))

    print("\nRESULT: %d actor lookups by def id" % len(uniq))
    return 1 if uniq else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    sys.exit(main(ap.parse_args()))
