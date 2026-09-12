"""Run every gate in the tree, one at a time, and say which ones are red.

    python tools/gates.py                 # all of them (slow: the whole battery)
    python tools/gates.py --only check    # just tests/*/check.py, the old sweep
    python tools/gates.py --only run      # just tests/*/run.py
    python tools/gates.py --only extra    # just the ones named neither
    python tools/gates.py --filter coop   # any gate whose path contains "coop"
    python tools/gates.py --list          # print what would run, run nothing

Needs the dev server on :8777 (python tools/devserver.py 8777).

WHY THIS EXISTS
---------------
The handoff's "whole sweep" was `for f in tests/*/check.py`, about forty gates.
There are also 43 `tests/*/run.py` gates that nothing ran as a set, and a third
group named neither - `tests/seams/proof.py`, `tests/coop/rooms.py`,
`tests/combat-scene/seam.py` and friends - that neither list could ever reach.

Every one of those blind spots has cost a round:

  * butler 33/5, governess 39/17 and backpack 80/1 sat red for days on CORRECT
    gameplay, each since a commit that did not run them (2026-09-10 census).
  * `tests/seams/proof.py` sat red from 2026-09-11 06:21 to 11:00 because the
    commit that repriced Boo! (Haunt 2 -> 4) fixed five suites and could not see
    the sixth. It is named `proof.py`, so no sweep reached it.
  * `tests/coop/rooms.py` and `tests/coop/playthrough.py` sat red from
    2026-08-29 on a Companion slug that save had not rescued.

THE LIST CANNOT ROT
-------------------
`EXTRAS` is hand-written, and CONTRACTS trap 60 is about exactly that: a
hand-kept list of what exists goes stale, so it needs a checker in the same
commit. Every run scans `tests/*/*.py` for entry points that print a `RESULT:`
line, and reports any that are neither `check.py`, `run.py`, nor in `EXTRAS`.
Add it to `EXTRAS` or rename it; the scan is what stops the next `proof.py`.

Exit code: 0 only when every gate that ran exited 0 and no unlisted entry point
was found. Known-red gates are NOT special-cased here on purpose - a gate that
is allowed to be red belongs in its own file's docstring, not in the runner.
"""
import argparse
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
URL = "http://localhost:8777/game/index.html"
PER_GATE_TIMEOUT = 900

# Entry points that print RESULT and are named neither check.py nor run.py.
# The scan below fails if this list is missing one.
EXTRAS = [
    "tests/seams/proof.py",
    "tests/combat-scene/seam.py",
    "tests/coop/lobby.py",
    "tests/coop/matedeck.py",
    "tests/coop/selectscreen.py",
    "tests/coop/hotseat.py",
    "tests/coop/rooms.py",
    "tests/coop/playthrough.py",
    "tests/audio/cues.py",
    "tests/sprites/clips.py",
    "tests/enemies/audit.py",
]

# Long simulations and probes: they print RESULT but are instruments, not gates.
# Each one names why it is not in the battery.
NOT_GATES = {
    "tests/critic-design/sim.py": "the balance simulator - a reading, not a pass/fail",
    "tests/critic-design/ladder.py": "ladder sweep, minutes per run",
    "tests/critic-design/sweep.py": "parameter sweep, minutes per run",
    "tests/critic-design/lab.py": "interactive lab",
    "tests/critic-design/anchor.py": "balance anchor, run beside sim.py",
    "tests/critic-design/party-boss.py": "party balance reading",
    "tests/critic-design/party-ledger.py": "party balance reading",
    "tests/critic-design/party-turns.py": "party balance reading",
    "tests/run/probe.py": "single-seed probe for tests/run",
    "tests/backpack/balance.py": "balance reading",
    "tests/coop/balance.py": "balance reading",
    "tests/enemies/engine-audit.html": "page, not a script",
    "tests/critic-cardfeel/pass2.py": "card-feel pass, run with its own runner",
    "tests/critic-cardfeel/pass3.py": "card-feel pass, run with its own runner",
    "tests/critic-cardfeel/pass4.py": "card-feel pass, run with its own runner",
    "tests/critic-cardfeel/fps.py": "frame-rate reading",
    "tests/critic-cardfeel/art.py": "art reading",
    "tests/playthrough/play.py": "manual driver",
}
NOT_GATE_DIRS = ("tests/playthrough2/", "tests/playthrough3/", "tests/playthrough4/",
                 "tests/playthrough5/")

