"""Gate: no test or tool script may be named after a standard-library module.

    python tests/stdlib-shadow/check.py

Python puts a script's OWN DIRECTORY at the front of `sys.path`. So a file named
`select.py` beside a test does not merely sit there — it BECOMES the `select`
module for every script run from that directory, including the ones the standard
library imports on its way to `asyncio`.

That is not hypothetical. `tests/coop/select.py` shadowed the stdlib `select`
for the whole of `tests/coop/`, and the symptom was unrecognisable as its cause:

    $ python tests/coop/balance.py --n 24
    usage: balance.py [-h] [--party PARTY]
    balance.py: error: unrecognized arguments: --n 24

`balance.py` imports `asyncio`, `asyncio` imports `select`, Python handed it the
test script, and the test script's own argparse ran against `balance.py`'s
argv and exited. **Every one of the six scripts in `tests/coop/` was affected**,
and the two that take no arguments were quietly running the select-screen test
before their own. The documented command in HANDOFF could not run at all.

The class is worth a gate for the same reason the other six exist: nothing fails
loudly, and the error names the wrong file.
"""
import sys, pathlib

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCAN = ["tests", "tools", "game"]

# `sys.stdlib_module_names` is every importable stdlib name, frozen per version.
STD = set(sys.stdlib_module_names)

bad = []
scanned = 0
for top in SCAN:
    for p in sorted((ROOT / top).rglob("*.py")):
        if "__pycache__" in p.parts:
            continue
        scanned += 1
        if p.stem in STD:
            bad.append(p)

for p in bad:
    rel = p.relative_to(ROOT)
    where = rel.parent if str(rel.parent) != "." else "the repo root"
    print(f"  !! {rel}  shadows the stdlib module `{p.stem}` for every script in {where}")

print(f"{scanned} scripts scanned · {len(bad)} shadowing the standard library")
if bad:
    print("\nRename it. A script is run, not imported, so the name is free — and any"
          "\nname that is not a stdlib module works.")
sys.exit(1 if bad else 0)
