"""Every enemy move's damage must be the number its design chapter printed.

    python tests/design-damage/check.py

THE SIBLING OF tests/design-courage. That gate reads Courage out of the chapters
and found the Nursery shipping every enemy ~1.44x over its authored pool. The
chapters print DAMAGE too — "Deal 9 damage." — and nothing compared those, so
the same region was ALSO shipping four moves 1.38-1.60x over:

    Button Toss  chapter 5 -> shipped 8     Wooden Saber  9 -> 13
    Rock                 6 ->         9     Blanket Snap  8 -> 11

Whoever moved the Courage moved the damage. One gate would have caught both.

MATCHING IS ON (REGION, MOVE NAME), NOT NAME ALONE. A first pass keyed on the
display name and reported "Lid Slam chapter 13 vs impl 6" — there are two moves
called Lid Slam, the Toy Chest's at 17 and a crypt scare's at 6, and a global
key cannot tell them apart. Each chapter is one region and each enemy file
declares `REGION`, so the pair is unambiguous.

PER-STACK MOVES ARE SKIPPED, and they have to be. "Open the Lantern" reads
chapter 8 against implementation 40 and both are right: the chapter says "Deal 8
damage PER CHARGE" and 40 is the five-Charge display. Any chapter line whose
damage is qualified by "per"/"each", and any move whose `damageFn` is not the
same literal as its declared `damage`, is dynamic and out of scope here — the
intent-vs-effect promise for those is what tests/enemies/audit.py covers.

A GATE THAT CRIES WOLF GETS SWITCHED OFF. That is why the skips are counted and
printed rather than silent, the way tests/design-courage prints its unmatched
headings.
"""
import io, os, re, sys, glob

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# (region, move name) -> (shipped, reason). Declared divergences only.
ALLOWED = {}

CHAPTER_REGION = {
    "01-foyer.md": "foyer", "02-nursery.md": "nursery",
    "03-sleeping-quarters.md": "sleeping-quarters", "04-kitchens-cellars.md": "kitchens-cellars",
    "05-greenhouse.md": "greenhouse", "06-graveyard.md": "graveyard",
    "07-study-library.md": "study-library", "08-attic-observatory.md": "attic-observatory",
    "09-lampworks.md": "lampworks", "10-ballroom.md": "ballroom", "11-crypt.md": "crypt",
    "12-hedge-maze.md": "hedge-maze", "13-secret-passages.md": "secret-passages",
    "14-bathhouse.md": "bathhouse", "15-kennels.md": "kennels",
    "16-pumpkin-grounds.md": "pumpkin-grounds", "17-heart.md": "heart",
}


def chapter_damage():
    """(region, lowercased move name) -> authored damage, for FLAT moves only."""
    out, skipped = {}, 0
    for d in sorted(glob.glob(os.path.join(ROOT, "docs/design/regions/*.md"))):
        region = CHAPTER_REGION.get(os.path.basename(d))
        if not region:
            continue
        lines = io.open(d, encoding="utf-8").read().split("\n")
        for i, l in enumerate(lines):
            m = re.match(r"^([A-Z][A-Za-z' ,!\-]{2,40})$", l.strip())
            if not m:
                continue
            for j in range(i + 1, min(i + 3, len(lines))):
                nxt = lines[j]
                if re.search(r"\bper\b|\beach\b", nxt, re.I):
                    skipped += 1
                    break
                flat = re.match(r"\s*Deals? (\d+) damage\.?\s*$", nxt)
                if flat:
                    out[(region, m.group(1).strip().lower())] = int(flat.group(1))
                    break
    return out, skipped


def impl_damage():
    """(region, lowercased move name) -> (damage, file, dynamic?)."""
    out = {}
    files = glob.glob(os.path.join(ROOT, "game/src/data/enemies/*.js")) \
        + glob.glob(os.path.join(ROOT, "game/src/data/bosses/*.js"))
    for f in files:
        s = io.open(f, encoding="utf-8").read()
        rm = re.search(r"REGION\s*=\s*'([^']+)'", s)
        if not rm:
            continue
        region = rm.group(1)
        for m in re.finditer(
                r"name:\s*'([^']+)',\s*intent:[^\n]*?damage:\s*(\d+)[^\n]*\n(.{0,220}?)(?=\n\s*(?:tell|effect|id):)",
                s, re.S):
            name, dmg, rest = m.group(1).strip().lower(), int(m.group(2)), m.group(3)
            dynamic = "damageFn" in rest and not re.search(
                r"damageFn:\s*\(c\)\s*=>\s*%d\b" % dmg, rest)
            out[(region, name)] = (dmg, os.path.basename(f), dynamic)
    return out


def main():
    doc, per_stack = chapter_damage()
    impl = impl_damage()
    checked = matched = dynamic = 0
    fails, allowed_hits = [], []

    for key, want in sorted(doc.items()):
        if key not in impl:
            continue
        got, f, dyn = impl[key]
        if dyn:
            dynamic += 1
            continue
        checked += 1
        if got == want:
            matched += 1
        elif key in ALLOWED and ALLOWED[key][0] == got:
            allowed_hits.append((key, want, got))
        else:
            fails.append((key, want, got, f))

    print("design chapters vs implementation — enemy move damage")
    print("  %d flat authored numbers, %d compared, %d matched exactly"
          % (len(doc), checked, matched))
    print("  %d skipped as per-stack in the chapter, %d skipped as dynamic in code"
          % (per_stack, dynamic))
    if allowed_hits:
        print("\ndeclared divergences:")
        for (region, name), want, got in allowed_hits:
            print("  %-18s %-24s chapter %-4d ships %-4d  %s"
                  % (region, name, want, got, ALLOWED[(region, name)][1]))
    if fails:
        print("\n--- failures ---")
        for (region, name), want, got, f in fails:
            print("  %-18s %-24s chapter says %-4d implementation has %-4d  (%s)"
                  % (region, name, want, got, f))
        print("""
  Change the declared `damage`, any `damageFn`, and the `effect` literal
  TOGETHER — they are separate numbers and moving one is an intent that lies.
  If the divergence is deliberate, add it to ALLOWED with its measurement.""")
    print("\nRESULT: %d compared, %d failures" % (checked, len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
