"""Walk the expedition: re-plan from the current node each step so the route still
covers every room type, click the next node, then hand off to the right handler.

Stops (returns) whenever it reaches a scene worth looking at by hand -- event,
shop, rest -- so a reviewer can read it instead of skipping it.
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from q import send
import fight as F

WANT = {"scuffle", "curiosity", "safe", "shop", "bigScare", "treasure", "unknown"}


def scene():
    return json.loads(send({"op": "jsawait", "expr": "JSON.stringify(window.MM.state().scene)"})["result"])


def run():
    return json.loads(send({"op": "jsawait", "expr":
        "JSON.stringify({node:window.MM.state().run.currentNodeId,"
        "seen:window.MM.state().run.visitedIds,"
        "types:window.MM.state().run.map.nodes.map(n=>[n.id,n.type,n.roomName,n.next])})"})["result"])


def plan(seen_types):
    r = run()
    N = {t[0]: {"id": t[0], "type": t[1], "name": t[2], "next": t[3]} for t in r["types"]}
    cur = r["node"]
    best = [None]

    def dfs(nid, path, types):
        n = N[nid]
        types = types | {n["type"]}
        path = path + [nid]
        if n["type"] == "boss":
            cov = len((WANT & types) - seen_types) + len(WANT & types)
            if best[0] is None or cov > best[0][0]:
                best[0] = (cov, path)
            return
        for nx in n["next"]:
            dfs(nx, path, types)
    for nx in N[cur]["next"]:
        dfs(nx, [], set())
    return best[0][1], N


def click_node(nid):
    r = send({"op": "jsawait", "expr":
              "(()=>{const e=[...document.querySelectorAll('.map-node')].find(x=>x.dataset.id==='%s');"
              "if(!e)return 'none';const r=e.getBoundingClientRect();"
              "return JSON.stringify([Math.round(r.x+r.width/2),Math.round(r.y+r.height/2),e.className])})()" % nid})["result"]
    if r == "none":
        return False
    x, y, cls = json.loads(r)
    if "is-legal" not in cls:
        return False
    send({"op": "clickxy", "x": x, "y": y})
    send({"op": "wait", "s": 3.5})
    return True


def step(seen_types, v=True):
    """Advance one room. Returns (scene_after, node_type)."""
    p, N = plan(seen_types)
    nxt = p[0]
    if v:
        print(f"map -> {nxt} ({N[nxt]['type']}) {N[nxt]['name']}   route ahead: "
              + ",".join(N[i]['type'] for i in p))
    if not click_node(nxt):
        print("  !! node not clickable:", nxt)
        return scene(), None
    return scene(), N[nxt]["type"]


if __name__ == "__main__":
    seen = set()
    for i in range(20):
        sc = scene()
        if sc != "map":
            print("not on map, scene =", sc); break
        sc, t = step(seen)
        seen.add(t)
        print("  entered scene:", sc, "type:", t)
        if sc == "combat":
            F.fight(30)
        else:
            print("  -> stopping for manual review")
            break


def take_reward(pick=0, v=True):
    """Reward screen: take the pick-th Trick (or skip if pick is None), then leave."""
    r = send({"op": "jsawait", "expr":
              "JSON.stringify([...document.querySelectorAll('.rw-card,.mm-card')].map(c=>{"
              "const b=c.getBoundingClientRect();return {t:(c.innerText||'').split(String.fromCharCode(10)).join(' | ').slice(0,90),"
              "x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height*0.35)}}))"})["result"]
    cards = json.loads(r)
    if v:
        for c in cards:
            print("    reward:", c["t"])
    if cards and pick is not None:
        c = cards[min(pick, len(cards) - 1)]
        send({"op": "clickxy", "x": c["x"], "y": c["y"]})
        send({"op": "wait", "s": 1.2})
    send({"op": "key", "key": "Enter"})
    send({"op": "wait", "s": 9})
