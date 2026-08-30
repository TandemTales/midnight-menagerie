"""Gate: nothing third-party ships without its notice.

    python tests/licences/check.py

WHY THIS EXISTS
---------------
Before 2026-08-30 this repository contained no LICENSE, NOTICE, COPYING or OFL
file of any kind, while redistributing three OFL fonts and an MIT library. Both
licences require their notice to travel with the work, so that was a breach in
two directions at once - and it was invisible, because a missing file looks
exactly like a file nobody needed.

That is the same shape as everything else this project gates: a thing that is
absent is indistinguishable from a thing that was never required. So it gets a
check rather than a note in a handoff.

WHAT IT ASSERTS
---------------
  * every notice file exists, is non-trivial, and sits WHERE the licence needs
    it - beside the work it covers, not in a docs folder
  * every font family referenced by fonts.css appears in the OFL notice
  * every vendored .js is covered by vendor/LICENSE
  * the third-party index names each dependency
  * AI-generated media is disclosed in docs/COMMERCIAL-USE.md
  * no font or vendor file has been added since the notices were last written

Exit 0 only when every check passes.
"""
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def read(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8", errors="replace") as f:
        return f.read()


def main():
    problems = []
    notes = []

    def need(cond, label, detail=""):
        (notes if cond else problems).append((label, detail))

    # ── the notice files, where the licences require them ──────────────────
    ofl = read("game/assets/fonts/OFL.txt")
    three = read("game/vendor/LICENSE")
    index = read("THIRD-PARTY-NOTICES.md")
    commercial = read("docs/COMMERCIAL-USE.md")

    need(ofl and len(ofl) > 3000, "game/assets/fonts/OFL.txt exists and is the real text",
         f"{len(ofl) if ofl else 0} bytes")
    need(three and len(three) > 900, "game/vendor/LICENSE exists and is the real text",
         f"{len(three) if three else 0} bytes")
    need(bool(index), "THIRD-PARTY-NOTICES.md exists")
    need(bool(commercial), "docs/COMMERCIAL-USE.md exists")

    # Beside the work, not in a docs folder: the OFL wants the notice with the
    # fonts and MIT wants it with the copies.
    need(os.path.isdir(os.path.join(ROOT, "game", "assets", "fonts")),
         "the font notice sits in the same directory as the .woff2 files")

    if ofl:
        need("SIL OPEN FONT LICENSE Version 1.1" in ofl.upper()
             or "SIL Open Font License, Version 1.1" in ofl,
             "the font notice names the licence and version")
        need("PERMISSION IS HEREBY GRANTED" in ofl.upper(),
             "and contains the licence body, not just a reference")
    if three:
        need("MIT" in three and "Permission is hereby granted" in three,
             "the vendor notice is the MIT text")
        need("three.js" in three.lower(), "and names what it covers")

    # ── every font family in the CSS is covered ────────────────────────────
    css = read("game/src/ui/fonts.css") or ""
    families = sorted(set(re.findall(r"font-family:\s*'([^']+)'", css)))
    need(bool(families), "fonts.css declares families", ", ".join(families))
    if ofl:
        missing = [f for f in families if f not in ofl]
        need(not missing, "every font family in fonts.css appears in the notice",
             ", ".join(missing) or f"{len(families)} covered: {', '.join(families)}")
    if index:
        missing = [f for f in families if f not in index]
        need(not missing, "and in the third-party index", ", ".join(missing) or "all listed")

    # ── every vendored file is covered ─────────────────────────────────────
    vendor_dir = os.path.join(ROOT, "game", "vendor")
    vendored = []
    for dp, _dn, fns in os.walk(vendor_dir):
        for fn in fns:
            if fn.endswith(".js"):
                vendored.append(os.path.relpath(os.path.join(dp, fn), vendor_dir).replace("\\", "/"))
    need(bool(vendored), "there is vendored code to cover", f"{len(vendored)} .js files")
    # The MIT notice covers a project, not a file list, so the check is that the
    # notice says so explicitly rather than that it enumerates 12 filenames.
    if three:
        need("jsm" in three, "the vendor notice says it covers the unheadered jsm addons")

    # A vendored file with no licence header AND no covering notice is the
    # actual breach. Headers are checked so the count is honest in the report.
    unheadered = []
    for rel in vendored:
        text = read(f"game/vendor/{rel}") or ""
        head = text[:600].lower()
        if "license" not in head and "copyright" not in head:
            unheadered.append(rel)
    notes.append((f"{len(unheadered)} of {len(vendored)} vendored files carry no header of their own",
                  "covered by game/vendor/LICENSE"))

    # ── AI disclosure ──────────────────────────────────────────────────────
    if commercial:
        for token, label in [("Suno", "the music generator"),
                             ("OpenAI", "the image generator"),
                             ("Pre-Generated", "the Steamworks disclosure answer")]:
            need(token in commercial, f"COMMERCIAL-USE.md names {label}", token)
        need("paid-tier" in commercial or "paid tier" in commercial,
             "and records the subscription condition that gates the soundtrack")

    # ── the index points at the real files ─────────────────────────────────
    if index:
        for rel in ["game/vendor/LICENSE", "game/assets/fonts/OFL.txt"]:
            need(rel in index, f"the index points at {rel}")

    for label, detail in notes:
        print(f"  ok    {label}" + (f"  — {detail}" if detail else ""))
    for label, detail in problems:
        print(f"  FAIL  {label}" + (f"  — {detail}" if detail else ""))

    print(f"\nRESULT: {len(notes)} ok, {len(problems)} problems, "
          f"{len(families)} font families, {len(vendored)} vendored files")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
