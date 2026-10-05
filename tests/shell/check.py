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
import shutil
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
NODE = shutil.which("node") or r"C:\Program Files\nodejs\node.exe"


def main():
    try:
        r = subprocess.run([NODE, str(HERE / "steam.test.cjs")], capture_output=True,
                           text=True, encoding="utf-8", errors="replace", timeout=180)
    except (OSError, subprocess.TimeoutExpired) as e:
        print(f"could not run node: {e}")
        print("\nRESULT: 0 passed, 1 failed")
        return 1
    out = r.stdout
    # The shell's own warnings first, so RESULT stays the last line.
    if r.stderr.strip():
        sys.stdout.write(r.stderr)
    sys.stdout.write(out)
    if "RESULT:" not in out:
        print("\nRESULT: 0 passed, 1 failed")
        return 1
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
