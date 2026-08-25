"""drive.py — high-level actions against the persistent play server.

    python tests/playthrough5/drive.py st                  compact combat state
    python tests/playthrough5/drive.py play 2 0            drag hand card 2 onto enemy 0
    python tests/playthrough5/drive.py play 1 self         drag hand card 1 above the threshold
    python tests/playthrough5/drive.py end                 end turn (click)
    python tests/playthrough5/drive.py shot NAME
    python tests/playthrough5/drive.py err
    python tests/playthrough5/drive.py raw '<json ops>'
"""
import sys, json, socket, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.dirname(os.path.abspath(__file__))
CSTATE = open(os.path.join(HERE, "cstate.js"), encoding="utf-8").read()


def send(ops):
    s = socket.create_connection(("127.0.0.1", 8899), timeout=300)
    s.sendall(json.dumps(ops).encode()); s.shutdown(socket.SHUT_WR)
    buf = b""
    while True:
        c = s.recv(65536)
        if not c:
            break
        buf += c
    return json.loads(buf.decode("utf-8"))


CHOOSER = ("(function(){var c=document.querySelector('.cb-chooser');"
           "if(!c)return 0;var r=c.getBoundingClientRect();"
           "return (getComputedStyle(c).display!=='none'&&r.height>4&&getComputedStyle(c).opacity>0.1)?1:0})()")


def state():
    return send([{"op": "eval", "js": CSTATE}])[0]["v"]


def clear_chooser(prefer_ok=True):
    """A chooser modal blocks every click. Accept the first option, else cancel."""
    for _ in range(4):
        if not send([{"op": "eval", "js": CHOOSER}])[0].get("v"):
            return False
        send([{"op": "key", "key": "Enter", "after": 0.8}])
        if not send([{"op": "eval", "js": CHOOSER}])[0].get("v"):
            return True
        send([{"op": "key", "key": "Escape", "after": 0.8}])
    return True


def play(ci, target):
    st = state()
    c = st["cards"][int(ci)]["c"]
    ops = [{"op": "mmove", "x": c[0], "y": c[1], "after": 0.18}, {"op": "mdown", "after": 0.08}]
    if target == "self":
        pts = [(c[0], c[1] - 80), (c[0] - 10, c[1] - 200), (c[0] - 10, 400)]
    else:
        e = st["enemies"][int(target)]["c"]
        pts = [(c[0] + (e[0] - c[0]) * t, c[1] + (e[1] - c[1]) * t) for t in (0.25, 0.55, 0.8, 1.0)]
    for i, (x, y) in enumerate(pts):
        ops.append({"op": "mmove", "x": round(x), "y": round(y), "after": 0.05})
    ops.append({"op": "mmove", "x": round(pts[-1][0]), "y": round(pts[-1][1]), "after": 0.22})
    ops.append({"op": "mup", "after": 0.85})
    ops.append({"op": "mmove", "x": 40, "y": 450, "after": 0.15})
    ops.append({"op": "eval", "js": CSTATE})
    send(ops[:-1])
    clear_chooser()
    return send([{"op": "eval", "js": CSTATE}])[0]["v"]


def auto(maxturns=25, log=None):
    """Play reasonably: block when a hit is coming, otherwise attack the weakest enemy."""
    import re
    out = []
    for t in range(maxturns):
        for _ in range(14):
            st = state()
            if st["scene"] != "combat":
                break
            live = st["enemies"]
            playable = [c for c in st["cards"] if not c["dis"] and "STATUS" not in c["t"]]
            if not playable or not live:
                break
            inc = st.get("incoming") or ""
            m = re.search(r"(\d+) more Guard to stop it all", inc.replace("|", " "))
            leth = "LETHAL" in inc
            need = int(m.group(1)) if m else 0
            guards = [c for c in playable if "Guard" in c["t"]]
            atk = [c for c in playable if "ATTACK" in c["t"]]
            pick = None
            if (leth or need > 0) and guards:
                pick = guards[0]
            elif atk:
                pick = atk[0]
            elif playable:
                pick = playable[0]
            ci = st["cards"].index(pick)
            before = (st["nerve"], len(st["cards"]))
            if "ATTACK" in pick["t"]:
                hp = []
                for i, e in enumerate(live):
                    mm = re.search(r"(\d+) \| /(\d+)", e["t"])
                    hp.append((int(mm.group(1)) if mm else 999, i))
                play(ci, min(hp)[1])
            else:
                play(ci, "self")
            after = state()
            if after["scene"] != "combat":
                break
            if (after["nerve"], len(after["cards"])) == before:
                break
        st = state()
        if st["scene"] != "combat":
            out.append("scene=" + st["scene"]); break
        r = send([{"op": "click", "sel": ".cb-endturn", "after": 2.8},
                  {"op": "mmove", "x": 40, "y": 450, "after": 0.1}, {"op": "eval", "js": CSTATE}])
        st = r[-1].get("v") or {}
        out.append(f"t{t}: {st.get('scene')} {(st.get('hud') or '')[:52]}")
        if st.get("scene") != "combat":
            break
    return out



