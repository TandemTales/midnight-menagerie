"""Client for play.py's persistent session. Sends commands, prints results.

    python tests/playthrough2/q.py '{"op":"shot","name":"p2-title"}' '{"op":"state"}'

Each argument is one JSON command; they run in order and each result is printed.
"""
import json, os, sys, time

SESS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_session")
CMDS = os.path.join(SESS, "cmds.jsonl")
OUT = os.path.join(SESS, "out")


def send(obj, timeout=180):
    line = json.dumps(obj)
    existing = open(CMDS, encoding="utf-8").read().splitlines()
    idx = len(existing)
    with open(CMDS, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    p = os.path.join(OUT, f"{idx}.json")
    t0 = time.time()
    while time.time() - t0 < timeout:
        if os.path.exists(p):
            for _ in range(20):
                try:
                    return json.load(open(p, encoding="utf-8"))
                except Exception:
                    time.sleep(0.05)
        time.sleep(0.08)
    return {"error": "TIMEOUT waiting for " + p}


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    for arg in sys.argv[1:]:
        r = send(json.loads(arg))
        print("### " + arg[:120])
        if r.get("error"):
            print("ERROR:", r["error"])
        res = r.get("result")
        if isinstance(res, str):
            print(res)
        else:
            print(json.dumps(res, indent=1, default=str))
        if r.get("console_errors"):
            print("CONSOLE ERRORS SO FAR:", json.dumps(r["console_errors"][-8:], indent=1))
        print()
