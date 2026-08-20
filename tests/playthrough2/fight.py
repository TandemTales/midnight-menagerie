"""Play out a combat with real DRAG gestures and a competent policy.

Mouse-clicking a card does nothing in this build (see report) -- drag is the only
mouse path -- so every play here is a 14-step weighted drag from the card to its
target, exactly what a human does.

Policy, in priority order:
  1. If an attack in hand is lethal on some living enemy, take the kill.
  2. Otherwise, if incoming damage this turn is >= 25% of remaining Courage and a
     Guard card is affordable, play Guard first.
  3. Otherwise attack the enemy with the least effective HP.
Prints a per-turn trace so every decision is auditable.
"""
import json, os, re, sys
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from q import send

HERE = os.path.dirname(os.path.abspath(__file__))
SNAP = """(()=>{const nl=String.fromCharCode(10);const q=s=>[...document.querySelectorAll(s)];
 const cards=q(".mm-card").filter(c=>c.dataset.uid).map(c=>{const r=c.getBoundingClientRect();
   return {uid:c.dataset.uid,label:c.getAttribute("aria-label")||"",dis:c.getAttribute("aria-disabled"),
           x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height*0.55)}});
 const es=q(".cb-enemy").map(e=>{const r=e.getBoundingClientRect();
   return {t:e.innerText.split(nl).join("|"),cls:e.className,
           x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height*0.45)}});
 const modal=document.querySelector(".mm-modal,[class*=modal]");
 const mcards=modal?[...modal.querySelectorAll(".mm-card")].map(c=>{const r=c.getBoundingClientRect();
   return {label:c.getAttribute("aria-label")||"",x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height*0.5)}}):[];
 const hudEl=document.querySelector(".mm-hud__courage");
 const inc=document.querySelector("[class*=incoming]");
 return JSON.stringify({scene:window.MM.state().scene,cards,es,
   hud:hudEl?hudEl.getAttribute("aria-label"):"",
   guard:parseInt(((document.querySelector(".cb-player__guard")||{}).innerText)||"0",10)||0,
   nerve:((document.querySelector("[class*=cb-nerve],[class*=nerve]")||{}).innerText||"").split(nl).join(""),
   inc:inc?inc.innerText.split(nl).join(" "):"",
   modal:!!modal, mcards,
   turn:((document.querySelector(".mm-hud__turn,[class*=hud__turn]")||{}).innerText||"")})})()"""


def snap():
    r = send({"op": "jsawait", "expr": SNAP})
    try:
        return json.loads(r["result"])
    except Exception:
        return {"scene": "?", "cards": [], "es": [], "err": r}


def ehp(e):
    m = re.search(r"\|(\d+)\|/(\d+)", e["t"])
    return int(m.group(1)) if m else 999


def eguard(e):
    m = re.match(r"^(\d+)\|", e["t"])
    return 0


def dmg_of(label):
    m = re.search(r"Deal (\d+) damage", label)
    return int(m.group(1)) if m else 0


def is_self(label):
    return "SELF" in label.upper() or ", Skill, " in label and "Gain" in label and "Guard" in label


def incoming(s):
    ns = re.findall(r"\d+", s.get("inc", ""))
    return int(ns[-1]) if ns else 0


def nerve_now(s):
    m = re.match(r"(\d+)\s*/\s*(\d+)", (s.get("nerve") or "").replace("NERVE", ""))
    return int(m.group(1)) if m else 0


def cost_of(label):
    m = re.search(r", (\d+) Nerve", label)
    return int(m.group(1)) if m else 99


def hp_now(s):
    m = re.search(r"Courage (\d+) of (\d+)", s.get("hud", ""))
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)


def play(card, target=None):
    if target:
        send({"op": "dragxy", "x1": card["x"], "y1": card["y"],
              "x2": target["x"], "y2": target["y"], "steps": 14})
    else:
        send({"op": "dragxy", "x1": card["x"], "y1": card["y"],
              "x2": card["x"], "y2": card["y"] - 340, "steps": 14})
    send({"op": "wait", "s": 1.2})


def one_turn(v=True):
    for _ in range(10):
        s = snap()
        if s["scene"] != "combat":
            return s
        live = [e for e in s["es"] if "is-dead" not in e["cls"]]
        if not live:
            send({"op": "wait", "s": 1.5}); return snap()
        if s.get("modal") and s.get("mcards"):
            m = s["mcards"][0]
            if v:
                print("    modal pick:", m["label"][:50])
            send({"op": "clickxy", "x": m["x"], "y": m["y"]})
            send({"op": "wait", "s": 1.0})
            continue
        n = nerve_now(s)
        pl = [c for c in s["cards"] if c["dis"] != "true" and cost_of(c["label"]) <= n]
        if not pl:
            break
        atk = [c for c in pl if ", Attack," in c["label"]]
        gd = [c for c in pl if "Guard" in c["label"] and "Gain" in c["label"]]
        cur, mx = hp_now(s)
        inc = incoming(s)
        pick, tgt = None, None
        for c in atk:                                    # 1. lethal?
            for e in live:
                if dmg_of(c["label"]) >= ehp(e):
                    pick, tgt = c, e
                    break
            if pick:
                break
        if not pick and gd and inc and inc - s["guard"] >= 0.25 * max(cur, 1):
            pick = gd[0]                                  # 2. block up
        if not pick:
            pick = atk[0] if atk else pl[0]               # 3. hit the weakest
            if ", Attack," in pick["label"]:
                tgt = sorted(live, key=ehp)[0]
        if tgt is None and ("SELF" not in pick["label"].upper()) and ", Attack," in pick["label"]:
            tgt = live[0]
        if v:
            print(f"    -> {pick['label'][:52]}" + (f"  @{ehp(tgt)}hp" if tgt else ""))
        play(pick, tgt)
    send({"op": "key", "key": "e"})
    send({"op": "wait", "s": 3.4})
    return snap()


def fight(maxturns=30, v=True):
    for t in range(maxturns):
        s = snap()
        if s["scene"] != "combat":
            print("  left combat ->", s["scene"])
            return s
        if v:
            print(f"  T{t}: {s['hud']} guard={s['guard']} nerve={s['nerve']} inc='{s['inc']}' | "
                  + " ; ".join(e["t"] for e in s["es"]))
        one_turn(v)
    return snap()


if __name__ == "__main__":
    fight(int(sys.argv[1]) if len(sys.argv) > 1 else 30)
