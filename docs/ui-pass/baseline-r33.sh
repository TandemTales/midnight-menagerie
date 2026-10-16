#!/bin/bash
# TAFFETA baselines for round 33: settings, piles, shop and hud-late at both sizes.
# Run from the commit round 33's worktrees are cut from.
set -u
cd "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie" || exit 1
curl -s -m 5 -o /dev/null http://localhost:8777/ || {
  echo "8777 is not answering. Start it:  python tools/devserver.py 8777"; exit 1; }
J="C:/UILOOP/r33/judging/r33/controls/TAFFETA"; mkdir -p "$J"
KID="--seed 7 --companion bones --kid maya"
one () {
  n="$1"; shift
  for try in 1 2 3; do
    rm -f "shots/TAFFETA-$n.png" "shots/TAFFETA-$n.state.json"
    timeout 180 python tools/shot.py "TAFFETA-$n" --port 8777 "$@" >/dev/null 2>&1
    v=$(python -c "
import json
try:
    d=json.load(open('shots/TAFFETA-$n.state.json'))
    print(1 if d.get('errors') else 0)
except Exception: print(1)")
    # void is NOT retried: the bright map trips shot.py's flash check. Look at it.
    if [ "$v" = "0" ]; then cp "shots/TAFFETA-$n.png" "$J/$n.png"; echo "ok   $n"; return; fi
    echo "retry $n"; sleep 20
  done
  echo "FAILED $n"
}
for size in "" "-1280"; do
  S=""; [ -n "$size" ] && S="--w 1280 --h 800"
  one "settings$size" $S --scene map $KID --wait 3 --steps "click:.mm-hud__settings|wait:1"
  one "piles$size"    $S --scene combat --encounter foyer-14 $KID --wait 5 --steps "click:#draw-pile|wait:1"
  one "shop$size"     $S --scene shop $KID --wait 3
  one "hud-late$size" $S --scene map $KID --wait 3 --script @tools/shot-scripts/hud-late.js --steps "wait:1"
done
echo "--- TAFFETA: $(ls "$J" | wc -l) of 8 files ---"; ls "$J"
