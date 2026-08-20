"""Update the live build-progress page (progress.json). Used by the orchestrator.

  python tools/progress.py event  "message"
  python tools/progress.py wave   2 "Core systems" "optional headline"
  python tools/progress.py piece  combat status=building round=1 gap="..." verdict="..."
"""
import json, sys, datetime, os

P = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "progress.json")


def load():
    return json.load(open(P, encoding="utf-8"))


def save(d):
    d["updated"] = datetime.datetime.now().isoformat(timespec="seconds")
    json.dump(d, open(P, "w", encoding="utf-8"), indent=1)


def event(msg):
    d = load()
    d.setdefault("events", []).append(
        {"t": datetime.datetime.now().isoformat(timespec="seconds"), "msg": msg})
    d["events"] = d["events"][-400:]
    save(d)


def piece(pid, **kw):
    d = load()
    hit = False
    for p in d["pieces"]:
        if p["id"] == pid:
            p.update(kw)
            hit = True
    if not hit:
        raise SystemExit("no such piece: " + pid)
    save(d)


def wave(n, label, headline=None):
    d = load()
    d["wave"] = n
    d["waveLabel"] = label
    if headline:
        d["headline"] = headline
    save(d)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "event":
        event(" ".join(sys.argv[2:]))
    elif cmd == "wave":
        wave(int(sys.argv[2]), sys.argv[3], " ".join(sys.argv[4:]) or None)
    elif cmd == "piece":
        pid = sys.argv[2]
        kv = {}
        for a in sys.argv[3:]:
            k, _, v = a.partition("=")
            kv[k] = int(v) if v.lstrip("-").isdigit() else (None if v == "-" else v)
        piece(pid, **kv)
    else:
        raise SystemExit("unknown command")
    print("ok")