LEGAL = ("(function(){var o=[];document.querySelectorAll('.map-node.is-legal').forEach(function(n){"
         "var r=n.getBoundingClientRect();o.push([Math.round(r.x+r.width/2),Math.round(r.y+r.height/2),"
         "(n.textContent||'').replace(/[^ -~]/g,'').trim(),n.getAttribute('class')])});return o})()")


def legal():
    return send([{"op": "eval", "js": LEGAL}])[0]["v"]


def go(name):
    for x, y, t, c in legal():
        if name.lower() in t.lower():
            send([{"op": "clickxy", "x": x, "y": y, "after": 3.0}, {"op": "wait", "sec": 2.0}])
            return send([{"op": "eval", "js": "window.MM.state().scene"}])[0]["v"]
    return "NOT FOUND: " + json.dumps(legal())


PREF = ["safe", "curiosity", "shop", "treasure", "rescue", "bigScare", "unknown", "scuffle", "boss"]


def runloop(steps=20, prefer=None, stop_on=("event", "shop", "rest", "gameover")):
    """Drive a whole expedition: fight, take a reward, walk the map."""
    prefer = prefer or PREF
    log = []
    for i in range(steps):
        sc = send([{"op": "eval", "js": "window.MM.state().scene"}])[0]["v"]
        log.append(sc)
        if sc in stop_on:
            break
        if sc == "combat":
            clear_chooser()
            log += auto(30)
        elif sc == "reward":
            send([{"op": "wait", "sec": 1.0}])
            try:
                send([{"op": "click", "sel": ".rw-fan .mm-card", "after": 0.9}])
            except Exception:
                pass
            send([{"op": "click", "text": "LEAVE THE ROOM", "after": 3.0}, {"op": "wait", "sec": 3.0}])
        elif sc == "map":
            ns = legal()
            if not ns:
                log.append("NO LEGAL NODES"); break
            best = None
            for want in prefer:
                for x, y, t, c in ns:
                    if "--" + want in c:
                        best = (x, y, t); break
                if best:
                    break
            if not best:
                x, y, t, c = ns[0]; best = (x, y, t)
            log.append("-> " + best[2])
            send([{"op": "clickxy", "x": best[0], "y": best[1], "after": 3.0}, {"op": "wait", "sec": 2.5}])
        else:
            log.append("STOP at " + sc); break
    return log


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[0] == "st":
        print(json.dumps(state(), ensure_ascii=False))
    elif a[0] == "play":
        print(json.dumps(play(a[1], a[2]), ensure_ascii=False))
    elif a[0] == "end":
        r = send([{"op": "click", "sel": ".cb-endturn", "after": 2.6},
                  {"op": "mmove", "x": 40, "y": 450, "after": 0.1},
                  {"op": "eval", "js": CSTATE}])
        print(json.dumps(r[-1].get("v", r[-1]), ensure_ascii=False))
    elif a[0] == "shot":
        print(json.dumps(send([{"op": "shot", "name": a[1]}])))
    elif a[0] == "err":
        print(json.dumps(send([{"op": "errors"}]), ensure_ascii=False))
    elif a[0] == "auto":
        print(json.dumps(auto(int(a[1]) if len(a)>1 else 25), ensure_ascii=False))
    elif a[0] == "legal":
        print(json.dumps(legal(), ensure_ascii=False))
    elif a[0] == "go":
        print(go(a[1]))
    elif a[0] == "loop":
        print(json.dumps(runloop(int(a[1]) if len(a)>1 else 20), ensure_ascii=False))
    elif a[0] == "raw":
        print(json.dumps(send(json.loads(a[1])), ensure_ascii=False))
