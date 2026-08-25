"""ev.py — send one JS expression (from a file or argv) to the persistent play server.

    python tests/playthrough5/ev.py "1+1"
    python tests/playthrough5/ev.py -f snippet.js
Avoids all shell/JSON quoting pain.
"""
import sys, json, socket, os

arg = sys.argv[1:]
if arg and arg[0] == "-f":
    js = open(arg[1], encoding="utf-8").read()
else:
    js = " ".join(arg)
payload = json.dumps([{"op": "eval", "js": js}])
s = socket.create_connection(("127.0.0.1", 8899), timeout=300)
s.sendall(payload.encode()); s.shutdown(socket.SHUT_WR)
buf = b""
while True:
    c = s.recv(65536)
    if not c:
        break
    buf += c
sys.stdout.buffer.write(buf + b"\n")