RESULT_RE = re.compile(r"RESULT")


def discover():
    """(phase, relative path) for everything that should run, in order."""
    out = []
    for p in sorted(ROOT.glob("tests/*/check.py")):
        out.append(("check", p.relative_to(ROOT).as_posix()))
    for p in sorted(ROOT.glob("tests/*/run.py")):
        out.append(("run", p.relative_to(ROOT).as_posix()))
    for rel in EXTRAS:
        out.append(("extra", rel))
    return out


def unlisted():
    """RESULT-printing entry points that no list reaches. Trap 60's checker."""
    known = {rel for _, rel in discover()}
    found = []
    for p in sorted(ROOT.glob("tests/*/*.py")):
        rel = p.relative_to(ROOT).as_posix()
        if rel in known or rel in NOT_GATES or rel.startswith(NOT_GATE_DIRS):
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if RESULT_RE.search(text):
            found.append(rel)
    return found


def server_up():
    try:
        with urllib.request.urlopen(URL, timeout=10) as r:
            return r.status == 200
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["check", "run", "extra"], help="one phase")
    ap.add_argument("--filter", default="", help="substring of the gate's path")
    ap.add_argument("--list", action="store_true", help="print what would run")
    ap.add_argument("--logs", default=os.path.join(tempfile.gettempdir(), "mm-gates"),
                    help="where full output goes (default: a temp directory)")
    a = ap.parse_args()

    gates = [(ph, rel) for ph, rel in discover()
             if (not a.only or ph == a.only) and a.filter in rel]

    stray = unlisted()
    if a.list:
        for ph, rel in gates:
            print("%-6s %s" % (ph, rel))
        print("\n%d gates" % len(gates))
        for rel in stray:
            print("UNLISTED  %s — prints RESULT and no list runs it" % rel)
        return 1 if stray else 0

    if not server_up():
        print("the dev server is not answering on :8777 — python tools/devserver.py 8777")
        return 2

    os.makedirs(a.logs, exist_ok=True)
    red, t0 = [], time.time()
    print("%d gates, one at a time. Full output in %s\n" % (len(gates), a.logs), flush=True)
    for ph, rel in gates:
        path = ROOT / rel
        if not path.exists():
            print("%-6s %-38s MISSING" % (ph, rel), flush=True)
            red.append(rel)
            continue
        started = time.time()
        try:
            proc = subprocess.run([sys.executable, str(path)], cwd=ROOT, capture_output=True,
                                  text=True, encoding="utf-8", errors="replace",
                                  timeout=PER_GATE_TIMEOUT)
            code, text = proc.returncode, (proc.stdout or "") + (proc.stderr or "")
        except subprocess.TimeoutExpired as e:
            code, text = "TIMEOUT", (e.stdout if isinstance(e.stdout, str) else "")
        name = rel[len("tests/"):-3].replace("/", "__")
        with open(os.path.join(a.logs, name + ".log"), "w", encoding="utf-8") as fh:
            fh.write(text)
        lines = [ln.strip() for ln in text.splitlines() if "RESULT" in ln]
        print("%-6s %-38s exit=%-8s %5.0fs  %s" % (
            ph, rel, code, time.time() - started, lines[-1] if lines else "(no RESULT line)"),
            flush=True)
        if code != 0:
            red.append(rel)

    print("\n%d gates in %.0fs — %d red%s" % (
        len(gates), time.time() - t0, len(red), (": " + ", ".join(red)) if red else ""), flush=True)
    for rel in stray:
        print("UNLISTED  %s — prints RESULT and no list runs it; add it to EXTRAS "
              "or to NOT_GATES with a reason" % rel, flush=True)
    return 1 if (red or stray) else 0


if __name__ == "__main__":
    sys.exit(main())
