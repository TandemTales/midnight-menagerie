#!/bin/bash
# SERGE baselines for round 42: map, hud-late, atlas, atlas-house, clubhouse, event, piles, settings at both sizes.
# Run from the commit round 42's worktrees are cut from.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r42/judging/r42/boards/SERGE"; mkdir -p "$J"
KID="--seed 7 --companion bones --kid maya"
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/SERGE-$n.png" "shots/SERGE-$n.state.json"
    timeout 600 python tools/shot.py "SERGE-$n" --port 8777 "$@" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/SERGE-$n.state.json'))
    print(1 if d.get('errors') else 0)
except Exception: print(1)")
    # void is NOT retried: the bright map trips shot.py's flash check. Look at it.
    if [ "$v" = "0" ]; then cp "shots/SERGE-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "map$size"         $S --scene map $KID --wait 3
  one "hud-late$size"    $S --scene map $KID --wait 3 --script @tools/shot-scripts/hud-late.js --steps "wait:1"
  one "atlas$size"       $S --scene atlas $KID --wait 3
  one "atlas-house$size" $S --scene atlas $KID --wait 3 --hash all=1
  one "clubhouse$size"   $S --scene clubhouse $KID --wait 3
  one "event$size"       $S --scene event $KID --wait 3 --hash pics=1
  one "piles$size"       $S --scene combat --encounter foyer-14 $KID --wait 5 --steps "click:#draw-pile|wait:1"
  one "settings$size"    $S --scene map $KID --wait 3 --steps "click:.mm-hud__settings|wait:1"
done
echo "--- SERGE: $(ls "$J" | wc -l) of 16 files ---"; ls "$J"
