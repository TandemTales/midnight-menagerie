"""Run a test against a worktree's own dev server instead of :8777.

    python tools/on_port.py PORT tests/combat-scene/seam.py [the test's args]

Every test under tests/ hard-codes http://localhost:8777 (102 scripts, and not
one reads a port from anywhere), and :8777 is the MAIN checkout's server. So a
test run from a worktree drives dev, not the worktree's branch, and passes
whatever the branch did. This runs the script with every 8777 in its source
replaced by PORT, in memory. Nothing on disk changes, and __file__, sys.argv[0]
and sys.path[0] are the test's own, so the files beside it still resolve.

Only the script named is rewritten. That covers every test today: none of the
102 is imported by another module, and playthrough3's bot and walk spawn
mm.py, which talks to play.py's driver and never names a port.
"""
import os
import re
import sys


def main():
    if len(sys.argv) < 3 or not sys.argv[1].isdigit():
        sys.exit(__doc__)
    port, path = sys.argv[1], os.path.abspath(sys.argv[2])
    with open(path, encoding="utf-8") as f:
        src = f.read()
    n = len(re.findall(r"\b8777\b", src))
    if not n:
        sys.exit(f"on_port: {sys.argv[2]} never names 8777; run it directly")
    print(f"on_port: {sys.argv[2]} on :{port} ({n} x 8777 replaced)", file=sys.stderr)
    sys.argv = [path, *sys.argv[3:]]
    sys.path[0] = os.path.dirname(path)
    code = compile(re.sub(r"\b8777\b", port, src), path, "exec")
    exec(code, {"__name__": "__main__", "__file__": path, "__builtins__": __builtins__})


main()
