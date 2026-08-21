"""Walk one map node: click it, screenshot whatever scene it opens, and if it is a
Scuffle hand off to autofight. Non-combat scenes are dumped as text so the reviewer
can read exactly what the screen offered.

  python tests/playthrough4/walk.py foyer-0-3 p5-60
"""
import json, sys, urllib.request, importlib.util, os
sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("af", os.path.join(HERE, "autofight.py"))
af = importlib.util.module_from_spec(spec)
spec.loader.exec_module(af)
send = af.send
NL = chr(10)


def main():
    node = sys.argv[1]
    tag = sys.argv[2]
    r = send('click:[data-id="%s"]' % node + NL + "wait:4.0" + NL +
             "eval:window.MM.state().scene" + NL + "shot:%s-enter" % tag + NL + "fps")
    for s in r["steps"]:
        if s.startswith("FAIL"):
            print(" ", s)
    scene = r["eval"][0] if r["eval"] else "?"
    print("node", node, "-> scene", scene, "| fps", (r.get("fps") or {}).get("fps"))
    if r.get("errors"):
        print("ERRORS:", r["errors"])
    if scene == "combat":
        af.main.__globals__["sys"].argv = ["af", "18", tag]
        af.main()
        r2 = send("wait:1.5" + NL + "eval:window.MM.state().scene" + NL +
                  "shot:%s-after" % tag + NL + "text")
        print("after fight ->", r2["eval"][0])
        print((r2.get("text") or "")[:900])
    else:
        r2 = send("text")
        print((r2.get("text") or "")[:1600])


if __name__ == "__main__":
    main()
