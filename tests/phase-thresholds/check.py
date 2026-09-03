"""A boss phase threshold may not be compared against a raw number.

    python tests/phase-thresholds/check.py

WHY THIS EXISTS. On 2026-09-02 the Drowned Matron was UNWINNABLE and had been
for as long as anything scaled her pool. `tests/run/run.py --runs 400` reported
her twice at **595/595 — full health after 200 turns**:

    if (m.phase === 1 && c.self.hp <= 240) {     // authored against her 425
    if (m.phase === 2 && c.self.hp <= 90) {

240 and 90 are shares of her chapter's 425 written as absolute numbers. Multiply
the pool and the SHARE of the fight each phase covers moves: at 595 phase one
needed 355 damage instead of 185, her Pull the Plug healing covered the
difference, and phase three — where "nothing heals her" — was never reached.

It was found by a solo Courage correction, but the serious case is co-op.
`PARTY_HP_SCALE` is **x5.7 at four Kids**, so before this gate:

    Kennelmaster phase two   250 -> 1425 damage
    Harvest King phase two   255 -> 1454 damage
    Harvest King phase three  95 ->  542 damage

Five bosses carried the bug — drowned-matron, confectioner, whisper-warden,
kennelmaster, harvest-king — while the Governess and the Patchwork Giant had
been doing it correctly with `phaseAt` the whole time. Nothing compared the two.

WHAT THIS CHECKS. Any `hp <op> <literal>` inside a boss file that is not routed
through `phaseAt(...)` and does not reference `maxHp`. That is deliberately
crude: a threshold expressed as a share of `maxHp` is already scale-safe, and
`phaseAt(c, N, BASE)` is the shared helper for the authored-number form.

FALSE POSITIVES are expected and belong in ALLOWED with a reason — a comparison
against the PLAYER's hp delta is not a phase threshold at all.
"""
import io, os, re, sys, glob

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# file -> list of (substring of the line, reason). Not a phase threshold.
ALLOWED = {
    "gardener-of-rot.js": [
        ("before - c.player.hp >= 2 * d",
         "reads the PLAYER's Courage delta this turn, not a boss phase gate."),
    ],
}


def offenders():
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, "game/src/data/bosses/*.js"))):
        base = os.path.basename(f)
        s = io.open(f, encoding="utf-8").read()
        for m in re.finditer(r"[^\n]*\bhp\s*(?:<=|<|>=|>)\s*\d+[^\n]*", s):
            line = m.group(0).strip()
            if "phaseAt" in line or "maxHp" in line:
                continue
            if any(frag in line for frag, _ in ALLOWED.get(base, [])):
                continue
            out.append((base, s[:m.start()].count("\n") + 1, line))
    return out


def main():
    bad = offenders()
    checked = len(glob.glob(os.path.join(ROOT, "game/src/data/bosses/*.js")))
    print("boss phase thresholds vs a scaled pool")
    print("  %d boss files scanned" % checked)
    allowed_n = sum(len(v) for v in ALLOWED.values())
    print("  %d declared non-thresholds" % allowed_n)
    for base, frags in ALLOWED.items():
        for frag, why in frags:
            print("    %-22s %-34s %s" % (base, frag[:34], why))
    if bad:
        print("\n--- failures ---")
        for base, ln, line in bad:
            print("  %-24s:%-5d %s" % (base, ln, line[:86]))
        print("""
  A phase threshold compared against a raw number is a share of the AUTHORED
  pool written as an absolute. Any multiplier on that pool - a per-region
  correction, or `PARTY_HP_SCALE` at x5.7 for four Kids - moves how much of the
  fight each phase covers, and the failure mode is a boss that cannot be
  brought out of phase one at all.

  Route it through `phaseAt(c, N, BASE_HP)` with BASE_HP set to the Courage the
  number was authored against. If it is not a phase gate, add it to ALLOWED
  with the reason.""")
    print("\nRESULT: %d boss files, %d failures" % (checked, len(bad)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
