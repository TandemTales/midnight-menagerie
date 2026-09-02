"""Every enemy's Courage must be the number its design chapter authored.

    python tests/design-courage/check.py

WHY THIS EXISTS. On 2026-09-01 every one of the nine enemies in the Nursery was
implemented ABOVE its authored Courage — a uniform ~1.44x on the normals and
~1.19x on the Big Scares — and nothing anywhere said so:

    Button Baby 21 -> 30 · Jack in the Box 32 -> 46 · Patchwork Soldier 38 -> 55
    Rocking Horse 42 -> 60 · Blanket Blob 34 -> 50 · Porcelain Doll 36 -> 52
    Toy Chest 110 -> 132 · Patchwork Giant 126 -> 150 · Porcelain Twins 68 -> 80

The cost was invisible in every place anyone looked. The region read as the most
expensive content in the game (39% of the player's pool per fight against a 15%
median, rank 1 of 17) and it was blamed on its BOSS, who turned out to be
cheaper than the Butler. The player was simply arriving at her door on 62%
Courage, the lowest arrival in the game.

It also silently broke a mechanic. The Patchwork Giant tears a Patch at 90, 60
and 30 Courage, scaled by `maxHp / 126` — its authored Courage, hardcoded in its
own source. At 150 those tears drifted to 107/71/36 and no test noticed, because
the test knocked it to a literal 100 and was calibrated against the drift.

This gate is text-only and needs no browser, so it is cheap enough to run every
time. It reads the DESIGN CHAPTER as the authority and the implementation as the
thing under test — the same direction as tests/teaching, and the opposite of
fitting the doc to the code afterwards.

DIVERGENCE IS ALLOWED, but it has to be declared here with its reason. Bosses
are tuned against measurement and their chapters are opening bids, not ship
values; `butler.js` says so in its own source. An undeclared divergence is the
defect this gate exists to catch.
"""
import io, os, re, sys, glob

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Declared divergences ─────────────────────────────────────────────────────
# name -> (implemented, reason). Tuned against measurement; the chapter number is
# the authored opening bid. Keep the reason specific enough to re-litigate.
ALLOWED = {
    "House Bell": (95, "Big Scare tuned down in foyer balance passes; chapter 105 is the opening bid."),
    "Butler":     (134, "butler.js records the chapter baseline as measured-and-rejected: it "
                        "'does not hold the win rate'. Ships at 134 after the Courage sweeps."),
    "Governess":  (175, "Chapter 280 covers the pair; she ships at 175 with the Favorite Doll at 50, "
                        "and measures at 63% of the player's pool - cheaper than the Butler."),
}


def impl_hp():
    """name -> set of implemented starting Courage values."""
    out = {}
    files = glob.glob(os.path.join(ROOT, "game/src/data/enemies/*.js")) \
        + glob.glob(os.path.join(ROOT, "game/src/data/bosses/*.js"))
    for f in files:
        s = io.open(f, encoding="utf-8").read()
        # `name: 'X'` followed, within a short window, by `hp: [N, N]`. The window
        # is bounded so a name never captures the NEXT enemy's Courage — the trap
        # tests/party-tells hit with a +/-14 line scan.
        for m in re.finditer(r"name:\s*'([^']+)',(?:[^\n]*\n){0,12}?\s*hp:\s*\[\s*(\d+)\s*,", s):
            out.setdefault(m.group(1), set()).add(int(m.group(2)))
    return out


def doc_courage():
    """[(chapter file, name, authored Courage)] from the region design chapters."""
    rows = []
    for d in sorted(glob.glob(os.path.join(ROOT, "docs/design/regions/*.md"))):
        cur = None
        for line in io.open(d, encoding="utf-8").read().split("\n"):
            h = re.match(r"#\s*\d+\.\s*(?:Big Scare:\s*)?(?:The\s+)?(.+?)\s*$", line)
            if h:
                cur = h.group(1).strip()
                continue
            c = re.search(r"Courage:\s*(\d+)", line)
            if c and cur:
                rows.append((os.path.basename(d), cur, int(c.group(1))))
                cur = None          # one Courage per heading, the first one
    return rows


def main():
    impl = impl_hp()
    rows = doc_courage()
    checked = matched = skipped = 0
    fails, allowed_hits = [], []

    for chapter, name, want in rows:
        got = impl.get(name) or impl.get("The " + name)
        if not got:
            skipped += 1                      # not an enemy with its own hp (party, region prose)
            continue
        checked += 1
        if want in got:
            matched += 1
            continue
        if name in ALLOWED and ALLOWED[name][0] in got:
            allowed_hits.append((chapter, name, want, ALLOWED[name][0]))
            continue
        fails.append((chapter, name, want, sorted(got)))

    print("design chapters vs implementation — enemy Courage")
    print("  %d authored values, %d have an implementation, %d matched exactly"
          % (len(rows), checked, matched))
    print("  %d declared divergences, %d headings with no hp of their own"
          % (len(allowed_hits), skipped))
    if allowed_hits:
        print("\ndeclared divergences (in ALLOWED, with a reason):")
        for chapter, name, want, got in allowed_hits:
            print("  %-22s chapter %-5d ships %-5d  %s" % (name, want, got, ALLOWED[name][1]))
    if fails:
        print("\n--- failures ---")
        for chapter, name, want, got in fails:
            print("  %-24s %-22s chapter says %d, implementation has %s"
                  % (chapter, name, want, got))
        print("\n  A number here is either a typo in the implementation or a tuning")
        print("  decision nobody wrote down. If it is deliberate, add it to ALLOWED")
        print("  with the measurement that justifies it.")

    print("\nRESULT: %d checked, %d failures" % (checked, len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
