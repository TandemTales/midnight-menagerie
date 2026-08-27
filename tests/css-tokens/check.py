#!/usr/bin/env python3
"""Every `var(--x)` names a custom property that exists. OWNER: frontend.

    python tests/css-tokens/check.py [--root game/src] [--verbose]

A gate against a bug class this project has now been bitten by twice.

WHY THIS EXISTS
---------------
CSS does not complain about `var(--text-low)` when the token is `--text-lo`. The
declaration is simply dropped, the element keeps whatever it inherited, and
nothing appears anywhere — no console output, no error, no visual cue beyond
"that looks a bit plain".

The two-Kid Safe Room shipped with **sixteen** invented tokens and rendered as
unstyled text; it was caught by looking at the screen, because nothing else
could catch it. A `--text-low` slipped into a new intent chip while this gate
was being written, from the same hand that had just read the trap in HANDOFF §6.

WHAT IT CHECKS
--------------
Collect every custom property DEFINED anywhere under the root — in a stylesheet
(`--x: value`), and in JS, since plenty are handed to an element at runtime
(`el.style.setProperty('--i', …)`, `style="--rot:${r}deg"`). Then flag every
`var(--x)` whose name is defined nowhere at all. Stylesheets in this project are
global and never unload, so a token defined in one file is genuinely reachable
from another — the check is "does this name exist anywhere", which is precisely
the typo class and nothing wider.

`var(--x, fallback)` still has to name a real token: a fallback is a default,
not a licence to invent a name.

A `/* css-tokens: ok */` comment on the line silences a deliberate one (a token
supplied at runtime by JS, say).

Exit code 0 only when every reference resolves.
"""
import argparse
import pathlib
import re
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = pathlib.Path(__file__).resolve().parents[2]

DEF_RE = re.compile(r"(--[A-Za-z0-9_-]+)\s*:")
USE_RE = re.compile(r"var\(\s*(--[A-Za-z0-9_-]+)")
COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)
# Set from JS: `setProperty('--x', …)`, or written into an inline style string
# as `--x:` — both are real definitions and neither lives in a stylesheet.
JS_SET_RE = re.compile(r"""setProperty\(\s*['\"`](--[A-Za-z0-9_-]+)""")
JS_INLINE_RE = re.compile(r"(--[A-Za-z0-9_-]+)\s*:")


def strip_comments(text):
    """Blank comment bodies, keeping length so line numbers stay true."""
    def blank(m):
        return "".join(ch if ch == "\n" else " " for ch in m.group(0))
    return COMMENT_RE.sub(blank, text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="game/src")
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()

    root = ROOT / a.root
    files = sorted(root.rglob("*.css"))

    defined = set()
    for f in files:
        defined.update(DEF_RE.findall(strip_comments(f.read_text(encoding="utf-8"))))
    # …and everything JS hands to an element at runtime.
    js = sorted(root.rglob("*.js"))
    for f in js:
        src = f.read_text(encoding="utf-8")
        defined.update(JS_SET_RE.findall(src))
        # `--x:` inside a JS file is only ever an inline style being built.
        defined.update(JS_INLINE_RE.findall(src))

    problems = []
    uses = 0
    for f in files:
        raw = f.read_text(encoding="utf-8")
        code = strip_comments(raw)
        lines = raw.splitlines()
        for m in USE_RE.finditer(code):
            uses += 1
            name = m.group(1)
            if name in defined:
                continue
            line = code[:m.start()].count("\n") + 1
            src = lines[line - 1] if line - 1 < len(lines) else ""
            if "css-tokens: ok" in src:
                continue
            problems.append({
                "file": str(f.relative_to(ROOT)).replace("\\", "/"),
                "line": line, "name": name, "text": src.strip(),
            })

    print(f"css-tokens: {len(files)} sheets + {len(js)} scripts, "
          f"{len(defined)} tokens defined, {uses} references")
    if not problems:
        print("RESULT: 0 undefined tokens")
        return 0

    # A near-miss is almost always the real answer, so name it.
    def nearest(name):
        best, score = None, 0
        for d in defined:
            common = len(set(name) & set(d))
            same = sum(1 for x, y in zip(name, d) if x == y)
            s = same * 2 + common
            if d.startswith(name[:6]) or name.startswith(d[:6]):
                s += 10
            if s > score:
                best, score = d, s
        return best

    for p in problems:
        near = nearest(p["name"])
        print(f"  {p['file']}:{p['line']}  var({p['name']}) is defined nowhere"
              + (f" — did you mean {near}?" if near else ""))
        print(f"      {p['text']}")
    print(f"RESULT: {len(problems)} undefined tokens")
    print("CSS drops the whole declaration silently. Nothing appears on screen and "
          "nothing appears in the console.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
