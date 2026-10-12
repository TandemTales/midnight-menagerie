#!/bin/bash
# CHALLIS baselines for round 30: hud-late, map and atlas at both sizes.
# Run from the commit round 30's worktrees are cut from.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r30/judging/r30/strip/CHALLIS"; mkdir -p "$J"
KID="--seed 7 --companion bones --kid maya"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/CHALLIS-$n.png" "shots/CHALLIS-$n.state.json"
    timeout 180 python tools/shot.py "CHALLIS-$n" --port 8777 "$@" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/CHALLIS-$n.state.json'))
    print(1 if d.get('errors') else 0)
except Exception: print(1)")
    # void is NOT retried: the bright map trips shot.py's flash check. Look at it.
    if [ "$v" = "0" ]; then cp "shots/CHALLIS-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "hud-late$size" $S --scene map $KID --wait 3 --script @tools/shot-scripts/hud-late.js --steps "wait:1"
  one "map$size"      $S --scene map $KID --wait 3
  one "atlas$size"    $S --scene atlas $KID --wait 3
done
echo "--- CHALLIS: $(ls "$J" | wc -l) of 6 files ---"; ls "$J"
