"""Walk a whole planned route through a wing, one node at a time, holding the same
browser. Fights are played by autofight; every other scene is screenshotted, dumped
as text, and then advanced by clicking its primary continue control.

  python tests/playthrough4/expedition.py p5-70 foyer-1-1 foyer-2-1 ...
"""
import importlib.util, json, os, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("af", os.path.join(HERE, "autofight.py"))
af = importlib.util.module_from_spec(spec)
spec.loader.exec_module(af)
send, NL = af.send, chr(10)

# Text of the buttons that mean "I am done with this screen", most-specific first.
CONTINUE = ["LEAVE THE ROOM", "BACK TO THE BLUEPRINT", "BACK TO THE HOUSE",
            "CONTINUE", "MOVE ON", "GO ON", "DONE", "LEAVE IT BE", "CLOSE"]

# On a Curiosity / Rescue, actually make a choice instead of walking away.
CHOICE_SEL = ".ev-choice, .ev-option, [class*=choice]:not(.cb-choice)"


def scene():
    return send("eval:window.MM.state().scene")["eval"][0]


def dump(tag, n=1400):
    r = send("shot:%s" % tag + NL + "text" + NL + "fps")
    print("   fps", (r.get("fps") or {}).get("fps"))
    txt = (r.get("text") or "")[:n]
    print("   ---")
    print("   " + txt.replace("\n", " / "))
    if r.get("errors"):
        print("   ERRORS:", r["errors"])
    return txt


def buttons():
    js = ("eval:[...document.querySelectorAll('button')].filter(b=>{const x=b.getBoundingClientRect();"
          "return x.width>4 && x.height>4 && getComputedStyle(b).visibility!=='hidden'})"
          ".map(b=>{const x=b.getBoundingClientRect();return [b.className,"
          "String(b.innerText).replace(/\s+/g,' ').slice(0,60),"
          "Math.round(x.x+x.width/2),Math.round(x.y+x.height/2)]})")
    return send(js)["eval"][0]


def main():
    tag = sys.argv[1]
    route = sys.argv[2:]
    resolve(tag, -1, "pre")
    for i, node in enumerate(route):
        sc = scene()
        if sc != "map":
            print("!! expected map, got", sc)
            dump("%s-%02d-UNEXPECTED" % (tag, i))
            return
        r = send('click:[data-id="%s"]' % node + NL + "wait:4.5" + NL + "eval:window.MM.state().scene")
        sc = r["eval"][0] if r["eval"] else "?"
        bad = [s for s in r["steps"] if s.startswith("FAIL")]
        print("== %02d %s -> %s %s" % (i, node, sc, bad if bad else ""))
        if r.get("errors"):
            print("   ENTER-ERRORS:", r["errors"])
        if sc == "combat":
            dump("%s-%02d-%s-enter" % (tag, i, node))
            af.main.__globals__["sys"].argv = ["af", "22", None]
            af.main()
            send("wait:1.6")
        if resolve(tag, i, node):
            return
    print("route done, scene =", scene())


def resolve(tag, i, node):
        for _ in range(8):
            sc = scene()
            if sc == "map":
                break
            if sc == "gameover":
                print("!! DIED at", node)
                dump("%s-%02d-DEATH" % (tag, i))
                return True
            dump("%s-%02d-%s-%s" % (tag, i, node, sc))
            if sc == "reward":
                sl = send("eval:[...document.querySelectorAll('.rw-slot')].map(e=>{"
                          "const r=e.getBoundingClientRect();return [e.dataset.cardId,"
                          "String(e.innerText).replace(/\s+/g,' ').slice(0,70),"
                          "Math.round(r.x+r.width/2),Math.round(r.y+r.height/2)]})")["eval"][0]
                if sl:
                    atk = [c for c in sl if "ATTACK" in c[1]] or sl
                    print("   [reward] taking", atk[0][1][:44])
                    send("clickxy:%d,%d" % (atk[0][2], atk[0][3]) + NL + "wait:1.2")
            if sc == "safe" or sc == "rest":
                pass
            if sc == "event":
                ch = [b for b in buttons() if 200 < b[3] < 790 and b[1].strip()
                      and "LOCK" not in b[0].upper()]
                if ch:
                    print("   [event] choices:", [c[1][:40] for c in ch])
                    print("   [event] taking:", ch[-1][1][:50])
                    send("clickxy:%d,%d" % (ch[-1][2], ch[-1][3]) + NL + "wait:2.5")
                    dump("%s-%02d-%s-event-after" % (tag, i, node), 900)
            bs = buttons()
            pick = None
            for want in CONTINUE:
                for b in bs:
                    if b[1].upper().startswith(want):
                        pick = b
                        break
                if pick:
                    break
            if not pick:
                cands = [b for b in bs if b[1].strip() and b[3] > 780]
                if cands:
                    pick = cands[-1]
                    print("   [fallback continue]", pick[1][:40])
                else:
                    print("   [no continue button]", [b[1] for b in bs][-12:])
                    return True
            print("   -> clicking", pick[1][:40], "at", pick[2], pick[3])
            send("clickxy:%d,%d" % (pick[2], pick[3]) + NL + "wait:2.5")
        return False


if __name__ == "__main__":
    main()
