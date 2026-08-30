"""Fetch the exact licence texts this game is required to redistribute.

    python tools/fetch_licences.py [--check]

WHY THIS IS A SCRIPT AND NOT A PASTE
------------------------------------
The SIL Open Font License requires the licence text and the copyright notice to
travel WITH the fonts, and the MIT licence requires its notice in "all copies or
substantial portions". Those are verbatim obligations: a licence retyped from
memory with one clause dropped is not the licence. So the texts come from the
authoritative source and land on disk unedited, and this file records exactly
where each one came from.

`--check` re-downloads and diffs against what is committed, without writing. Run
it if you ever want to know whether the shipped notices still match upstream.

WHAT SHIPS WHERE
----------------
    game/assets/fonts/OFL.txt   next to the .woff2 files it covers
    game/vendor/LICENSE         next to three.module.js and jsm/
    THIRD-PARTY-NOTICES.md      the human-readable index (hand-written)
"""
import argparse
import os
import sys
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The three families in `game/src/ui/fonts.css`, each with the upstream OFL.txt
# that carries its own copyright line. Verified 2026-08-30.
FONTS = [
    ("Cinzel", "https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/OFL.txt"),
    ("Grenze", "https://raw.githubusercontent.com/google/fonts/main/ofl/grenze/OFL.txt"),
    ("Rye",    "https://raw.githubusercontent.com/google/fonts/main/ofl/rye/OFL.txt"),
]

# three.module.js is r169 and carries `SPDX-License-Identifier: MIT` in its own
# header; the 11 files under vendor/jsm/ carry no header at all, which is why
# the licence has to sit beside them as a file.
THREE_LICENSE = "https://raw.githubusercontent.com/mrdoob/three.js/r169/LICENSE"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "midnight-menagerie-licence-fetch"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")


def build_font_notice():
    """One file, three copyright lines, one copy of the licence body.

    The three upstream OFL.txt files differ only in their copyright line - the
    licence body below it is identical and is reproduced once rather than three
    times, which is what every font bundle that ships more than one family does.
    The bodies are compared first, and this refuses to write if they ever differ.
    """
    heads, bodies = [], []
    for name, url in FONTS:
        text = get(url).replace("\r\n", "\n")
        marker = "-----------------------------------------------------------"
        idx = text.find(marker)
        if idx < 0:
            # Fall back on the first blank line after the copyright block.
            idx = text.index("\n\n") + 1
        head, body = text[:idx].strip(), text[idx:].strip()
        heads.append((name, head))
        bodies.append(body)

    if len(set(bodies)) != 1:
        raise SystemExit("upstream OFL bodies differ between families; "
                         "ship them separately rather than merging")

    out = [
        "Fonts bundled with Midnight Menagerie",
        "=====================================",
        "",
        "Three families ship in this directory as .woff2 subsets. Each is licensed",
        "under the SIL Open Font License, Version 1.1, reproduced in full below.",
        "The filenames are the Google Fonts subset hashes; `game/src/ui/fonts.css`",
        "maps them to families.",
        "",
    ]
    for name, head in heads:
        out += [f"{name}", "-" * len(name), head, ""]
    out += [bodies[0], ""]
    return "\n".join(out)


def main(a):
    jobs = [
        (os.path.join(ROOT, "game", "assets", "fonts", "OFL.txt"), build_font_notice),
        (os.path.join(ROOT, "game", "vendor", "LICENSE"),
         lambda: ("three.js r169\n"
                  "https://github.com/mrdoob/three.js\n\n"
                  "Covers vendor/three.module.js and every file under vendor/jsm/.\n"
                  "The jsm addons carry no licence header of their own, which is why\n"
                  "this file sits beside them.\n\n" + get(THREE_LICENSE).replace("\r\n", "\n"))),
    ]
    bad = 0
    for path, make in jobs:
        try:
            text = make()
        except Exception as e:                                  # noqa: BLE001
            print(f"FETCH FAILED  {os.path.relpath(path, ROOT)}  {type(e).__name__}: {e}")
            bad += 1
            continue
        rel = os.path.relpath(path, ROOT).replace("\\", "/")
        if a.check:
            have = open(path, encoding="utf-8").read() if os.path.exists(path) else None
            if have is None:
                print(f"MISSING   {rel}")
                bad += 1
            elif have.replace("\r\n", "\n") != text:
                print(f"DIFFERS   {rel}  (upstream has changed, or the file was edited)")
                bad += 1
            else:
                print(f"OK        {rel}  {len(text)} bytes")
        else:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(text)
            print(f"WROTE     {rel}  {len(text)} bytes")
    return 1 if bad else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="diff against what is committed instead of writing")
    sys.exit(main(ap.parse_args()))
