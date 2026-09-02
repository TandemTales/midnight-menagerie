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

A GATE THAT SKIPS IS WORSE THAN NO GATE. The first version of this file keyed on
the raw `name:` string and silently skipped SIXTEEN authored values — chapters
write "Big Scare: The Grand Coatcheck", the implementation writes
`id: 'grand-coatcheck'` / `name: 'The Grand Coatcheck'` — then reported "0
failures" with the Coatcheck sitting 8 Courage over its chapter. `norm()` exists
because of that, and the skip count is printed on every run so the same hole
cannot open quietly a second time.

This gate is text-only and needs no browser, so it is cheap enough to run every
time. It reads the DESIGN CHAPTER as the authority and the implementation as the
thing under test — the same direction as tests/teaching, and the opposite of
fitting the doc to the code afterwards.

DIVERGENCE IS ALLOWED, but it has to be declared here with its reason. Bosses
are tuned against measurement and their chapters are opening bids; `butler.js`
says so in its own source. An undeclared divergence is the defect.
"""
import io, os, re, sys, glob

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Declared divergences ─────────────────────────────────────────────────────
# chapter name -> (implemented, reason). Keep the reason specific enough to
# re-litigate, and prefer a measurement to an adjective.
ALLOWED = {
    "House Bell": (95, "Big Scare tuned down in the foyer balance passes; chapter 105 is the opening bid."),
    "Butler": (86, "Chapter 250 is the opening bid and butler.js records it as measured-and-rejected. "
                    "Shipped 134 until 2026-09-02, when the Foyer was losing 22 of 38 boss fights at a "
                    "15pp margin - the worst in the game. 86 puts the price at 47% of the pool and the "
                    "margin at 28pp: 15 of 38 lost, Foyer deaths 28 -> 19, run victories 5 -> 10. See "
                    "docs/notes/2026-08-31-the-foyer-is-attrition-not-the-boss.md for why margin is the "
                    "number that predicts the loss rate."),
    "Governess": (175, "Chapter 280 covers the pair; she ships at 175 with the Favorite Doll at 50. Cutting her to "
                       "130 was TRIED on 2026-09-02 and reverted: it moved the price only 62% -> 60% of "
                       "the pool and broke her phase-two test, because `phaseAt` scales the threshold "
                       "with the pool. Her Courage is a weak lever; the Doll and her mechanics dominate "
                       "the cost. The Nursery losing 16 of 24 boss fights is still open."),
    "Groundskeeper": (165, "Chapter 330. Cut on 2026-09-02: the Graveyard was the most expensive boss in "
                           "the game at 77% of the pool, 14pp margin, 9 of 12 lost. Unlike the Governess "
                           "it responds strongly to Courage - 330 -> 165 took it to 37% and 3 of 12."),
    "Archivist": (200, "Chapter 345. Cut on 2026-09-02 with the Study losing 10 of 13 at a 20pp margin. "
                       "Also a weak lever: 345 -> 200 moved the price 71% -> 70%, so the Study is still "
                       "an outlier and the cause is not its boss's Courage."),
}

# NOT TUNED, and deliberately so: the Head Gardener stays at his chapter's 320.
# Lowering him was tried twice on 2026-09-02 (to 225 and to 230) and the
# Greenhouse got HARDER both times - 68% of pool -> 81% and -> 79%. His fight is
# a treadmill whose length is set by the three Beds, not by him, so cutting his
# Courage shortens nothing and only moves his phase thresholds. Whatever fixes
# the Greenhouse, it is not this number.


def norm(s):
    """Match key: case, punctuation and a leading "The"/"Final Boss:" are noise."""
    s = re.sub(r"^final boss:?\s+", "", s.strip().lower())
    s = re.sub(r"^the\s+", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


def impl_hp():
    """normalised name AND id -> set of implemented starting Courage values."""
    out = {}
    files = glob.glob(os.path.join(ROOT, "game/src/data/enemies/*.js")) \
        + glob.glob(os.path.join(ROOT, "game/src/data/bosses/*.js"))
    for f in files:
        s = io.open(f, encoding="utf-8").read()
        # id + name together, then `hp: [N, N]` within a bounded window. The
        # window is bounded so one enemy never captures the NEXT one's Courage —
        # the trap tests/party-tells hit with a +/-14 line scan. Both keys are
        # registered because chapters use the display name and the code uses ids.
        # Bosses declare `hp: [SOLO_MAX, SOLO_MAX]`, so a numbers-only regex sees
        # NO boss Courage at all — which is the content balance depends on most,
        # and the first version of this gate was blind to every one of them.
        # Resolve file-local `const NAME = 123` and accept a literal or an id.
        consts = {m.group(1): int(m.group(2)) for m in
                  re.finditer(r"const\s+([A-Za-z_$][\w$]*)\s*=\s*(\d+)\s*;", s)}

        def val(tok):
            return int(tok) if tok.isdigit() else consts.get(tok)

        num = r"(\d+|[A-Za-z_$][\w$]*)"
        pat = (r"id:\s*'([^']+)',\s*\n\s*name:\s*'([^']+)',"
               r"(?:[^\n]*\n){0,14}?\s*hp:\s*\[\s*" + num + r"\s*,")
        for m in re.finditer(pat, s):
            v = val(m.group(3))
            if v is None:
                continue
            for k in (m.group(1), m.group(2)):
                out.setdefault(norm(k), set()).add(v)
        # Fallback for defs that declare `name` without an adjacent `id`.
        for m in re.finditer(r"name:\s*'([^']+)',(?:[^\n]*\n){0,12}?\s*hp:\s*\[\s*" + num + r"\s*,", s):
            v = val(m.group(2))
            if v is not None:
                out.setdefault(norm(m.group(1)), set()).add(v)
    return out


def doc_courage():
    """[(chapter file, name, authored Courage)] from the region design chapters."""
    rows = []
    for d in sorted(glob.glob(os.path.join(ROOT, "docs/design/regions/*.md"))):
        cur = None
        for line in io.open(d, encoding="utf-8").read().split("\n"):
            h = re.match(r"#\s*\d+\.\s*(?:Big Scare:\s*)?(.+?)\s*$", line)
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
    checked = matched = 0
    fails, allowed_hits, skipped = [], [], []

    for chapter, name, want in rows:
        got = impl.get(norm(name))
        if not got:
            skipped.append((chapter, name, want))
            continue
        checked += 1
        if want in got:
            matched += 1
            continue
        key = re.sub(r"^(?:The|Final Boss:?)\s+", "", name).strip()
        if key in ALLOWED and ALLOWED[key][0] in got:
            allowed_hits.append((chapter, key, want, ALLOWED[key][0]))
            continue
        fails.append((chapter, name, want, sorted(got)))

    print("design chapters vs implementation — enemy Courage")
    print("  %d authored values, %d have an implementation, %d matched exactly"
          % (len(rows), checked, matched))
    print("  %d declared divergences, %d unmatched headings"
          % (len(allowed_hits), len(skipped)))
    if allowed_hits:
        print("\ndeclared divergences (in ALLOWED, with a reason):")
        for chapter, name, want, got in allowed_hits:
            print("  %-20s chapter %-5d ships %-5d  %s" % (name, want, got, ALLOWED[name][1]))
    if skipped:
        # Printed, never silent: an unmatched heading is a hole in the gate.
        print("\nunmatched headings (no enemy of that name carries an hp) —")
        print("these are NOT checked, so keep the list short and boring:")
        for chapter, name, want in skipped:
            print("  %-26s %-28s doc %d" % (chapter, name, want))
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
