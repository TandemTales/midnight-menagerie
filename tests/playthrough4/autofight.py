"""Play out a Scuffle with real mouse input by talking to the running play.py driver.

Policy: block when the on-screen INCOMING forecast would take more than ~30% of
current Courage, otherwise hit the lowest-HP living enemy. Attacks are dragged onto
the target the way a player would; self-cards are clicked. Modal choosers are
answered greedily. Everything is real input — no engine calls.

  python tests/playthrough4/autofight.py [max_turns] [shot_prefix]
"""
import json, re, sys, urllib.request
sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

URL = "http://127.0.0.1:8899/cmd"
NL = chr(10)


def send(prog):
    req = urllib.request.Request(URL, data=prog.encode("utf8"))
    return json.loads(urllib.request.urlopen(req, timeout=600).read().decode("utf8"))


SNAP = ("eval:(()=>{const s=window.MM.state();const q=x=>document.querySelector(x);"
        "const en=[...document.querySelectorAll('.enemy')].map(e=>{const r=e.getBoundingClientRect();"
        "return {id:e.dataset.id,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height*0.42),"
        "dead:e.className.indexOf('is-dead')>=0,t:String(e.innerText).replace(/\\s+/g,' ')}});"
        "const cards=[...document.querySelectorAll('.mm-hand .mm-card')].filter(c=>c.dataset.uid).map(c=>{"
        "const r=c.getBoundingClientRect();return {uid:c.dataset.uid,type:c.dataset.type,cls:c.className,"
        "lab:c.getAttribute('aria-label'),x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height*0.8)}});"
        "const inc=q('.cb-incoming');"
        "return {scene:s.scene,courage:s.run?s.run.courage:0,"
        "nerve:String(q('.cb-nerve')?q('.cb-nerve').textContent:'').replace(/\\s+/g,' '),"
        "inc:inc?String(inc.innerText).replace(/\\s+/g,' '):'',"
        "enemies:en,cards:cards,"
        "chooser:document.querySelector('.cb-chooser__ok')?[...document.querySelectorAll('.cb-choice')].length:0}})()")


def snap():
    return send(SNAP)["eval"][0]


def hp_of(t):
    m = re.search(r"(\d+) /(\d+)", t)
    return int(m.group(1)) if m else 999


def clear_chooser(st):
    if not st["chooser"]:
        return False
    print("   [chooser] %d options" % st["chooser"])
    for i in range(st["chooser"]):
        send('click:.cb-choice[data-index="%d"]' % i)
        d = send("eval:document.querySelector('.cb-chooser__ok') ? "
                 "document.querySelector('.cb-chooser__ok').disabled : null")["eval"][0]
        if d is False:
            break
    send("click:.cb-chooser__ok" + NL + "wait:1.2")
    if snap()["chooser"]:
        print("   [chooser] *** STILL OPEN AFTER CONFIRM -- SOFTLOCK ***")
    return True


DEFENSIVE = ("Guard", "Reattach")


def main():
    maxturns = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    prefix = sys.argv[2] if len(sys.argv) > 2 else None
    errors = []
    for turn in range(maxturns):
        st = snap()
        if st["scene"] != "combat":
            print("[exit] scene=%s after %d turns" % (st["scene"], turn))
            break
        print("T%d: nerve=%s courage=%s inc='%s' enemies=%s"
              % (turn, st["nerve"], st["courage"], st["inc"][:46],
                 [e["t"][:34] for e in st["enemies"]]))
        through = 0
        mm = re.findall(r"\d+", st["inc"])
        if mm:
            through = int(mm[-1]) if "more Guard" not in st["inc"] else int(mm[-2]) if len(mm) > 1 else 0
        need_block = ("LETHAL" in st["inc"]) or through > max(8, st["courage"] * 0.45)
        hits = {}
        for _ in range(10):
            st = snap()
            if st["scene"] != "combat":
                break
            if clear_chooser(st):
                continue
            playable = [c for c in st["cards"]
                        if "is-unaffordable" not in c["cls"] and "is-unplayable" not in c["cls"]
                        and "Clutter" not in str(c["lab"])]
            if not playable:
                break

            def key(c):
                d = any(w in str(c["lab"]) for w in DEFENSIVE)
                if need_block:
                    return (0 if d else 1, 0 if c["type"] != "attack" else 1)
                return (0 if c["type"] == "attack" else 1, 0 if d else 1)
            playable.sort(key=key)
            c = playable[0]
            alive = [e for e in st["enemies"] if not e["dead"] and hp_of(e["t"]) > 0]
            # spread hits: several enemies here punish being ignored (Dust Bunny grows)
            alive.sort(key=lambda e: hp_of(e["t"]))   # focus fire: kill one, then the next
            if c["type"] == "attack":
                if not alive:
                    break
                e = alive[0]
                hits[e["id"]] = hits.get(e["id"], 0) + 1
                prog = ('mdown:[data-uid="%s"]' % c["uid"] + NL +
                        "mmove:%d,%d" % (c["x"], c["y"] - 140) + NL +
                        "mmove:%d,%d" % (e["x"], e["y"]) + NL + "wait:0.3" + NL +
                        "mup" + NL + "wait:1.15")
            else:
                prog = "clickxy:%d,%d" % (c["x"], c["y"]) + NL + "wait:1.15"
            r = send(prog)
            errors += r.get("errors", [])
            after = snap()
            same = [c["uid"] for c in after["cards"]] == [c["uid"] for c in st["cards"]]
            if after["nerve"] == st["nerve"] and same and not after["chooser"]:
                print("   [stuck] %s did not resolve; skipping" % str(c["lab"])[:44])
                break
        clear_chooser(snap())
        pre = ("shot:%s-t%d" % (prefix, turn) + NL) if (prefix and turn == 0) else ""
        r = send(pre + "click:#end-turn" + NL + "wait:3.0")
        errors += r.get("errors", [])
    st = snap()
    print("final:", st["scene"], "| courage", st["courage"])
    if errors:
        print("ERRORS:", json.dumps(errors[:10], indent=1))


if __name__ == "__main__":
    main()
