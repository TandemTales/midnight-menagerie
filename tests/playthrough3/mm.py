"""Client for play.py's file queue.  python mm.py "step" "step" ..."""
import json, os, sys, time, itertools

HERE = os.path.dirname(os.path.abspath(__file__))
QUEUE = os.path.join(HERE, "queue")
os.makedirs(QUEUE, exist_ok=True)

steps = sys.argv[1:]
n = int(time.time() * 1000)
cmd = os.path.join(QUEUE, f"{n}.cmd.json")
done = cmd.replace(".cmd.json", ".done.json")
open(cmd, "w", encoding="utf-8").write(json.dumps({"steps": steps}))
t0 = time.time()
while time.time() - t0 < 180:
    if os.path.exists(done):
        time.sleep(0.08)
        try:
            r = json.loads(open(done, encoding="utf-8").read())
        except Exception:
            time.sleep(0.2); continue
        print(json.dumps(r, indent=1)[:12000])
        sys.exit(0)
    time.sleep(0.1)
print("TIMEOUT waiting for driver")
sys.exit(2)
