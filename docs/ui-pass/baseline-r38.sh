#!/bin/bash
# VOILE baselines for round 38: the map, the atlas and the atlas with every wing surveyed, at both sizes.
# Run from the commit round 38's worktrees are cut from.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r38/judging/r38/parchment/VOILE"; mkdir -p "$J"
KID="--seed 7 --companion bones --kid maya"
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/VOILE-$n.png" "shots/VOILE-$n.state.json"
    timeout 600 python tools/shot.py "VOILE-$n" --port 8777 "$@" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/VOILE-$n.state.json'))
    print(1 if d.get('errors') else 0)
except Exception: print(1)")
    # void is NOT retried: the bright map trips shot.py's flash check. Look at it.
    if [ "$v" = "0" ]; then cp "shots/VOILE-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "map$size"         $S --scene map $KID --wait 3
  one "atlas$size"       $S --scene atlas $KID --wait 3
  one "atlas-house$size" $S --scene atlas $KID --wait 3 --hash all=1
done
echo "--- VOILE: $(ls "$J" | wc -l) of 6 files ---"; ls "$J"
