"""Walk one map step: clear whatever non-combat screen is up, then take a node.

    python tests/playthrough3/walk.py <nodeIdOrIndex>

Prints the scene it landed in plus the legal nodes if it is back on the map.
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MM = os.path.join(HERE, "mm.py")


def send(*steps):
    p = subprocess.run([sys.executable, MM] + list(steps), capture_output=True, text=True)
    try:
        return json.loads(p.stdout)
    except Exception:
        return {"out": [], "raw": p.stdout[:300]}


def val(r, i=-1):
    outs = [o.get("r") for o in r.get("out", []) if "r" in o]
    return outs[i] if outs else None


def scene():
    return val(send("jsawait:window.MM.state().scene"))


def legal():
    return val(send("jsawait:JSON.stringify(Array.from(document.querySelectorAll('.map-node.is-legal')).map(function(e){return [e.dataset.id||e.getAttribute('data-node')||'',e.getAttribute('aria-label')]}))"))


if __name__ == "__main__":
    want = sys.argv[1]
    s = scene()
    print("scene:", s)
    if s == "reward":
        send("clickxy:800,550", "wait:0.6", "key:Enter", "wait:3.2")
        s = scene(); print("-> ", s)
    if s == "map":
        r = send("jsawait:JSON.stringify(Array.from(document.querySelectorAll('.map-node.is-legal')).map(function(e,i){return i+'|'+(e.dataset.nodeId||e.id||'')+'|'+e.getAttribute('aria-label')}))")
        print("legal:", val(r))
        idx = want
        send("click:.map-node.is-legal >> nth=" + str(idx), "wait:3.2")
        print("-> ", scene())
