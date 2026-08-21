"""Semi-competent combat bot driven through the persistent driver's queue.

Reads the rendered hand + engine state, decides, then plays with REAL keyboard
input (Tab / ArrowRight / Enter) so the human input path is what is exercised.

    python tests/playthrough3/bot.py [max_turns]
"""
import json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
MM = os.path.join(HERE, "mm.py")


def send(*steps):
    p = subprocess.run([sys.executable, MM] + list(steps), capture_output=True, text=True)
    try:
        return json.loads(p.stdout)
    except Exception:
        return {"out": [], "raw": p.stdout[:400]}


PROBE = """(function(){
  var s=window.MM.state(); if(s.scene!=='combat') return JSON.stringify({scene:s.scene});
  var sc=window.MM.ctx.scenes.current; var e=sc.engine&&sc.engine.state; if(!e) return JSON.stringify({scene:'combat',boot:1});
  var dom=Array.from(document.querySelectorAll('.mm-card')).filter(function(c){return !c.classList.contains('mm-hand__probe')});
  var inc=0; e.enemies.forEach(function(en){ if(en.hp>0 && en.intent && en.intent.damage) inc += (en.intent.damage*(en.intent.hits||1)); });
  return JSON.stringify({scene:'combat', turn:e.turn, phase:e.phase, over:e.over,
    hp:e.player.hp, maxhp:e.player.maxHp, guard:e.player.block, nerve:e.player.energy,
    inc:inc, engineHand:e.piles.hand.length, domHand:dom.length,
    hand:dom.map(function(c){return {u:c.dataset.uid, l:c.getAttribute('aria-label')||''}}),
    enemies:e.enemies.map(function(en){return {hp:en.hp, g:en.block}})});
})()"""


def probe():
    r = send("jsawait:" + PROBE)
    for o in r.get("out", []):
        if "r" in o:
            try:
                return json.loads(o["r"])
            except Exception:
                return {"scene": "?", "raw": o["r"][:200]}
    return {"scene": "?"}


def score(label, st):
    l = label.lower()
    cost = 0
    for tok in label.split(","):
        if "nerve" in tok.lower():
            try: cost = int(tok.strip().split()[0])
            except Exception: pass
    guardish = "guard" in l
    attack = ", attack," in l
    need_guard = st["inc"] > st["guard"]
    s = 0
    if cost == 0: s += 30
    if guardish and need_guard: s += 40
    if attack and not need_guard: s += 25
    if attack and need_guard: s += 5
    if "fetch" in l or "put a non-" in l or "dig up" in l: s -= 15
    return s, cost


def play_turn(st):
    for _ in range(8):
        st = probe()
        if st.get("scene") != "combat" or st.get("over") or st.get("phase") != "player":
            return st
        hand = st.get("hand", [])
        if not hand:
            break
        opts = []
        for i, c in enumerate(hand):
            s, cost = score(c["l"], st)
            if cost <= st["nerve"]:
                opts.append((s, i, cost, c["l"][:22]))
        if not opts:
            break
        opts.sort(reverse=True)
        _, idx, cost, name = opts[0]
        steps = ["movexy:1400,150", "key:Tab"] + ["key:ArrowRight"] * idx + \
                ["key:Enter", "wait:0.55", "key:Enter", "wait:0.9"]
        send(*steps)
    send("key:e", "wait:3.2")
    return probe()


def main():
    maxturns = int(sys.argv[1]) if len(sys.argv) > 1 else 14
    st = probe()
    for t in range(maxturns):
        if st.get("scene") != "combat":
            break
        print(f"turn {st.get('turn')} hp={st.get('hp')} guard={st.get('guard')} "
              f"inc={st.get('inc')} eng/dom={st.get('engineHand')}/{st.get('domHand')} "
              f"enemies={st.get('enemies')}", flush=True)
        if st.get("engineHand") != st.get("domHand"):
            print("  !! HAND DESYNC engine=%s dom=%s" % (st.get('engineHand'), st.get('domHand')), flush=True)
        st = play_turn(st)
    print("end:", json.dumps(st)[:300])


if __name__ == "__main__":
    main()
