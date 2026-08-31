"""The suite `achievements.js` said existed, and did not.

    python tests/achievements/run.py [--verbose]

`core/achievements.js` keeps two hand-written lists of what content is in the
build — `BUILT_REGIONS` and `BUILT_BOSSES` — and `shippable()` uses them to
withhold achievements whose content is not there yet, so that a Steam page never
lists one nobody can earn. The comment beside them read:

    When a region ships, this list is where it gets added — and
    `tests/achievements/run.py` asserts the list matches the enemy pools that
    really exist, so it cannot rot silently.

There was no `tests/achievements/`. Meanwhile the ladder went from three regions
to seventeen across two sessions and the list stayed at three, so `shippable()`
kept withholding every achievement gated on `all-regions` or `heart` — which is
`rescue-all`, the game's own TITLE achievement, and `reach-heart`, the one for
finishing it. Both fully written, both tested, both invisible.

CONTRACTS 54 in its purest form: a comment describing a gate is not a gate, and
this one described a gate that had never been written.

It is a SOURCE check rather than a browser one on purpose. `achievements.js`
deliberately does not import the content registry — probing it at module load
would make the catalogue depend on the registry being booted, and the settings
panel imports this file — so the two lists are duplicated by design and the only
question worth asking is whether the duplicate still matches. Reading both
literals is the whole job; a browser would prove less, more slowly.

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
ACH = ROOT / "game" / "src" / "core" / "achievements.js"
ENEMIES = ROOT / "game" / "src" / "data" / "enemies" / "index.js"
ENC = ROOT / "game" / "src" / "data" / "encounters.js"
SCHEMA = ROOT / "game" / "src" / "data" / "schema.js"


def read(p):
    return p.read_text(encoding="utf-8", newline="")


def array_after(src, marker):
    """The string literals of the first `[ … ]` following `marker`."""
    i = src.index(marker)
    a = src.index("[", i)
    depth, j = 0, a
    while j < len(src):
        if src[j] == "[":
            depth += 1
        elif src[j] == "]":
            depth -= 1
            if depth == 0:
                break
        j += 1
    return re.findall(r"'([^']+)'", src[a:j])


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

    asrc, esrc, csrc, ssrc = read(ACH), read(ENEMIES), read(ENC), read(SCHEMA)

    built = array_after(asrc, "export const BUILT_REGIONS")
    bosses = array_after(asrc, "export const BUILT_BOSSES")
    real = array_after(esrc, "export const IMPLEMENTED_REGIONS")
    order = array_after(ssrc, "REGION_ORDER")

    # The boss BODY is the first member of each `tier: 'boss'` formation.
    real_bosses = []
    for m in re.finditer(r"tier: 'boss'.*?members: \[(.*?)\]", csrc, re.S):
        ids = re.findall(r"m\('([a-z0-9-]+)'", m.group(1))
        if ids:
            real_bosses.append(ids[0])

    check(len(real) >= 3, "the enemy registry loads", f"{len(real)} implemented regions")
    check(len(real_bosses) >= 3, "the boss formations load", f"{len(real_bosses)} bosses")
    check(len(order) >= 17, "REGION_ORDER loads", f"{len(order)} regions in the mansion")

    # ══ the duplicate still matches the thing it duplicates ════════════════
    missing = [r for r in real if r not in built]
    extra = [r for r in built if r not in real]
    check(not missing,
          "every region with a roster is in BUILT_REGIONS — an achievement gated "
          "on content that SHIPPED is one nobody can earn for no reason",
          ", ".join(missing) or f"{len(built)} listed, {len(real)} real")
    check(not extra,
          "and BUILT_REGIONS claims nothing that has no roster — the other "
          "direction, which is how a Steam page lists an unearnable one",
          ", ".join(extra) or "no phantoms")

    missing_b = [b for b in real_bosses if b not in bosses]
    extra_b = [b for b in bosses if b not in real_bosses]
    check(not missing_b, "every boss on the board is in BUILT_BOSSES",
          ", ".join(missing_b) or f"{len(bosses)} listed, {len(real_bosses)} real")
    check(not extra_b, "and BUILT_BOSSES claims no boss that does not exist",
          ", ".join(extra_b) or "no phantoms")

    # ══ and the gates those lists feed actually open ═══════════════════════
    all_regions = len(built) >= len(order)
    heart = "heart" in built
    check(all_regions,
          "the `all-regions` content gate is OPEN, so `rescue-all` — the game's "
          "own title achievement — is shippable",
          f"{len(built)} built of {len(order)} in REGION_ORDER")
    check(heart,
          "the `heart` content gate is OPEN, so `reach-heart` is shippable",
          "heart is in BUILT_REGIONS" if heart else "heart is missing")

    # ══ the control: the gates must be capable of being SHUT ═══════════════
    check("CONTENT_GATES" in asrc and "'all-regions'" in asrc,
          "CONTROL: the gate table is still there, so a future region really "
          "does get withheld until it is listed",
          "CONTENT_GATES present")

    for kind, label, detail in notes:
        if kind != "PASS" or a.verbose:
            print(f"{kind}  {label}" + (f"  - {detail}" if detail else ""))
    print("\nRESULT: %d passed, %d failed" % (passed, failed))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    sys.exit(main(ap.parse_args()))
