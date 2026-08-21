import sys, json, urllib.request
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
prog = sys.stdin.read()
req = urllib.request.Request("http://127.0.0.1:8899/cmd", data=prog.encode("utf8"))
r = json.loads(urllib.request.urlopen(req, timeout=600).read().decode("utf8"))
for k in ("steps","shots","errors"):
    if r.get(k):
        print(f"== {k}:")
        for v in r[k]: print("  ", v if isinstance(v,str) else json.dumps(v)[:300])
if r.get("fps"): print("== fps:", r["fps"])
if r.get("eval"):
    print("== eval:")
    for v in r["eval"]: print(json.dumps(v, indent=1, default=str)[:6000])
if r.get("dom") is not None:
    print("== dom:")
    for d in r["dom"]:
        print(f"  {d['xy']} {d['wh']} {d['s'][:60]} {json.dumps(d['a']) if d['a'] else ''} :: {d['t']}")
if r.get("text"): print("== text:\n" + r["text"][:5000])
if r.get("state"): print("== state:", str(r["state"])[:3000])
c = [l for l in r.get("console",[]) if "[error]" in l or "[warning]" in l]
if c:
    print("== console(warn/err):")
    for l in c[:25]: print("  ", l[:300])
