"""The desktop shell's Steam wire, with Steam played by a fake.

    python tests/shell/check.py

Runs `tests/shell/steam.test.cjs` under node: the REAL SteamTransport
(game/src/net/transport.js), the REAL preload.js over mocked Electron IPC and
the REAL SteamHost (shell/steam.js), against a fake steamworks.js that shares
lobbies and P2P queues between several players in one process. No dev server,
no browser, no Steam client, no App ID.

It covers the transport contract tests/net holds every wire to (order per
sender, never to itself, unchanged, unsubscribe, close), the same-second
create race, rooms that must not cross, strangers and stragglers dropped,
joining through a Steam invite (including a stale transport closing late),
a full room, and the real net/lobby.js over the wire.

Prints `RESULT: n passed, m failed`. Exit 0 only when m == 0.
"""
import pathlib
import re
import shutil
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
NODE = shutil.which("node") or r"C:\Program Files\nodejs\node.exe"


def main():
    passed = failed = 0
    for name in ("saves.test.cjs", "steam.test.cjs"):
        try:
            r = subprocess.run([NODE, str(HERE / name)], capture_output=True,
                               text=True, encoding="utf-8", errors="replace", timeout=180)
        except (OSError, subprocess.TimeoutExpired) as e:
            print(f"could not run node: {e}")
            failed += 1
            continue
        out = r.stdout
        # The shell's own warnings first, so RESULT stays the last line.
        if r.stderr.strip():
            sys.stdout.write(r.stderr)
        sys.stdout.write(out.replace("RESULT:", f"{name}:"))
        got = re.search(r"RESULT: (\d+) passed, (\d+) failed", out)
        if got:
            passed += int(got[1])
            failed += int(got[2])
        else:
            failed += 1
    print(f"\nRESULT: {passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
