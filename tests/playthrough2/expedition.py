"""Drive the expedition: combat -> reward -> event -> map -> next room.
Shoots every room. Stops only at rooms the reviewer asked to inspect by hand.
"""
import json, os, sys
try: sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from q import send
import fight as F, walk as W

STOP_AT = {"shop", "rest"}

def shot(n): send({"op":"shot","name":n}); print("    shot", n)

EV = """(()=>{const nl=String.fromCharCode(10);
 const os=[...document.querySelectorAll(".ev-choice,[class*=choice]")].filter(e=>e.getBoundingClientRect().height>20);
 return JSON.stringify({title:((document.querySelector("h1,[class*=title]")||{}).innerText||"").split(nl).join(" "),
  opts:os.map(e=>{const r=e.getBoundingClientRect();return {t:(e.innerText||"").split(nl).join(" | ").slice(0,110),
   dis:e.className.includes("is-locked")||e.className.includes("is-disabled"),
   x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})})})()"""

def do_event(v=True):
    d = json.loads(send({"op":"jsawait","expr":EV})["result"])
    if v:
        print("  EVENT:", d["title"][:60])
        for o in d["opts"]: print("     ", ("[x] " if o["dis"] else "[ ] ") + o["t"])
    live=[o for o in d["opts"] if not o["dis"]]
    if live:
        send({"op":"clickxy","x":live[0]["x"],"y":live[0]["y"]}); send({"op":"wait","s":1.6})
    send({"op":"key","key":"Enter"}); send({"op":"wait","s":9})

def go(steps=14):
    seen=set(); i=0
    while i < steps:
        sc = W.scene()
        if sc == "combat": F.fight(30); continue
        if sc == "reward": W.take_reward(0); continue
        if sc == "event":  do_event(); continue
        if sc == "gameover": print("DIED"); shot("p2-x-gameover"); return
        if sc in STOP_AT: print("  STOP at", sc); return
        if sc == "map":
            s,t = W.step(seen); seen.add(t); i += 1
            print("  -> scene", s, "type", t)
            shot(f"p2-rm{i:02d}-{t}")
            if s in STOP_AT: print("  STOP for manual review at", s, t); return
            continue
        print("unexpected scene", sc); shot("p2-x-unexpected"); return
    print("done", steps)

if __name__ == "__main__":
    go(int(sys.argv[1]) if len(sys.argv)>1 else 14)
