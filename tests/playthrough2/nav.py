"""Map navigation helpers: plan a route that covers every room type, walk it by real clicks."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from q import send


def mapdata():
    return json.loads(send({"op": "jsawait", "expr": "JSON.stringify(window.MM.state().run.map)"})["result"])


def route(need=("scuffle", "curiosity", "safe", "shop", "bigScare")):
    m = mapdata()
    N = {n["id"]: n for n in m["nodes"]}
    need = set(need)
    best = [None]

    def dfs(nid, path, types):
        n = N[nid]
        types = types | {n["type"]}
        path = path + [nid]
        if n["type"] == "boss":
            cov = len(need & types)
            if best[0] is None or cov > best[0][0]:
                best[0] = (cov, path)
            return
        for nx in n["next"]:
            dfs(nx, path, types)
    for s in m["startIds"]:
        dfs(s, [], set())
    return best[0][1], N


def node_xy(nid):
    r = send({"op": "jsawait", "expr":
              "(()=>{const e=document.querySelector('[data-node-id=\"%s\"]')||"
              "[...document.querySelectorAll('.map-node')].find(x=>x.dataset.id==='%s');"
              "if(!e)return 'none';const r=e.getBoundingClientRect();"
              "return JSON.stringify([Math.round(r.x+r.width/2),Math.round(r.y+r.height/2),e.className])})()"
              % (nid, nid)})["result"]
    return None if r == "none" else json.loads(r)


def legal():
    r = send({"op": "jsawait", "expr":
              "JSON.stringify([...document.querySelectorAll('.map-node')].filter(e=>e.className.includes('is-legal'))"
              ".map(e=>{const r=e.getBoundingClientRect();return {id:e.dataset.id||e.getAttribute('data-node-id'),"
              "txt:e.innerText.trim(),x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}}))"})["result"]
    return json.loads(r)


if __name__ == "__main__":
    p, N = route()
    for nid in p:
        print(nid, N[nid]["type"], N[nid]["roomName"])
    print(json.dumps(legal(), indent=1))
